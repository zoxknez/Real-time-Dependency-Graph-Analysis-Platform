// Outbox repository - database operations for transactional outbox pattern
//
// This module handles all database operations related to the outbox table,
// implementing the Transactional Outbox pattern for reliable event publishing.

use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use sqlx::{PgExecutor, PgPool, Postgres, Row, Transaction};
use tracing::{debug, info, warn};

/// Status of an outbox event
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "text")]
pub enum OutboxStatus {
    #[sqlx(rename = "pending")]
    Pending,
    #[sqlx(rename = "publishing")]
    Publishing,
    #[sqlx(rename = "published")]
    Published,
    #[sqlx(rename = "failed")]
    Failed,
    #[sqlx(rename = "deadletter")]
    DeadLetter,
}

impl std::fmt::Display for OutboxStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OutboxStatus::Pending => write!(f, "pending"),
            OutboxStatus::Publishing => write!(f, "publishing"),
            OutboxStatus::Published => write!(f, "published"),
            OutboxStatus::Failed => write!(f, "failed"),
            OutboxStatus::DeadLetter => write!(f, "deadletter"),
        }
    }
}

/// Outbox event to be published
#[derive(Debug, Clone)]
pub struct OutboxEvent {
    pub event_id: String,
    pub event_type: String,
    pub topic: String,
    pub partition_key: String,
    pub payload: Vec<u8>,
    pub headers: serde_json::Value,
}

/// Outbox row as stored in database
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OutboxRow {
    pub id: i64,
    pub event_id: String,
    pub event_type: String,
    pub topic: String,
    pub partition_key: String,
    pub payload: Vec<u8>,
    pub headers: serde_json::Value,
    pub status: String,
    pub attempts: i32,
    pub next_retry_at: DateTime<Utc>,
    pub locked_by: Option<String>,
    pub locked_at: Option<DateTime<Utc>>,
    pub published_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub last_error: Option<String>,
}

/// Repository for outbox operations
pub struct OutboxRepo {
    pool: PgPool,
}

