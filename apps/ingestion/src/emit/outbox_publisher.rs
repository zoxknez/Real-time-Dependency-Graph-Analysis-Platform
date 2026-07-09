// Outbox Publisher - SKIP LOCKED Kafka publisher with retry/backoff
//
// This service continuously polls the outbox table, claims batches using
// SKIP LOCKED for horizontal scaling, publishes events to Kafka, and
// updates event status with exponential backoff on failure.
//
// ## Guarantees
// - **At-least-once delivery**: Events remain in outbox until successfully published
// - **Idempotency**: Event consumers can deduplicate using event_id
// - **Horizontal scaling**: SKIP LOCKED prevents duplicate publishing across workers
// - **Retry with backoff**: Failed events retry with exponential delays (1m → 1h cap)
// - **Dead-letter queue**: Events exceeding max_attempts move to DLQ status

use crate::store::outbox::{OutboxRepo, OutboxRow};
use anyhow::{Context as _, Result};
use rdkafka::message::OwnedHeaders;
use rdkafka::producer::{FutureProducer, FutureRecord};
use sqlx::PgPool;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

/// Configuration for the outbox publisher
#[derive(Debug, Clone)]
pub struct OutboxPublisherConfig {
    /// Number of events to claim in each batch
    pub batch_size: i32,

    /// Interval between polling cycles
    pub poll_interval: Duration,

    /// Maximum attempts before moving to DLQ
    pub max_attempts: i32,

    /// Lock timeout for stuck lock detection
    pub lock_timeout: Duration,

    /// Whether to run stuck lock cleanup
    pub cleanup_stuck_locks: bool,
}

impl Default for OutboxPublisherConfig {
    fn default() -> Self {
        Self {
            batch_size: 100,
            poll_interval: Duration::from_secs(1),
            max_attempts: 10,
            lock_timeout: Duration::from_secs(300), // 5 minutes
            cleanup_stuck_locks: true,
        }
    }
}

/// Outbox publisher service
pub struct OutboxPublisher {
    repo: OutboxRepo,
    producer: FutureProducer,
    config: OutboxPublisherConfig,
    worker_id: String,
}

impl OutboxPublisher {
    pub fn new(
        pool: PgPool,
        producer: FutureProducer,
        config: OutboxPublisherConfig,
        worker_id: impl Into<String>,
    ) -> Self {
        Self {
            repo: OutboxRepo::new(pool),
            producer,
            config,
            worker_id: worker_id.into(),
        }
    }

    /// Run the publisher loop indefinitely
    ///
    /// This is the main entry point. It will run until the task is cancelled
    /// or an unrecoverable error occurs.
    pub async fn run(&self) -> Result<()> {
        info!(
            batch_size = self.config.batch_size,
            poll_interval_ms = self.config.poll_interval.as_millis(),
            max_attempts = self.config.max_attempts,
            "Starting outbox publisher"
        );

        loop {
            if let Err(e) = self.process_batch().await {
                error!(error = ?e, "Error processing batch, retrying...");
                // Don't crash - just log and continue
                sleep(self.config.poll_interval).await;
                continue;
            }

            // Optional: Release stuck locks periodically
            if self.config.cleanup_stuck_locks {
                if let Err(e) = self.cleanup_stuck_locks().await {
                    warn!(error = ?e, "Failed to cleanup stuck locks");
                }
            }

            sleep(self.config.poll_interval).await;
        }
    }

    /// Process a single batch of events
    async fn process_batch(&self) -> Result<()> {
        // Claim batch using SKIP LOCKED
        let events = self
            .repo
            .claim_batch(&self.worker_id, self.config.batch_size)
            .await
            .context("Failed to claim batch")?;

        if events.is_empty() {
            debug!("No pending events");
            return Ok(());
        }

        debug!(count = events.len(), "Claimed batch");

        // Process each event
        for event in events {
            if let Err(e) = self.process_event(&event).await {
                error!(
                    event_id = %event.event_id,
                    attempt = event.attempts,
                    error = ?e,
                    "Failed to publish event"
                );

                // Mark failed with exponential backoff
                self.repo
                    .mark_failed(&event.event_id, &e.to_string(), self.config.max_attempts)
                    .await
                    .context("Failed to mark event as failed")?;
            }
        }

        Ok(())
    }

    /// Publish a single event to Kafka
    async fn process_event(&self, event: &OutboxRow) -> Result<()> {
        debug!(
            event_id = %event.event_id,
            topic = %event.topic,
            event_type = %event.event_type,
            "Publishing event"
        );

        // Build Kafka message
        let mut record = FutureRecord::to(&event.topic)
            .payload(&event.payload)
            .key(&event.partition_key);

        // Add headers
        let mut headers = OwnedHeaders::new();

        // Add event metadata headers
        headers = headers.insert(rdkafka::message::Header {
            key: "event_id",
            value: Some(&event.event_id),
        });
        headers = headers.insert(rdkafka::message::Header {
            key: "event_type",
            value: Some(&event.event_type),
        });

        // Add custom headers as JSON string
        let headers_json = serde_json::to_string(&event.headers).unwrap_or_default();
        headers = headers.insert(rdkafka::message::Header {
            key: "custom_headers",
            value: Some(&headers_json),
        });

        record = record.headers(headers);

        // Publish to Kafka
        let delivery_status = self
            .producer
            .send(record, Duration::from_secs(30))
            .await
            .map_err(|(err, _)| err)
            .context("Failed to send message to Kafka")?;

        debug!(
            event_id = %event.event_id,
            topic = %event.topic,
            partition = delivery_status.partition,
            offset = delivery_status.offset,
            "Event published successfully"
        );

        // Mark as published in DB
        self.repo
            .mark_published(&event.event_id)
            .await
            .context("Failed to mark event as published")?;

        Ok(())
    }

    /// Release locks that have been held too long (crashed workers)
    async fn cleanup_stuck_locks(&self) -> Result<()> {
        let timeout_minutes = (self.config.lock_timeout.as_secs() / 60) as i32;
        let released = self
            .repo
            .release_stuck_locks(timeout_minutes)
            .await
            .context("Failed to release stuck locks")?;

        if released > 0 {
            warn!(count = released, "Released stuck locks");
        }

        Ok(())
    }

    /// Get current outbox statistics (for monitoring)
    pub async fn get_stats(&self) -> Result<OutboxStats> {
        let stats_vec = self
            .repo
            .get_stats()
            .await
            .context("Failed to get outbox stats")?;

        let mut pending = 0;
        let mut publishing = 0;
        let mut failed = 0;

        for (status, count) in stats_vec {
            match status.as_str() {
                "pending" => pending = count,
                "publishing" => publishing = count,
                "failed" | "deadletter" => failed += count,
                _ => {}
            }
        }

        Ok(OutboxStats {
            pending,
            publishing,
            failed,
        })
    }
}

/// Outbox statistics for monitoring
#[derive(Debug, Clone)]
pub struct OutboxStats {
    pub pending: i64,
    pub publishing: i64,
    pub failed: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = OutboxPublisherConfig::default();
        assert_eq!(config.batch_size, 100);
        assert_eq!(config.max_attempts, 10);
        assert!(config.cleanup_stuck_locks);
    }
}
