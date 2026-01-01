use crate::traits::CheckpointStore;
use anyhow::{Context, Result};
use async_trait::async_trait;
use sqlx::{PgPool, types::Json};
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
        let rec = sqlx::query!(
            "SELECT cursor FROM ingestion_checkpoints WHERE registry = $1",
            registry
        )
        .fetch_optional(&self.pool)
        .await
        .context("Failed to fetch checkpoint")?;

        Ok(rec.map(|r| r.cursor))
    }

    #[instrument(skip(self), level = "debug")]
    async fn set_cursor(&self, registry: &str, cursor: &str) -> Result<()> {
        // Upsert logic
        sqlx::query!(
            r#"
            INSERT INTO ingestion_checkpoints (registry, cursor, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (registry) DO UPDATE
            SET cursor = EXCLUDED.cursor, updated_at = NOW()
            "#,
            registry,
            cursor
        )
        .execute(&self.pool)
        .await
        .context("Failed to update checkpoint")?;

        Ok(())
    }
}