impl OutboxRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Insert a single event into the outbox within a transaction
    ///
    /// If an event with the same event_id already exists, this is a no-op (idempotent).
    /// This is safe because event_id is deterministic based on the event content.
    pub async fn insert<'a, E>(&self, executor: E, event: &OutboxEvent) -> Result<()>
    where
        E: PgExecutor<'a>,
    {
        sqlx::query(
            r#"
            INSERT INTO ingestion_outbox (
                event_id, event_type, topic, partition_key, payload, headers
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (event_id) DO NOTHING
            "#,
        )
        .bind(&event.event_id)
        .bind(&event.event_type)
        .bind(&event.topic)
        .bind(&event.partition_key)
        .bind(&event.payload)
        .bind(&event.headers)
        .execute(executor)
        .await?;

        debug!(
            event_id = %event.event_id,
            event_type = %event.event_type,
            topic = %event.topic,
            "Inserted event into outbox"
        );

        Ok(())
    }

    /// Insert multiple events into the outbox within a transaction
    ///
    /// This is more efficient than calling insert() multiple times.
    /// All events are inserted atomically within the transaction.
    pub async fn insert_many(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        events: &[OutboxEvent],
    ) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }

        for event in events {
            self.insert(&mut **tx, event).await?;
        }

        info!(count = events.len(), "Inserted events into outbox");
        Ok(())
    }

    /// Claim a batch of pending events for publishing (with SKIP LOCKED)
    ///
    /// This uses SKIP LOCKED to allow multiple publishers to work in parallel
    /// without blocking each other. Each publisher gets a different batch.
    ///
    /// Returns events that are now locked by this worker.
    pub async fn claim_batch(&self, worker_id: &str, batch_size: i32) -> Result<Vec<OutboxRow>> {
        let rows = sqlx::query_as::<_, OutboxRow>(
            r#"
            UPDATE ingestion_outbox
            SET status = 'publishing',
                locked_by = $1,
                locked_at = NOW()
            WHERE id IN (
                SELECT id FROM ingestion_outbox
                WHERE status = 'pending'
                  AND next_retry_at <= NOW()
                ORDER BY created_at ASC
                LIMIT $2
                FOR UPDATE SKIP LOCKED
            )
            RETURNING 
                id, event_id, event_type, topic, partition_key,
                payload, headers, status, attempts, next_retry_at,
                locked_by, locked_at, published_at, created_at, last_error
            "#,
        )
        .bind(worker_id)
        .bind(batch_size)
        .fetch_all(&self.pool)
        .await?;

        if !rows.is_empty() {
            debug!(
                worker_id = %worker_id,
                count = rows.len(),
                "Claimed outbox batch"
            );
        }

        Ok(rows)
    }

    /// Mark an event as successfully published
    pub async fn mark_published(&self, event_id: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE ingestion_outbox
            SET status = 'published',
                published_at = NOW(),
                locked_by = NULL,
                locked_at = NULL
            WHERE event_id = $1
            "#,
        )
        .bind(event_id)
        .execute(&self.pool)
        .await?;

        debug!(event_id = %event_id, "Marked event as published");
        Ok(())
    }

    /// Mark an event as failed and schedule retry with exponential backoff
    ///
    /// Backoff schedule:
    /// - Attempt 1: 1 minute
    /// - Attempt 2: 2 minutes
    /// - Attempt 3: 5 minutes
    /// - Attempt 4: 10 minutes
    /// - Attempt 5: 30 minutes
    /// - Attempt 6+: 1 hour (capped)
    pub async fn mark_failed(&self, event_id: &str, error: &str, max_attempts: i32) -> Result<()> {
        let row = sqlx::query(
            r#"
            UPDATE ingestion_outbox
            SET attempts = attempts + 1,
                last_error = $2,
                locked_by = NULL,
                locked_at = NULL
            WHERE event_id = $1
            RETURNING attempts
            "#,
        )
        .bind(event_id)
        .bind(error)
        .fetch_one(&self.pool)
        .await?;

        let attempts: i32 = row.try_get("attempts")?;

        // Calculate backoff
        let backoff_minutes = match attempts {
            1 => 1,
            2 => 2,
            3 => 5,
            4 => 10,
            5 => 30,
            _ => 60, // 1 hour cap
        };

        // Determine new status
        let new_status = if attempts >= max_attempts {
            "deadletter"
        } else {
            "pending"
        };

        let next_retry = Utc::now() + Duration::minutes(backoff_minutes);

        sqlx::query(
            r#"
            UPDATE ingestion_outbox
            SET status = $2,
                next_retry_at = $3
            WHERE event_id = $1
            "#,
        )
        .bind(event_id)
        .bind(new_status)
        .bind(next_retry)
        .execute(&self.pool)
        .await?;

        if new_status == "deadletter" {
            warn!(
                event_id = %event_id,
                attempts = attempts,
                error = %error,
                "Event moved to dead letter queue"
            );
        } else {
            debug!(
                event_id = %event_id,
                attempts = attempts,
                next_retry_minutes = backoff_minutes,
                "Event marked as failed, will retry"
            );
        }

        Ok(())
    }

    /// Release stuck/orphaned locks (e.g., from crashed workers)
    ///
    /// This should be called periodically to reset events that have been
    /// locked for too long without being published or failed.
    pub async fn release_stuck_locks(&self, timeout_minutes: i32) -> Result<u64> {
        let result = sqlx::query(
            r#"
            UPDATE ingestion_outbox
            SET status = 'pending',
                locked_by = NULL,
                locked_at = NULL,
                attempts = attempts + 1
            WHERE status = 'publishing'
              AND locked_at < NOW() - INTERVAL '1 minute' * $1
            "#,
        )
        .bind(timeout_minutes)
        .execute(&self.pool)
        .await?;

        let count = result.rows_affected();
        if count > 0 {
            warn!(
                count = count,
                timeout_minutes = timeout_minutes,
                "Released stuck outbox locks"
            );
        }

        Ok(count)
    }

    /// Get statistics about outbox status
    pub async fn get_stats(&self) -> Result<Vec<(String, i64)>> {
        let rows = sqlx::query(
            r#"
            SELECT status, COUNT(*) as count
            FROM ingestion_outbox
            GROUP BY status
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| {
                let status: String = r.try_get("status").unwrap_or_default();
                let count: i64 = r.try_get("count").unwrap_or(0);
                (status, count)
            })
            .collect())
    }

    /// Delete old published events (housekeeping)
    ///
    /// Published events can be safely deleted after a retention period
    /// since they've already been delivered to Kafka.
    pub async fn cleanup_old_published(&self, retention_days: i32) -> Result<u64> {
        let result = sqlx::query(
            r#"
            DELETE FROM ingestion_outbox
            WHERE status = 'published'
              AND published_at < NOW() - INTERVAL '1 day' * $1
            "#,
        )
        .bind(retention_days)
        .execute(&self.pool)
        .await?;

        let count = result.rows_affected();
        if count > 0 {
            info!(
                count = count,
                retention_days = retention_days,
                "Cleaned up old published events"
            );
        }

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    // TODO: Add unit tests with mock database
    // - Test insert idempotency
    // - Test claim_batch SKIP LOCKED behavior
    // - Test backoff calculation
    // - Test stuck lock release
}
