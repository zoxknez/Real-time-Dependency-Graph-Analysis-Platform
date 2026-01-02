//! Memgraph client for GraphQL resolvers

use anyhow::{Context, Result};
use neo4rs::{ConfigBuilder, Graph, Row};
use std::sync::Arc;
use tracing::{info, instrument, warn};

use crate::config::MemgraphConfig;

/// Memgraph client wrapper optimized for read-heavy GraphQL queries
#[derive(Clone)]
pub struct GraphClient {
    graph: Arc<Graph>,
}

impl GraphClient {
    /// Connect to Memgraph with connection pooling
    #[instrument(skip(config), fields(uri = %config.uri))]
    pub async fn connect(config: &MemgraphConfig) -> Result<Self> {
        info!("Connecting to Memgraph for GraphQL API...");

        let user = config.username.as_deref().unwrap_or("memgraph");
        let pass = config.password.as_deref().unwrap_or("memgraph");

        let graph_config = ConfigBuilder::default()
            .uri(&config.uri)
            .user(user)
            .password(pass)
            .db("memgraph")
            .max_connections(config.pool_size)
            .fetch_size(1000) // Higher fetch size for read queries
            .build()?;

        let graph = Graph::connect(graph_config)
            .await
            .with_context(|| format!("Failed to connect to Memgraph at {}", config.uri))?;

        info!("Connected to Memgraph successfully");

        Ok(Self {
            graph: Arc::new(graph),
        })
    }

    /// Execute a query and return all rows
    pub async fn query(&self, query: neo4rs::Query) -> Result<Vec<Row>> {
        let mut result = self.graph.execute(query).await?;
        let mut rows = Vec::new();
        
        while let Ok(Some(row)) = result.next().await {
            rows.push(row);
        }
        
        Ok(rows)
    }

    /// Execute a query and return first row only
    pub async fn query_one(&self, query: neo4rs::Query) -> Result<Option<Row>> {
        let mut result = self.graph.execute(query).await?;
        
        match result.next().await {
            Ok(row) => Ok(row),
            Err(e) => Err(e.into()),
        }
    }

    /// Health check
    pub async fn health_check(&self) -> bool {
        match self.graph.run(neo4rs::query("RETURN 1")).await {
            Ok(_) => true,
            Err(e) => {
                warn!("Memgraph health check failed: {}", e);
                false
            }
        }
    }
}
