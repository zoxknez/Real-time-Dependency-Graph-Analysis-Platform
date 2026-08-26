//! Storage abstraction layer
//!
//! Provides unified interfaces to:
//! - Memgraph (graph database)
//! - Qdrant (vector database)
//! - RisingWave (streaming SQL)
//! - Circuit breaker pattern for resilience
//! - Timeout, retry, and backoff utilities
//! - Bulkhead pattern for concurrency limiting
//! - Advanced caching with L1/L2 tiers
//! - Enhanced circuit breaker with half-open state

pub mod advanced_cache;
pub mod bulkhead;
pub mod circuit_breaker;
pub mod enhanced_circuit_breaker;
pub mod memgraph;
pub mod qdrant;
pub mod resilience;
pub mod risingwave;

// Re-exports for convenience
pub use advanced_cache::{AdvancedCache, CacheConfig, CacheStats, CacheStrategy};
pub use bulkhead::{Bulkhead, BulkheadConfig};
pub use circuit_breaker::{
    CircuitBreaker, CircuitBreakerConfig, CircuitBreakerRegistry, CircuitState,
};
pub use enhanced_circuit_breaker::{
    CircuitBreakerConfig as EnhancedCircuitBreakerConfig, CircuitBreakerStats,
    CircuitState as EnhancedCircuitBreakerState, EnhancedCircuitBreaker,
};
pub use memgraph::{GraphStats, MemgraphClient, MemgraphConfig, MemoryStats, QueryBuilder};
pub use qdrant::{FilterBuilder, QdrantClient, QdrantConfig, SearchResult, VectorPoint};
pub use resilience::{
    ErrorClass, IdempotencyToken, IsRetryable, ResilienceConfig, with_idempotency, with_resilience,
};
pub use risingwave::{DependencyCount, EcosystemStats, RisingWaveClient, RisingWaveConfig};

use anyhow::Result;

/// Storage configuration
#[derive(Debug, Clone, Default)]
pub struct StorageConfig {
    pub memgraph: MemgraphConfig,
    pub qdrant: QdrantConfig,
    pub risingwave: RisingWaveConfig,
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
