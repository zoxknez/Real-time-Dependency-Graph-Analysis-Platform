//! Memgraph client for GraphQL resolvers

use anyhow::Result;
use models::tenant::TenantContext;
use neo4rs::Row;
use std::sync::Arc;
use storage::memgraph::{MemgraphClient, MemgraphConfig, MemoryStats};
use tracing::{info, instrument};

/// Memgraph client wrapper optimized for read-heavy GraphQL queries
#[derive(Clone)]
pub struct GraphClient {
    client: Arc<MemgraphClient>,
    /// Pool size for monitoring
    #[allow(dead_code)]
    pool_size: usize,
}

impl GraphClient {
    /// Connect to Memgraph with connection pooling
    ///
    /// Pool size is calculated as (2 * CPU cores) + 1 for optimal performance:
    /// - 2 * cores: Maximizes throughput for I/O-bound operations
    /// - +1: Ensures at least one connection is always available
    #[instrument(skip(config), fields(uri = %config.memgraph.uri))]
    pub async fn connect(config: &crate::config::Config) -> Result<Self> {
        let pool_size = config.memgraph.pool_size;

        info!(
            pool_size = pool_size,
            cpu_cores = std::thread::available_parallelism()
                .map(|p| p.get())
                .unwrap_or(4),
            "Connecting to Memgraph with optimized pool (formula: 2*cores + 1)"
        );

        // Translate app config to storage config
        let memgraph_config = MemgraphConfig {
            uri: config.memgraph.uri.clone(),
            username: config.memgraph.username.clone(),
            password: config.memgraph.password.clone(),
            max_connections: pool_size,
            connect_timeout: std::time::Duration::from_secs(30),
            query_timeout: std::time::Duration::from_secs(60),
            max_retries: 3,
        };

        let client = MemgraphClient::new(memgraph_config).await?;

        info!(pool_size = pool_size, "Connected to Memgraph successfully");

        // Record pool size as gauge metric
        metrics::gauge!("memgraph_pool_size").set(pool_size as f64);

        Ok(Self {
            client: Arc::new(client),
            pool_size,
        })
    }

    /// Get the configured pool size
    #[allow(dead_code)]
    pub fn pool_size(&self) -> usize {
        self.pool_size
    }

    /// Execute a query and return all rows
    pub async fn query(
        &self,
        query: neo4rs::Query,
        tenant_ctx: Option<&TenantContext>,
    ) -> Result<Vec<Row>> {
        self.client.execute(query, tenant_ctx).await
    }

    /// Execute a query and return first row only
    pub async fn query_one(
        &self,
        query: neo4rs::Query,
        tenant_ctx: Option<&TenantContext>,
    ) -> Result<Option<Row>> {
        let rows = self.client.execute(query, tenant_ctx).await?;
        Ok(rows.into_iter().next())
    }

    /// Health check
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }

    /// Get memory usage statistics for OOM prevention
    pub async fn get_memory_stats(&self) -> Result<MemoryStats> {
        self.client.get_memory_stats().await
    }
}
