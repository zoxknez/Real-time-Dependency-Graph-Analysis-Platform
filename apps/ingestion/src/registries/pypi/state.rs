//! PyPI State Store - PostgreSQL-backed state management
//!
//! Tracks package state with version hashes for idempotent processing

use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::instrument;

/// State record for a PyPI package
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PypiPackageState {
    pub package_name: String,
    pub versions_json: serde_json::Value,
    pub versions_hash: String,
    pub last_serial: i64,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow> for PypiPackageState {
    fn from_row(row: &'r sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(Self {
            package_name: row.try_get("package_name")?,
            versions_json: row.try_get("versions_json")?,
            versions_hash: row.try_get("versions_hash")?,
            last_serial: row.try_get("last_serial")?,
            updated_at: row.try_get("updated_at")?,
        })
    }
}

pub struct PypiStateStore {
    pool: PgPool,
}

impl PypiStateStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Initialize the state table
    pub async fn init(&self) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS pypi_package_state (
                package_name TEXT PRIMARY KEY,
                versions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                versions_hash TEXT NOT NULL DEFAULT '',
                last_serial BIGINT NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        "#,
        )
        .execute(&self.pool)
        .await?;

        // Index for efficient querying
        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_pypi_state_updated 
            ON pypi_package_state(updated_at)
        "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get current state for a package
    #[instrument(skip(self))]
    pub async fn get_state(&self, package_name: &str) -> Result<Option<PypiPackageState>> {
        let state = sqlx::query_as::<_, PypiPackageState>(
            "SELECT package_name, versions_json, versions_hash, last_serial, updated_at 
             FROM pypi_package_state WHERE package_name = $1",
        )
        .bind(package_name)
        .fetch_optional(&self.pool)
        .await?;

        Ok(state)
    }

    /// Upsert package state
    #[instrument(skip(self, versions_json))]
    pub async fn upsert_state(
        &self,
        package_name: &str,
        versions_json: serde_json::Value,
        versions_hash: &str,
        last_serial: i64,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO pypi_package_state 
                (package_name, versions_json, versions_hash, last_serial, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (package_name) 
            DO UPDATE SET 
                versions_json = EXCLUDED.versions_json,
                versions_hash = EXCLUDED.versions_hash,
                last_serial = EXCLUDED.last_serial,
                updated_at = NOW()
        "#,
        )
        .bind(package_name)
        .bind(versions_json)
        .bind(versions_hash)
        .bind(last_serial)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Mark package as deleted
    #[instrument(skip(self))]
    pub async fn mark_deleted(&self, package_name: &str) -> Result<()> {
        sqlx::query("DELETE FROM pypi_package_state WHERE package_name = $1")
            .bind(package_name)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    /// Calculate hash of versions for change detection
    pub fn calculate_versions_hash(versions: &[VersionInfo]) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        for v in versions {
            v.version.hash(&mut hasher);
            v.yanked.hash(&mut hasher);
        }
        format!("{:x}", hasher.finish())
    }
}

/// Version info for hashing
#[derive(Debug, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct VersionInfo {
    pub version: String,
    pub yanked: bool,
}

impl VersionInfo {
    pub fn new(version: String, yanked: bool) -> Self {
        Self { version, yanked }
    }
}
