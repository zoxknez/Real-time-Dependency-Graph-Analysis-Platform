//! Memgraph Client Wrapper
//!
//! Provides a high-level interface for interacting with Memgraph graph database.
//! Features:
//! - Connection pooling
//! - Retry logic with exponential backoff
//! - Query builder helpers
//! - Transaction support

use anyhow::{Context, Result};
use models::tenant::TenantContext;
use neo4rs::{Graph, Query, query};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{error, info, instrument};

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
    /// Number of failures before opening the application circuit
    pub circuit_failure_threshold: u32,
    /// Maximum duration for the single-attempt readiness probe
    pub health_timeout: Duration,
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
            circuit_failure_threshold: 5,
            health_timeout: Duration::from_secs(2),
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
            circuit_failure_threshold: std::env::var("MEMGRAPH_CIRCUIT_FAILURE_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .map(|v: u32| v.clamp(1, 20))
                .unwrap_or(3),
            health_timeout: Duration::from_secs(
                std::env::var("MEMGRAPH_HEALTH_TIMEOUT_SECS")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .filter(|v| (1..=10).contains(v))
                    .unwrap_or(2),
            ),
        })
    }
}

// ═══════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════

/// Memgraph client with connection pooling and retry logic
pub struct MemgraphClient {
    graph: Graph,
    _config: MemgraphConfig,
    /// Connection health status
    healthy: Arc<RwLock<bool>>,
    /// Circuit breaker for fault tolerance
    circuit_breaker: Arc<crate::circuit_breaker::CircuitBreaker>,
    /// Resilience config
    resilience_config: crate::resilience::ResilienceConfig,
}

impl MemgraphClient {
    /// Create a new Memgraph client
    #[instrument(skip(config), fields(uri = %config.uri))]
    pub async fn new(config: MemgraphConfig) -> Result<Self> {
        info!("Connecting to Memgraph");

        // Memgraph accepts these placeholder credentials when auth is disabled,
        // while neo4rs still requires non-empty user/password fields.
        let user = config.username.as_deref().unwrap_or("memgraph");
        let pass = config.password.as_deref().unwrap_or("memgraph");

        let graph_config = neo4rs::ConfigBuilder::new()
            .uri(&config.uri)
            .user(user)
            .password(pass)
            .db("memgraph")
            .fetch_size(500)
            .max_connections(config.max_connections);

        let graph =
            Graph::connect(graph_config.build()?).context("Failed to connect to Memgraph")?;

        info!("Successfully connected to Memgraph");

        let circuit_breaker = Arc::new(crate::circuit_breaker::CircuitBreaker::new(
            "memgraph",
            "query",
            crate::circuit_breaker::CircuitBreakerConfig {
                failure_threshold: config.circuit_failure_threshold,
                success_threshold: 2,
                timeout_ms: 30_000,
                half_open_requests: 5,
            },
        ));

        let resilience_config = crate::resilience::ResilienceConfig {
            timeout: config.query_timeout,
            max_retries: config.max_retries,
            base_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(5),
            use_jitter: true,
        };

        Ok(Self {
            graph,
            _config: config,
            healthy: Arc::new(RwLock::new(true)),
            circuit_breaker,
            resilience_config,
        })
    }

    /// Create client from environment variables
    pub async fn from_env() -> Result<Self> {
        let config = MemgraphConfig::from_env()?;
        Self::new(config).await
    }

