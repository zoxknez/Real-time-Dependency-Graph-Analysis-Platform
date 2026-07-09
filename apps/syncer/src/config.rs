//! Configuration for syncer service
//! Syncer service configuration

use anyhow::Result;
use serde::Deserialize;

/// Main configuration for Syncer service
#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    /// RisingWave connection settings
    #[serde(default)]
    pub risingwave: RisingWaveConfig,

    /// Memgraph connection settings
    #[serde(default)]
    pub memgraph: MemgraphConfig,

    /// Qdrant connection settings
    #[serde(default)]
    pub qdrant: QdrantConfig,

    /// Sync settings
    #[serde(default)]
    pub sync: SyncConfig,
}

/// RisingWave source configuration
#[derive(Debug, Deserialize, Clone)]
pub struct RisingWaveConfig {
    /// Connection URL (PostgreSQL protocol)
    #[serde(default = "default_risingwave_url")]
    pub url: String,

    /// Connection pool size
    #[serde(default = "default_pool_size")]
    pub pool_size: u32,

    /// Poll interval in milliseconds
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
}

impl Default for RisingWaveConfig {
    fn default() -> Self {
        Self {
            url: default_risingwave_url(),
            pool_size: default_pool_size(),
            poll_interval_ms: default_poll_interval_ms(),
        }
    }
}

fn default_risingwave_url() -> String {
    std::env::var("RISINGWAVE_URL").unwrap_or_else(|_| "postgres://root@localhost:4566/dev".into())
}

fn default_pool_size() -> u32 {
    5
}

fn default_poll_interval_ms() -> u64 {
    if let Ok(secs) = std::env::var("SYNC_INTERVAL_SECS") {
        if let Ok(secs) = secs.parse::<u64>() {
            return secs.saturating_mul(1000);
        }
    }

    if let Ok(ms) = std::env::var("RISINGWAVE_POLL_INTERVAL_MS") {
        if let Ok(ms) = ms.parse::<u64>() {
            return ms;
        }
    }

    1000
}

/// Memgraph sink configuration
#[derive(Debug, Deserialize, Clone)]
pub struct MemgraphConfig {
    /// Connection URL (Bolt protocol)
    #[serde(default = "default_memgraph_url")]
    pub url: String,

    /// Username
    #[serde(default)]
    pub username: Option<String>,

    /// Password
    #[serde(default)]
    pub password: Option<String>,

    /// Batch size for graph operations
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,
}

impl Default for MemgraphConfig {
    fn default() -> Self {
        Self {
            url: default_memgraph_url(),
            username: None,
            password: None,
            batch_size: default_batch_size(),
        }
    }
}

fn default_memgraph_url() -> String {
    std::env::var("MEMGRAPH_URL").unwrap_or_else(|_| "bolt://localhost:7687".into())
}

fn default_batch_size() -> usize {
    100
}

/// Qdrant sink configuration
#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct QdrantConfig {
    /// Qdrant URL
    #[serde(default = "default_qdrant_url")]
    pub url: String,

    /// Collection name
    #[serde(default = "default_collection_name")]
    pub collection: String,

    /// Vector dimension
    #[serde(default = "default_vector_dimension")]
    pub vector_dimension: u64,

    /// Batch size for vector operations
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,
}

impl Default for QdrantConfig {
    fn default() -> Self {
        Self {
            url: default_qdrant_url(),
            collection: default_collection_name(),
            vector_dimension: default_vector_dimension(),
            batch_size: default_batch_size(),
        }
    }
}

fn default_qdrant_url() -> String {
    std::env::var("QDRANT_URL").unwrap_or_else(|_| "http://localhost:6334".into())
}

fn default_collection_name() -> String {
    "package_embeddings".into()
}

fn default_vector_dimension() -> u64 {
    384 // all-MiniLM-L6-v2
}

/// Sync worker configuration
#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct SyncConfig {
    /// Number of sync workers
    #[serde(default = "default_worker_count")]
    pub worker_count: usize,

    /// Maximum retries per batch
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,

    /// Retry delay in milliseconds
    #[serde(default = "default_retry_delay_ms")]
    pub retry_delay_ms: u64,

    /// Enable graph sync
    #[serde(default = "default_true")]
    pub enable_graph: bool,

    /// Enable vector sync
    #[serde(default = "default_true")]
    pub enable_vector: bool,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            worker_count: default_worker_count(),
            max_retries: default_max_retries(),
            retry_delay_ms: default_retry_delay_ms(),
            enable_graph: true,
            enable_vector: true,
        }
    }
}

fn default_worker_count() -> usize {
    4
}

fn default_max_retries() -> u32 {
    3
}

fn default_retry_delay_ms() -> u64 {
    1000
}

fn default_true() -> bool {
    true
}

impl Config {
    /// Load configuration from environment
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        let config = config::Config::builder()
            .add_source(config::Environment::default().separator("__"))
            .build()?;

        Ok(config.try_deserialize()?)
    }
}
