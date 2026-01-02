//! RisingWave source - SQL streaming client
//! RisingWave streaming source
//!
//! Reads from RisingWave materialized views using PostgreSQL protocol
//! and provides a stream of changes for syncing to storage layer.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use crate::config::RisingWaveConfig;

/// Package data from RisingWave
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageRecord {
    pub id: String,
    pub name: String,
    pub ecosystem: String,
    pub version: String,
    pub description: Option<String>,
    pub repository_url: Option<String>,
    pub homepage_url: Option<String>,
    pub license: Option<String>,
    pub updated_at: DateTime<Utc>,
}

/// Dependency record from RisingWave
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyRecord {
    pub from_package_id: String,
    pub to_package_id: String,
    pub version_constraint: String,
    pub dependency_type: String,
    pub updated_at: DateTime<Utc>,
}

/// Embedding record from RisingWave
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingRecord {
    pub package_id: String,
    pub embedding: Vec<f32>,
    pub model: String,
    pub updated_at: DateTime<Utc>,
}

/// Sync event types from RisingWave
#[derive(Debug, Clone)]
pub enum SyncEvent {
    /// Package to be synced to Memgraph
    Package(PackageRecord),
    /// Dependency edge to be synced to Memgraph  
    Dependency(DependencyRecord),
    /// Embedding to be synced to Qdrant
    Embedding(EmbeddingRecord),
    /// Batch complete marker
    BatchComplete { count: usize },
}

/// RisingWave streaming source
pub struct RisingWaveSource {
    pool: PgPool,
    config: RisingWaveConfig,
    last_package_sync: DateTime<Utc>,
    last_dependency_sync: DateTime<Utc>,
    last_embedding_sync: DateTime<Utc>,
}

impl RisingWaveSource {
    /// Create new RisingWave source
    pub async fn new(config: RisingWaveConfig) -> Result<Self> {
        info!(url = %config.url, pool_size = %config.pool_size, "Connecting to RisingWave");
        
        let pool = PgPoolOptions::new()
            .max_connections(config.pool_size)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&config.url)
            .await
            .context("Failed to connect to RisingWave")?;
        
        // Verify connection
        sqlx::query("SELECT 1")
            .fetch_one(&pool)
            .await
            .context("RisingWave connection test failed")?;
        
        info!("✅ Connected to RisingWave");
        
