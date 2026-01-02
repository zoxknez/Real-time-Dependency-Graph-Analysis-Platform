use crate::traits::CheckpointStore;
use anyhow::{Context, Result};
use async_trait::async_trait;
use sqlx::{PgPool, Row};
use tracing::instrument;

/// Postgres-backed checkpoint store
pub struct PostgresCheckpointStore {
    pool: PgPool,
}

impl PostgresCheckpointStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl CheckpointStore for PostgresCheckpointStore {
    #[instrument(skip(self), level = "debug")]
    async fn get_cursor(&self, registry: &str) -> Result<Option<String>> {
        let rec = sqlx::query(
            "SELECT cursor FROM ingestion_checkpoints WHERE registry = $1",
        )
        .bind(registry)
        .fetch_optional(&self.pool)
        .await
        .context("Failed to fetch checkpoint")?;

        Ok(rec.map(|r| r.try_get::<String, _>("cursor").unwrap_or_default()))
    }

    #[instrument(skip(self), level = "debug")]
    async fn set_cursor(&self, registry: &str, cursor: &str) -> Result<()> {
        // Upsert logic
        sqlx::query(
            r#"
            INSERT INTO ingestion_checkpoints (registry, cursor, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (registry)
            DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = NOW()
            "#,
        )
        .bind(registry)
        .bind(cursor)
        .execute(&self.pool)
        .await
        .context("Failed to update checkpoint")?;

        Ok(())
    }
}