    /// Execute a query with retry logic and circuit breaker
    #[instrument(skip(self, query, tenant_ctx), fields(query_text))]
    pub async fn execute(
        &self,
        mut query: Query,
        tenant_ctx: Option<&TenantContext>,
    ) -> Result<Vec<neo4rs::Row>> {
        if let Some(ctx) = tenant_ctx {
            query = query.param("tenant_id", ctx.tenant_id.to_string());
        }

        crate::resilience::with_resilience(
            "memgraph",
            "execute",
            &self.resilience_config,
            || async {
                self.circuit_breaker
                    .call::<_, _, anyhow::Error>(async { self.execute_once(query.clone()).await })
                    .await
            },
        )
        .await
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
    #[instrument(skip(self, query, tenant_ctx))]
    pub async fn run(&self, mut query: Query, tenant_ctx: Option<&TenantContext>) -> Result<()> {
        if let Some(ctx) = tenant_ctx {
            query = query.param("tenant_id", ctx.tenant_id.to_string());
        }

        crate::resilience::with_resilience("memgraph", "run", &self.resilience_config, || async {
            self.circuit_breaker
                .call::<_, _, anyhow::Error>(async { self.run_once(query.clone()).await })
                .await
        })
        .await
    }

    async fn run_once(&self, query: Query) -> Result<()> {
        self.graph.run(query).await.context("Failed to run query")?;
        Ok(())
    }

    /// Execute multiple queries in a transaction
    #[instrument(skip(self, queries, tenant_ctx))]
    pub async fn transaction(
        &self,
        mut queries: Vec<Query>,
        tenant_ctx: Option<&TenantContext>,
    ) -> Result<()> {
        // Inject tenant ID into all queries if context is present
        if let Some(ctx) = tenant_ctx {
            let tenant_id = ctx.tenant_id.to_string();
            for query in &mut queries {
                // Cloning string here is acceptable for txn overhead
                *query = query.clone().param("tenant_id", tenant_id.clone());
            }
        }

        // Transactions are harder to wrap with simple retry because they are stateful.
        // For now, we wrap the whole transaction block with CB, but handling retry needs care.
        // If we retry, we rerun the whole txn block.
        crate::resilience::with_resilience(
            "memgraph",
            "transaction",
            &self.resilience_config,
            || async {
                self.circuit_breaker
                    .call::<_, _, anyhow::Error>(async {
                        self.transaction_once(queries.clone()).await
                    })
                    .await
            },
        )
        .await
    }

    async fn transaction_once(&self, queries: Vec<Query>) -> Result<()> {
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
        self.health_check_fast().await
    }

    /// Execute a bounded, single-attempt readiness probe.
    ///
    /// This intentionally bypasses retries and the application circuit breaker so
    /// a dead or saturated database cannot make `/ready` hang for the full query
    /// retry budget.
    pub async fn health_check_fast(&self) -> bool {
        let started = std::time::Instant::now();
        let probe = async {
            let mut result = self.graph.execute(query("RETURN 1 AS health")).await?;
            let _ = result.next().await?;
            anyhow::Ok(())
        };

        match tokio::time::timeout(self._config.health_timeout, probe).await {
            Ok(Ok(())) => {
                *self.healthy.write().await = true;
                tracing::debug!(
                    elapsed_ms = started.elapsed().as_millis(),
                    "Memgraph readiness probe succeeded"
                );
                true
            }
            Ok(Err(e)) => {
                error!(elapsed_ms = started.elapsed().as_millis(), error = %e, "Memgraph readiness probe failed");
                *self.healthy.write().await = false;
                false
            }
            Err(e) => {
                error!(elapsed_ms = started.elapsed().as_millis(), error = %e, "Memgraph readiness probe timed out");
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
        // These are composed of multiple calls, maybe wrap each or the whole thing?
        // Since get_stats is read-only composed, wrapping individual calls via execute is fine.
        let node_count: i64 = self
            .execute(query("MATCH (n) RETURN count(n) as count"), None)
            .await?
            .first()
            .and_then(|r| r.get("count").ok())
            .unwrap_or(0);

        let edge_count: i64 = self
            .execute(query("MATCH ()-[r]->() RETURN count(r) as count"), None)
            .await?
            .first()
            .and_then(|r| r.get("count").ok())
            .unwrap_or(0);

        let package_count: i64 = self
            .execute(query("MATCH (p:Package) RETURN count(p) as count"), None)
            .await?
            .first()
            .and_then(|r| r.get("count").ok())
            .unwrap_or(0);

        let version_count: i64 = self
            .execute(query("MATCH (v:Version) RETURN count(v) as count"), None)
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

    /// Get memory usage statistics
    ///
    /// Uses Memgraph's internal memory tracking to detect OOM risk.
    #[instrument(skip(self))]
    pub async fn get_memory_stats(&self) -> Result<MemoryStats> {
        // Use SHOW STORAGE INFO which returns memory information
        let rows = self.execute(query("SHOW STORAGE INFO"), None).await?;

        let mut stats = MemoryStats::default();

        for row in rows {
            // SHOW STORAGE INFO returns rows with 'setting_name' and 'setting_value' columns
            let name: String = row.get("setting_name").unwrap_or_default();
            let value: String = row.get("setting_value").unwrap_or_default();

            match name.as_str() {
                "memory_usage" => {
                    stats.memory_used_bytes = parse_memgraph_bytes(&value);
                }
                "peak_memory_usage" => {
                    stats.peak_memory_bytes = parse_memgraph_bytes(&value);
                }
                "memory_limit" => {
                    stats.memory_limit_bytes = parse_memgraph_bytes(&value);
                }
                _ => {}
            }
        }

        // Calculate percentage if limit is set
        if stats.memory_limit_bytes > 0 {
            stats.usage_percent =
                (stats.memory_used_bytes as f64 / stats.memory_limit_bytes as f64) * 100.0;
            stats.under_pressure = stats.usage_percent > 80.0;
            stats.critical = stats.usage_percent > 95.0;
        }

        // Record as Prometheus metrics
        metrics::gauge!("memgraph_memory_used_bytes").set(stats.memory_used_bytes as f64);
        metrics::gauge!("memgraph_memory_limit_bytes").set(stats.memory_limit_bytes as f64);
        metrics::gauge!("memgraph_memory_usage_percent").set(stats.usage_percent);

        Ok(stats)
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

/// Memory usage statistics from Memgraph
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct MemoryStats {
    /// Total memory used by Memgraph (bytes)
    pub memory_used_bytes: u64,
    /// Peak memory usage (bytes)
    pub peak_memory_bytes: u64,
    /// Memory limit configured (bytes), 0 if unlimited
    pub memory_limit_bytes: u64,
    /// Memory usage as percentage of limit (0-100)
    pub usage_percent: f64,
    /// Whether memory pressure is high (>80%)
    pub under_pressure: bool,
    /// Whether critical (>95%)
    pub critical: bool,
}

/// Parse Memgraph byte strings like "1.5 GB", "512 MB", "1024 KB" to bytes
fn parse_memgraph_bytes(value: &str) -> u64 {
    let value = value.trim();

    // Try to parse as raw number first
    if let Ok(n) = value.parse::<u64>() {
        return n;
    }

    // Parse "X.Y UNIT" format
    let parts: Vec<&str> = value.split_whitespace().collect();
    if parts.len() >= 2 {
        if let Ok(num) = parts[0].parse::<f64>() {
            let multiplier = match parts[1].to_uppercase().as_str() {
                "B" => 1u64,
                "KB" | "KIB" => 1024,
                "MB" | "MIB" => 1024 * 1024,
                "GB" | "GIB" => 1024 * 1024 * 1024,
                "TB" | "TIB" => 1024 * 1024 * 1024 * 1024,
                _ => 1,
            };
            return (num * multiplier as f64) as u64;
        }
    }

    0
}

// ═══════════════════════════════════════════════════════════════
// QUERY HELPERS
// ═══════════════════════════════════════════════════════════════

/// Query builder helpers for common operations
pub struct QueryBuilder;

impl QueryBuilder {
    /// Create a package node
    pub fn create_package(tenant_id: &str, id: &str, name: &str, ecosystem: &str) -> Query {
        query("MERGE (p:Package {id: $id, tenant_id: $tenant_id}) SET p.name = $name, p.ecosystem = $ecosystem")
            .param("tenant_id", tenant_id)
            .param("id", id)
            .param("name", name)
            .param("ecosystem", ecosystem)
    }

    /// Create a version node
    pub fn create_version(tenant_id: &str, package_id: &str, version: &str) -> Query {
        let version_id = format!("{}@{}", package_id, version);
        query(
            r#"
            MATCH (p:Package {id: $package_id, tenant_id: $tenant_id})
            MERGE (v:Version {id: $version_id, tenant_id: $tenant_id})
            SET v.version = $version
            MERGE (p)-[:HAS_VERSION]->(v)
            "#,
        )
        .param("tenant_id", tenant_id)
        .param("package_id", package_id)
        .param("version_id", version_id)
        .param("version", version)
    }

    /// Create a dependency edge
    pub fn create_dependency(
        tenant_id: &str,
        from_version_id: &str,
        to_package_id: &str,
        version_req: &str,
    ) -> Query {
        query(
            r#"
            MATCH (from:Version {id: $from_id, tenant_id: $tenant_id})
            MATCH (to:Package {id: $to_id, tenant_id: $tenant_id})
            MERGE (from)-[d:DEPENDS_ON]->(to)
            SET d.version_req = $version_req
            "#,
        )
        .param("tenant_id", tenant_id)
        .param("from_id", from_version_id)
        .param("to_id", to_package_id)
        .param("version_req", version_req)
    }

    /// Find reverse dependents
    pub fn reverse_dependents(tenant_id: &str, package_id: &str, limit: i32) -> Query {
        query(
            r#"
            MATCH (p:Package {id: $id, tenant_id: $tenant_id})<-[:DEPENDS_ON]-(v:Version)<-[:HAS_VERSION]-(dep:Package)
            RETURN DISTINCT dep.id as id, dep.name as name, dep.ecosystem as ecosystem
            LIMIT $limit
            "#,
        )
        .param("tenant_id", tenant_id)
        .param("id", package_id)
        .param("limit", limit as i64)
    }

    /// Find dependency path between two packages
    pub fn dependency_path(tenant_id: &str, from_id: &str, to_id: &str) -> Query {
        query(
            r#"
            MATCH path = shortestPath(
                (from:Package {id: $from_id, tenant_id: $tenant_id})-[:DEPENDS_ON*..10]->(to:Package {id: $to_id})
            )
            RETURN [node in nodes(path) | node.id] as path
            "#,
        )
        .param("tenant_id", tenant_id)
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
        assert_eq!(config.circuit_failure_threshold, 5);
        assert_eq!(config.health_timeout, Duration::from_secs(2));
    }

    #[test]
    fn test_query_builder_create_package() {
        let _query = QueryBuilder::create_package("tenant-1", "cargo:serde", "serde", "cargo");
        // Query is valid if it doesn't panic
    }

    #[test]
    fn test_query_builder_create_version() {
        let _query = QueryBuilder::create_version("tenant-1", "cargo:serde", "1.0.0");
    }

    #[test]
    fn test_query_builder_create_dependency() {
        let _query = QueryBuilder::create_dependency(
            "tenant-1",
            "cargo:my-crate@1.0.0",
            "cargo:serde",
            "^1.0",
        );
    }
}
