//! Memgraph Client Wrapper
//!
//! Provides a high-level interface for interacting with Memgraph graph database.
//! Features:
//! - Connection pooling
//! - Retry logic with exponential backoff
//! - Query builder helpers
//! - Transaction support

use anyhow::{Context, Result};
use neo4rs::{query, Graph, Query};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{error, info, instrument, warn};

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/// Memgraph connection configuration
#[derive(Debug, Clone)]
pub struct MemgraphConfig {
    /// Connection URI (bolt://host:port)
    pub uri: String,
    /// Username for authentication
    pub username: Option<String>,
    /// Password for authentication
    pub password: Option<String>,
    /// Maximum connection pool size
    pub max_connections: usize,
    /// Connection timeout
    pub connect_timeout: Duration,
    /// Query timeout
    pub query_timeout: Duration,
    /// Number of retries for failed queries
    pub max_retries: u32,
}

impl Default for MemgraphConfig {
    fn default() -> Self {
        Self {
            uri: "bolt://localhost:7687".to_string(),
            username: None,
            password: None,
            max_connections: 10,
            connect_timeout: Duration::from_secs(30),
            query_timeout: Duration::from_secs(60),
            max_retries: 3,
        }
    }
}

impl MemgraphConfig {
    /// Create config from environment variables
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            uri: std::env::var("MEMGRAPH_URI")
                .unwrap_or_else(|_| "bolt://localhost:7687".to_string()),
            username: std::env::var("MEMGRAPH_USER").ok(),
            password: std::env::var("MEMGRAPH_PASSWORD").ok(),
            max_connections: std::env::var("MEMGRAPH_MAX_CONNECTIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10),
            connect_timeout: Duration::from_secs(
                std::env::var("MEMGRAPH_CONNECT_TIMEOUT_SECS")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(30),
            ),
            query_timeout: Duration::from_secs(
                std::env::var("MEMGRAPH_QUERY_TIMEOUT_SECS")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(60),
            ),
            max_retries: std::env::var("MEMGRAPH_MAX_RETRIES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3),
        })
    }
}

// ═══════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════

/// Memgraph client with connection pooling and retry logic
pub struct MemgraphClient {
    graph: Graph,
    config: MemgraphConfig,
    /// Connection health status
    healthy: Arc<RwLock<bool>>,
}

impl MemgraphClient {
    /// Create a new Memgraph client
    #[instrument(skip(config), fields(uri = %config.uri))]
    pub async fn new(config: MemgraphConfig) -> Result<Self> {
        info!("Connecting to Memgraph");

        let mut graph_config = neo4rs::ConfigBuilder::new()
            .uri(&config.uri)
            .fetch_size(500)
            .max_connections(config.max_connections);

        if let (Some(user), Some(pass)) = (&config.username, &config.password) {
            graph_config = graph_config.user(user).password(pass);
        }

        let graph = Graph::connect(graph_config.build()?)
            .await
            .context("Failed to connect to Memgraph")?;

        info!("Successfully connected to Memgraph");

        Ok(Self {
            graph,
            config,
            healthy: Arc::new(RwLock::new(true)),
        })
    }

    /// Create client from environment variables
    pub async fn from_env() -> Result<Self> {
        let config = MemgraphConfig::from_env()?;
        Self::new(config).await
    }

    /// Execute a query with retry logic
    #[instrument(skip(self, query), fields(query_text))]
    pub async fn execute(&self, query: Query) -> Result<Vec<neo4rs::Row>> {
        let mut attempts = 0;
        let mut last_error = None;

        while attempts < self.config.max_retries {
            match self.execute_once(query.clone()).await {
                Ok(rows) => return Ok(rows),
                Err(e) => {
                    attempts += 1;
                    last_error = Some(e);
                    
                    if attempts < self.config.max_retries {
                        let delay = Duration::from_millis(100 * 2u64.pow(attempts));
                        warn!(
                            attempt = attempts,
                            max_retries = self.config.max_retries,
                            delay_ms = delay.as_millis(),
                            "Query failed, retrying"
                        );
                        tokio::time::sleep(delay).await;
                    }
                }
            }
        }

        Err(last_error.unwrap())
    }

    /// Execute query once without retry
    async fn execute_once(&self, query: Query) -> Result<Vec<neo4rs::Row>> {
        let mut result = self
            .graph
            .execute(query)
            .await
            .context("Failed to execute query")?;

        let mut rows = Vec::new();
        while let Some(row) = result.next().await? {
            rows.push(row);
        }

        Ok(rows)
    }

    /// Execute a query that returns no results
    #[instrument(skip(self, query))]
    pub async fn run(&self, query: Query) -> Result<()> {
        self.graph
            .run(query)
            .await
            .context("Failed to run query")?;
        Ok(())
    }

    /// Execute multiple queries in a transaction
    #[instrument(skip(self, queries))]
    pub async fn transaction(&self, queries: Vec<Query>) -> Result<()> {
        let mut txn = self
            .graph
            .start_txn()
            .await
            .context("Failed to start transaction")?;

        for q in queries {
            if let Err(e) = txn.run(q).await {
                txn.rollback().await.ok();
                return Err(e).context("Transaction query failed");
            }
        }

        txn.commit().await.context("Failed to commit transaction")?;
        Ok(())
    }

