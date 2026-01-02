//! Storage abstraction layer
//!
//! Provides unified interfaces to:
//! - Memgraph (graph database)
//! - Qdrant (vector database)
//! - RisingWave (streaming SQL)

pub mod memgraph;
pub mod qdrant;
pub mod risingwave;

// Re-exports for convenience
pub use memgraph::{MemgraphClient, MemgraphConfig, QueryBuilder, GraphStats};
pub use qdrant::{QdrantClient, QdrantConfig, VectorPoint, SearchResult, FilterBuilder};
pub use risingwave::{RisingWaveClient, RisingWaveConfig, EcosystemStats, DependencyCount};

use anyhow::Result;

/// Storage configuration
#[derive(Debug, Clone)]
pub struct StorageConfig {
    pub memgraph: MemgraphConfig,
    pub qdrant: QdrantConfig,
    pub risingwave: RisingWaveConfig,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            memgraph: MemgraphConfig::default(),
            qdrant: QdrantConfig::default(),
            risingwave: RisingWaveConfig::default(),
        }
    }
}

impl StorageConfig {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            memgraph: MemgraphConfig::from_env()?,
            qdrant: QdrantConfig::from_env()?,
            risingwave: RisingWaveConfig::from_env()?,
        })
    }
}

/// Initialize all storage connections
pub async fn init_storage(config: &StorageConfig) -> Result<StorageClients> {
    let memgraph = MemgraphClient::new(config.memgraph.clone()).await?;
    let qdrant = QdrantClient::new(config.qdrant.clone()).await?;
    let risingwave = RisingWaveClient::new(config.risingwave.clone()).await?;
    
    Ok(StorageClients {
        memgraph,
        qdrant,
        risingwave,
    })
}

/// All storage clients bundled together
pub struct StorageClients {
    pub memgraph: MemgraphClient,
    pub qdrant: QdrantClient,
    pub risingwave: RisingWaveClient,
}

impl StorageClients {
    /// Health check all storage systems
    pub async fn health_check_all(&self) -> StorageHealth {
        StorageHealth {
            memgraph: self.memgraph.health_check().await,
            qdrant: self.qdrant.health_check().await,
            risingwave: self.risingwave.health_check().await,
        }
    }
}

/// Health status for all storage systems
#[derive(Debug, Clone)]
pub struct StorageHealth {
    pub memgraph: bool,
    pub qdrant: bool,
    pub risingwave: bool,
}

impl StorageHealth {
    /// Check if all systems are healthy
    pub fn all_healthy(&self) -> bool {
        self.memgraph && self.qdrant && self.risingwave
    }
}
