use anyhow::{Context, Result};
use neo4rs::{ConfigBuilder, Graph};
use std::sync::Arc;
use tracing::{info, instrument, warn};

use crate::config::MemgraphConfig;

/// Memgraph client wrapper with connection pooling and reconnect logic
#[derive(Clone)]
#[allow(dead_code)]
pub struct MemgraphClient {
    graph: Arc<Graph>,
    config: MemgraphConfig,
}

impl MemgraphClient {
    /// Create a new Memgraph client with connection pooling
    #[instrument(skip(config), fields(uri = %config.uri))]
    pub async fn connect(config: &MemgraphConfig) -> Result<Self> {
        info!("Connecting to Memgraph...");

        // Memgraph typically doesn't require authentication
        // but neo4rs requires non-empty user/pass
        let user = config.username.as_deref().unwrap_or("memgraph");
        let pass = config.password.as_deref().unwrap_or("memgraph");

        // Use ConfigBuilder to set db to "memgraph" (not "neo4j")
        let graph_config = ConfigBuilder::default()
            .uri(&config.uri)
            .user(user)
            .password(pass)
            .db("memgraph")  // Memgraph uses "memgraph" as default database
            .max_connections(config.pool_size)
            .fetch_size(500)
            .build()?;

        let graph = Graph::connect(graph_config)
            .await
            .with_context(|| format!("Failed to connect to Memgraph at {}", config.uri))?;

        info!("Connected to Memgraph successfully");

        Ok(Self {
            graph: Arc::new(graph),
            config: config.clone(),
        })
    }

    /// Get the underlying Graph handle for executing queries
    #[allow(dead_code)]
    pub fn graph(&self) -> &Graph {
        &self.graph
    }

    /// Run a query ignoring the result
    pub async fn run(&self, query: neo4rs::Query) -> Result<()> {
        self.graph
            .run(query)
            .await
            .with_context(|| "Failed to execute Memgraph query")?;

        Ok(())
    }

    /// Execute multiple queries in a transaction
    /// All queries succeed or all fail (atomic)
    #[instrument(skip(self, queries), fields(query_count = queries.len()))]
    pub async fn execute_transaction(&self, queries: Vec<neo4rs::Query>) -> Result<()> {
        if queries.is_empty() {
            return Ok(());
        }

        let mut txn = self
            .graph
            .start_txn()
            .await
            .context("Failed to start Memgraph transaction")?;

        for query in &queries {
            if let Err(e) = txn.run(query.clone()).await {
                warn!("Transaction query failed, rolling back: {}", e);
                let _ = txn.rollback().await;
                return Err(e.into());
            }
        }

        txn.commit()
            .await
            .context("Failed to commit Memgraph transaction")?;

        Ok(())
    }

    /// Health check - verify connection is alive
    pub async fn health_check(&self) -> Result<bool> {
        let query = neo4rs::query("RETURN 1 as health");
        match self.graph.run(query).await {
            Ok(_) => Ok(true),
            Err(e) => {
                warn!("Memgraph health check failed: {}", e);
                Ok(false)
            }
        }
    }

    /// Run schema setup queries (constraints and indexes)
    #[instrument(skip(self))]
    pub async fn setup_schema(&self) -> Result<()> {
        info!("Setting up Memgraph schema...");

        // Package unique constraint
        self.run(neo4rs::query(
            "CREATE CONSTRAINT ON (p:Package) ASSERT p.id IS UNIQUE",
        ))
        .await
        .ok(); // Ignore if already exists

        // Version unique constraint
        self.run(neo4rs::query(
            "CREATE CONSTRAINT ON (v:Version) ASSERT v.id IS UNIQUE",
        ))
        .await
        .ok();

        // Indexes for query performance
        let indexes = [
            "CREATE INDEX ON :Package(ecosystem)",
            "CREATE INDEX ON :Package(name)",
            "CREATE INDEX ON :Package(name_lc)",
            "CREATE INDEX ON :Package(tenant_id)",
            "CREATE INDEX ON :Version(tenant_id)",
            "CREATE INDEX ON :Version(package_id)",
            "CREATE INDEX ON :Version(version)",
            "CREATE INDEX ON :Version(yanked)",
            "CREATE INDEX ON :Version(published_at)",
            "CREATE INDEX ON :Package(updated_at)",
            "CREATE INDEX ON :Package(deleted_at)",
        ];

        for idx_query in indexes {
            self.run(neo4rs::query(idx_query)).await.ok();
        }

        info!("Memgraph schema setup complete");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires running Memgraph
    async fn test_connect() {
        let config = MemgraphConfig {
            uri: "bolt://localhost:7687".to_string(),
            username: None,
            password: None,
            pool_size: 5,
            connection_timeout_secs: 10,
            query_timeout_secs: 30,
        };

        let client = MemgraphClient::connect(&config).await.unwrap();
        assert!(client.health_check().await.unwrap());
    }
}