    /// Health check
    pub async fn health_check(&self) -> bool {
        match self.execute(query("RETURN 1 AS health")).await {
            Ok(_) => {
                *self.healthy.write().await = true;
                true
            }
            Err(e) => {
                error!(error = %e, "Memgraph health check failed");
                *self.healthy.write().await = false;
                false
            }
        }
    }

    /// Check if client is healthy
    pub async fn is_healthy(&self) -> bool {
        *self.healthy.read().await
    }

    /// Get graph statistics
    #[instrument(skip(self))]
    pub async fn get_stats(&self) -> Result<GraphStats> {
        let node_count: i64 = self
            .execute(query("MATCH (n) RETURN count(n) as count"))
            .await?
            .first()
            .and_then(|r| r.get("count").ok())
            .unwrap_or(0);

        let edge_count: i64 = self
            .execute(query("MATCH ()-[r]->() RETURN count(r) as count"))
            .await?
            .first()
            .and_then(|r| r.get("count").ok())
            .unwrap_or(0);

        let package_count: i64 = self
            .execute(query("MATCH (p:Package) RETURN count(p) as count"))
            .await?
            .first()
            .and_then(|r| r.get("count").ok())
            .unwrap_or(0);

        let version_count: i64 = self
            .execute(query("MATCH (v:Version) RETURN count(v) as count"))
            .await?
            .first()
            .and_then(|r| r.get("count").ok())
            .unwrap_or(0);

        Ok(GraphStats {
            node_count: node_count as u64,
            edge_count: edge_count as u64,
            package_count: package_count as u64,
            version_count: version_count as u64,
        })
    }
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/// Graph statistics
#[derive(Debug, Clone)]
pub struct GraphStats {
    pub node_count: u64,
    pub edge_count: u64,
    pub package_count: u64,
    pub version_count: u64,
}

// ═══════════════════════════════════════════════════════════════
// QUERY HELPERS
// ═══════════════════════════════════════════════════════════════

/// Query builder helpers for common operations
pub struct QueryBuilder;

impl QueryBuilder {
    /// Create a package node
    pub fn create_package(id: &str, name: &str, ecosystem: &str) -> Query {
        query("MERGE (p:Package {id: $id}) SET p.name = $name, p.ecosystem = $ecosystem")
            .param("id", id)
            .param("name", name)
            .param("ecosystem", ecosystem)
    }

    /// Create a version node
    pub fn create_version(package_id: &str, version: &str) -> Query {
        let version_id = format!("{}@{}", package_id, version);
        query(
            r#"
            MATCH (p:Package {id: $package_id})
            MERGE (v:Version {id: $version_id})
            SET v.version = $version
            MERGE (p)-[:HAS_VERSION]->(v)
            "#,
        )
        .param("package_id", package_id)
        .param("version_id", version_id)
        .param("version", version)
    }

    /// Create a dependency edge
    pub fn create_dependency(from_version_id: &str, to_package_id: &str, version_req: &str) -> Query {
        query(
            r#"
            MATCH (from:Version {id: $from_id})
            MATCH (to:Package {id: $to_id})
            MERGE (from)-[d:DEPENDS_ON]->(to)
            SET d.version_req = $version_req
            "#,
        )
        .param("from_id", from_version_id)
        .param("to_id", to_package_id)
        .param("version_req", version_req)
    }

    /// Find reverse dependents
    pub fn reverse_dependents(package_id: &str, limit: i32) -> Query {
        query(
            r#"
            MATCH (p:Package {id: $id})<-[:DEPENDS_ON]-(v:Version)<-[:HAS_VERSION]-(dep:Package)
            RETURN DISTINCT dep.id as id, dep.name as name, dep.ecosystem as ecosystem
            LIMIT $limit
            "#,
        )
        .param("id", package_id)
        .param("limit", limit as i64)
    }

    /// Find dependency path between two packages
    pub fn dependency_path(from_id: &str, to_id: &str) -> Query {
        query(
            r#"
            MATCH path = shortestPath(
                (from:Package {id: $from_id})-[:DEPENDS_ON*..10]->(to:Package {id: $to_id})
            )
            RETURN [node in nodes(path) | node.id] as path
            "#,
        )
        .param("from_id", from_id)
        .param("to_id", to_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = MemgraphConfig::default();
        assert_eq!(config.uri, "bolt://localhost:7687");
        assert_eq!(config.max_connections, 10);
        assert_eq!(config.max_retries, 3);
    }

    #[test]
    fn test_query_builder_create_package() {
        let _query = QueryBuilder::create_package("cargo:serde", "serde", "cargo");
        // Query is valid if it doesn't panic
    }

    #[test]
    fn test_query_builder_create_version() {
        let _query = QueryBuilder::create_version("cargo:serde", "1.0.0");
    }

    #[test]
    fn test_query_builder_create_dependency() {
        let _query = QueryBuilder::create_dependency(
            "cargo:my-crate@1.0.0",
            "cargo:serde",
            "^1.0",
        );
    }
}
