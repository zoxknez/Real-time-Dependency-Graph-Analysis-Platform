//! Storage abstraction layer
//!
//! Provides unified interfaces to:
//! - Memgraph (graph database)
//! - Qdrant (vector database)
//! - RisingWave (streaming SQL)

pub mod memgraph;
pub mod qdrant;
pub mod risingwave;

use anyhow::Result;

/// Storage configuration
#[derive(Debug, Clone)]
pub struct StorageConfig {
    pub memgraph_uri: String,
    pub memgraph_user: String,
    pub memgraph_password: String,
    pub qdrant_url: String,
    pub risingwave_url: String,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            memgraph_uri: "bolt://localhost:7687".into(),
            memgraph_user: "".into(),
            memgraph_password: "".into(),
            qdrant_url: "http://localhost:6333".into(),
            risingwave_url: "postgres://root@localhost:4566/dev".into(),
        }
    }
}

/// Initialize all storage connections
pub async fn init_storage(config: &StorageConfig) -> Result<StorageClients> {
    let memgraph = memgraph::MemgraphClient::new(&config.memgraph_uri).await?;
    let qdrant = qdrant::QdrantClient::new(&config.qdrant_url).await?;
    let risingwave = risingwave::RisingWaveClient::new(&config.risingwave_url).await?;
    
    Ok(StorageClients {
        memgraph,
        qdrant,
        risingwave,
    })
}

/// All storage clients bundled together
pub struct StorageClients {
    pub memgraph: memgraph::MemgraphClient,
    pub qdrant: qdrant::QdrantClient,
    pub risingwave: risingwave::RisingWaveClient,
}
