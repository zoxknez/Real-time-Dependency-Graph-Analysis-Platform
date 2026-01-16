//! Memgraph client for GraphQL resolvers

use anyhow::Result;
use neo4rs::{Row};
use std::sync::Arc;
use tracing::{info, instrument};
use storage::memgraph::{MemgraphClient, MemgraphConfig};
use models::tenant::TenantContext;

/// Memgraph client wrapper optimized for read-heavy GraphQL queries
#[derive(Clone)]
pub struct GraphClient {
    client: Arc<MemgraphClient>,
}

impl GraphClient {
    /// Connect to Memgraph with connection pooling
    #[instrument(skip(config), fields(uri = %config.memgraph.uri))]
    pub async fn connect(config: &crate::config::Config) -> Result<Self> {
        info!("Connecting to Memgraph for GraphQL API...");

        // Translate app config to storage config
        let memgraph_config = MemgraphConfig {
            uri: config.memgraph.uri.clone(),
            username: config.memgraph.username.clone(),
            password: config.memgraph.password.clone(),
            max_connections: config.memgraph.pool_size as usize,
            connect_timeout: std::time::Duration::from_secs(30),
            query_timeout: std::time::Duration::from_secs(60),
            max_retries: 3,
        };

        let client = MemgraphClient::new(memgraph_config).await?;

        info!("Connected to Memgraph successfully");

        Ok(Self {
            client: Arc::new(client),
        })
    }

    /// Execute a query and return all rows
    pub async fn query(&self, query: neo4rs::Query, tenant_ctx: Option<&TenantContext>) -> Result<Vec<Row>> {
        self.client.execute(query, tenant_ctx).await
    }

    /// Execute a query and return first row only
    pub async fn query_one(&self, query: neo4rs::Query, tenant_ctx: Option<&TenantContext>) -> Result<Option<Row>> {
        let rows = self.client.execute(query, tenant_ctx).await?;
        Ok(rows.into_iter().next())
    }

    /// Health check
    pub async fn health_check(&self) -> bool {
        self.client.health_check().await
    }
}