        Ok(Self {
            pool,
            config,
            last_package_sync: DateTime::<Utc>::MIN_UTC,
            last_dependency_sync: DateTime::<Utc>::MIN_UTC,
            last_embedding_sync: DateTime::<Utc>::MIN_UTC,
        })
    }
    
    /// Start streaming changes to the given channel
    pub async fn start_streaming(&mut self, tx: mpsc::Sender<SyncEvent>) -> Result<()> {
        info!(
            poll_interval_ms = %self.config.poll_interval_ms,
            "Starting RisingWave change stream"
        );
        
        loop {
            // Fetch packages updated since last sync
            let packages = self.fetch_updated_packages().await?;
            let packages_count = packages.len();
            if !packages.is_empty() {
                info!(count = packages_count, "Fetched updated packages");
                for pkg in packages {
                    if tx.send(SyncEvent::Package(pkg)).await.is_err() {
                        warn!("Channel closed, stopping stream");
                        return Ok(());
                    }
                }
            }
            
            // Fetch dependencies updated since last sync
            let dependencies = self.fetch_updated_dependencies().await?;
            let deps_count = dependencies.len();
            if !dependencies.is_empty() {
                info!(count = deps_count, "Fetched updated dependencies");
                for dep in dependencies {
                    if tx.send(SyncEvent::Dependency(dep)).await.is_err() {
                        warn!("Channel closed, stopping stream");
                        return Ok(());
                    }
                }
            }
            
            // Fetch embeddings updated since last sync
            let embeddings = self.fetch_updated_embeddings().await?;
            let emb_count = embeddings.len();
            if !embeddings.is_empty() {
                info!(count = emb_count, "Fetched updated embeddings");
                for emb in embeddings {
                    if tx.send(SyncEvent::Embedding(emb)).await.is_err() {
                        warn!("Channel closed, stopping stream");
                        return Ok(());
                    }
                }
            }
            
            let total = packages_count + deps_count + emb_count;
            if total > 0 {
                let _ = tx.send(SyncEvent::BatchComplete { count: total }).await;
            }
            
            // Wait before next poll
            tokio::time::sleep(Duration::from_millis(self.config.poll_interval_ms)).await;
        }
    }
    
    /// Fetch packages updated since last sync
    async fn fetch_updated_packages(&mut self) -> Result<Vec<PackageRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                id, name, ecosystem, version,
                description, repository_url, homepage_url, license,
                updated_at
            FROM mv_packages_latest
            WHERE updated_at > $1
            ORDER BY updated_at ASC
            LIMIT 1000
            "#
        )
        .bind(self.last_package_sync)
        .fetch_all(&self.pool)
        .await?;
        
        let mut packages = Vec::with_capacity(rows.len());
        
        for row in rows {
            let updated_at: DateTime<Utc> = row.get("updated_at");
            
            packages.push(PackageRecord {
                id: row.get("id"),
                name: row.get("name"),
                ecosystem: row.get("ecosystem"),
                version: row.get("version"),
                description: row.get("description"),
                repository_url: row.get("repository_url"),
                homepage_url: row.get("homepage_url"),
                license: row.get("license"),
                updated_at,
            });
            
            // Track latest sync point
            if updated_at > self.last_package_sync {
                self.last_package_sync = updated_at;
            }
        }
        
        debug!(count = packages.len(), last_sync = %self.last_package_sync, "Fetched packages");
        Ok(packages)
    }
    
    /// Fetch dependencies updated since last sync
    async fn fetch_updated_dependencies(&mut self) -> Result<Vec<DependencyRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                from_package_id, to_package_id, 
                version_constraint, dependency_type,
                updated_at
            FROM mv_dependencies_latest
            WHERE updated_at > $1
            ORDER BY updated_at ASC
            LIMIT 1000
            "#
        )
        .bind(self.last_dependency_sync)
        .fetch_all(&self.pool)
        .await?;
        
        let mut dependencies = Vec::with_capacity(rows.len());
        
        for row in rows {
            let updated_at: DateTime<Utc> = row.get("updated_at");
            
            dependencies.push(DependencyRecord {
                from_package_id: row.get("from_package_id"),
                to_package_id: row.get("to_package_id"),
                version_constraint: row.get("version_constraint"),
                dependency_type: row.get("dependency_type"),
                updated_at,
            });
            
            if updated_at > self.last_dependency_sync {
                self.last_dependency_sync = updated_at;
            }
        }
        
        debug!(count = dependencies.len(), "Fetched dependencies");
        Ok(dependencies)
    }
    
    /// Fetch embeddings updated since last sync
    async fn fetch_updated_embeddings(&mut self) -> Result<Vec<EmbeddingRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                package_id, embedding, model, updated_at
            FROM mv_embeddings_latest
            WHERE updated_at > $1
            ORDER BY updated_at ASC
            LIMIT 1000
            "#
        )
        .bind(self.last_embedding_sync)
        .fetch_all(&self.pool)
        .await?;
        
        let mut embeddings = Vec::with_capacity(rows.len());
        
        for row in rows {
            let updated_at: DateTime<Utc> = row.get("updated_at");
            let embedding_bytes: Vec<u8> = row.get("embedding");
            
            // Decode embedding from bytes (assuming f32 little-endian)
            let embedding: Vec<f32> = embedding_bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();
            
            embeddings.push(EmbeddingRecord {
                package_id: row.get("package_id"),
                embedding,
                model: row.get("model"),
                updated_at,
            });
            
            if updated_at > self.last_embedding_sync {
                self.last_embedding_sync = updated_at;
            }
        }
        
        debug!(count = embeddings.len(), "Fetched embeddings");
        Ok(embeddings)
    }
    
    /// Get current sync positions (for metrics/debugging)
    #[allow(dead_code)]
    pub fn sync_positions(&self) -> (DateTime<Utc>, DateTime<Utc>, DateTime<Utc>) {
        (
            self.last_package_sync,
            self.last_dependency_sync,
            self.last_embedding_sync,
        )
    }
    
    /// Health check
    #[allow(dead_code)]
    pub async fn health_check(&self) -> Result<bool> {
        sqlx::query("SELECT 1")
            .fetch_one(&self.pool)
            .await
            .context("RisingWave health check failed")?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_package_record_serialization() {
        let pkg = PackageRecord {
            id: "npm/lodash/4.17.21".to_string(),
            name: "lodash".to_string(),
            ecosystem: "npm".to_string(),
            version: "4.17.21".to_string(),
            description: Some("Lodash modular utilities".to_string()),
            repository_url: Some("https://github.com/lodash/lodash".to_string()),
            homepage_url: None,
            license: Some("MIT".to_string()),
            updated_at: Utc::now(),
        };
        
        let json = serde_json::to_string(&pkg).unwrap();
        assert!(json.contains("lodash"));
    }
}
