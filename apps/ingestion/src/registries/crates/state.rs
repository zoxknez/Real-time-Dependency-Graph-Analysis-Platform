//! Cargo State Store
//!
//! PostgreSQL-backed state storage for tracking crate versions.
//! Uses the same pattern as npm and pypi for consistency.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPool;
use tracing::{debug, instrument};

use super::index::CrateIndexEntry;

/// SQL for creating the cargo state table
pub const CREATE_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS cargo_package_state (
    crate_name TEXT PRIMARY KEY,
    versions_json JSONB NOT NULL,
    versions_hash TEXT NOT NULL,
    etag TEXT,
    last_modified TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cargo_package_state_updated 
ON cargo_package_state(last_updated);
"#;

/// State record for a crate
#[derive(Debug, Clone)]
pub struct CargoPackageState {
    pub crate_name: String,
    pub versions: Vec<VersionState>,
    pub versions_hash: String,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub last_updated: DateTime<Utc>,
}

/// Version state within a package
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VersionState {
    pub version: String,
    pub yanked: bool,
    pub cksum: String,
    pub deps_count: usize,
}

impl From<&CrateIndexEntry> for VersionState {
    fn from(entry: &CrateIndexEntry) -> Self {
        Self {
            version: entry.version.clone(),
            yanked: entry.yanked,
            cksum: entry.cksum.clone(),
            deps_count: entry.deps.len(),
        }
    }
}

/// State store for Cargo crates
pub struct CargoStateStore {
    pool: PgPool,
}

impl CargoStateStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Initialize the state table
    pub async fn init(&self) -> Result<()> {
        sqlx::query(CREATE_TABLE_SQL)
            .execute(&self.pool)
            .await
            .context("Failed to create cargo state table")?;
        Ok(())
    }

    /// Get current state for a crate
    #[instrument(skip(self))]
    pub async fn get_state(&self, crate_name: &str) -> Result<Option<CargoPackageState>> {
        let row: Option<(
            String,
            serde_json::Value,
            String,
            Option<String>,
            Option<String>,
            DateTime<Utc>,
        )> = sqlx::query_as(
            r#"
                SELECT crate_name, versions_json, versions_hash, etag, last_modified, last_updated
                FROM cargo_package_state
                WHERE crate_name = $1
                "#,
        )
        .bind(crate_name)
        .fetch_optional(&self.pool)
        .await
        .context("Failed to fetch cargo state")?;

        match row {
            Some((name, versions_json, hash, etag, last_mod, updated)) => {
                let versions: Vec<VersionState> = serde_json::from_value(versions_json)
                    .context("Failed to deserialize versions")?;
                Ok(Some(CargoPackageState {
                    crate_name: name,
                    versions,
                    versions_hash: hash,
                    etag,
                    last_modified: last_mod,
                    last_updated: updated,
                }))
            }
            None => Ok(None),
        }
    }

    /// Update state for a crate
    #[instrument(skip(self, entries))]
    pub async fn update_state(
        &self,
        crate_name: &str,
        entries: &[CrateIndexEntry],
        etag: Option<&str>,
        last_modified: Option<&str>,
    ) -> Result<()> {
        let versions: Vec<VersionState> = entries.iter().map(VersionState::from).collect();
        let versions_json = serde_json::to_value(&versions)?;
        let versions_hash = calculate_versions_hash(&versions);

        sqlx::query(
            r#"
            INSERT INTO cargo_package_state (crate_name, versions_json, versions_hash, etag, last_modified, last_updated)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (crate_name) DO UPDATE SET
                versions_json = EXCLUDED.versions_json,
                versions_hash = EXCLUDED.versions_hash,
                etag = EXCLUDED.etag,
                last_modified = EXCLUDED.last_modified,
                last_updated = NOW()
            "#
        )
        .bind(crate_name)
        .bind(&versions_json)
        .bind(&versions_hash)
        .bind(etag)
        .bind(last_modified)
        .execute(&self.pool)
        .await
        .context("Failed to update cargo state")?;

        debug!(crate_name = %crate_name, versions = versions.len(), "Updated cargo state");

        Ok(())
    }

    /// Get version states as map for diffing
    pub async fn get_version_map(
        &self,
        crate_name: &str,
    ) -> Result<std::collections::HashMap<String, VersionState>> {
        match self.get_state(crate_name).await? {
            Some(state) => Ok(state
                .versions
                .into_iter()
                .map(|v| (v.version.clone(), v))
                .collect()),
            None => Ok(std::collections::HashMap::new()),
        }
    }
}

/// Calculate SHA256 hash of version states for change detection
fn calculate_versions_hash(versions: &[VersionState]) -> String {
    let mut hasher = Sha256::new();

    for v in versions {
        hasher.update(v.version.as_bytes());
        hasher.update(if v.yanked { b"1" } else { b"0" });
        hasher.update(v.cksum.as_bytes());
    }

    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_state_from_entry() {
        let entry = CrateIndexEntry {
            name: "serde".to_string(),
            version: "1.0.0".to_string(),
            deps: vec![],
            cksum: "abc123".to_string(),
            features: Default::default(),
            yanked: false,
            links: None,
            rust_version: None,
            features2: Default::default(),
        };

        let state = VersionState::from(&entry);
        assert_eq!(state.version, "1.0.0");
        assert!(!state.yanked);
        assert_eq!(state.deps_count, 0);
    }
}
