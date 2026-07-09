//! RisingWave Streaming SQL Client
//!
//! Provides interface to RisingWave for real-time analytics.
//! Features:
//! - Connection pooling via sqlx
//! - Materialized view management
//! - Stream queries

use anyhow::{Context, Result};
use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;
use tracing::{error, info, instrument};

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/// RisingWave connection configuration
#[derive(Debug, Clone)]
pub struct RisingWaveConfig {
    /// Database URL (postgresql://user:pass@host:port/db)
    pub url: String,
    /// Maximum pool connections
    pub max_connections: u32,
    /// Minimum pool connections
    pub min_connections: u32,
    /// Connection timeout
    pub connect_timeout: Duration,
    /// Idle connection timeout
    pub idle_timeout: Duration,
}

impl Default for RisingWaveConfig {
    fn default() -> Self {
        Self {
            url: "postgresql://root@localhost:4566/dev".to_string(),
            max_connections: 10,
            min_connections: 1,
            connect_timeout: Duration::from_secs(30),
            idle_timeout: Duration::from_secs(600),
        }
    }
}

impl RisingWaveConfig {
    /// Create config from environment variables
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            url: std::env::var("RISINGWAVE_URL")
                .unwrap_or_else(|_| "postgresql://root@localhost:4566/dev".to_string()),
            max_connections: std::env::var("RISINGWAVE_MAX_CONNECTIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10),
            min_connections: std::env::var("RISINGWAVE_MIN_CONNECTIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1),
            connect_timeout: Duration::from_secs(30),
            idle_timeout: Duration::from_secs(600),
        })
    }
}

// ═══════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════

/// RisingWave client with connection pooling
pub struct RisingWaveClient {
    pool: PgPool,
    #[allow(dead_code)]
    config: RisingWaveConfig,
}

impl RisingWaveClient {
    /// Create a new RisingWave client
    #[instrument(skip(config), fields(url = %config.url))]
    pub async fn new(config: RisingWaveConfig) -> Result<Self> {
        info!("Connecting to RisingWave");

        let pool = PgPoolOptions::new()
            .max_connections(config.max_connections)
            .min_connections(config.min_connections)
            .acquire_timeout(config.connect_timeout)
            .idle_timeout(config.idle_timeout)
            .connect(&config.url)
            .await
            .context("Failed to connect to RisingWave")?;

        info!("Successfully connected to RisingWave");

        Ok(Self { pool, config })
    }

    /// Create client from environment variables
    pub async fn from_env() -> Result<Self> {
        let config = RisingWaveConfig::from_env()?;
        Self::new(config).await
    }

    /// Get connection pool reference
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Execute a query
    #[instrument(skip(self, query))]
    pub async fn execute(&self, query: &str) -> Result<u64> {
        let result = sqlx::query(query)
            .execute(&self.pool)
            .await
            .context("Failed to execute query")?;

        Ok(result.rows_affected())
    }

    /// Fetch all rows as JSON
    #[instrument(skip(self, query))]
    pub async fn fetch_all<T>(&self, query: &str) -> Result<Vec<T>>
    where
        T: for<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow> + Send + Unpin,
    {
        let rows = sqlx::query_as::<_, T>(query)
            .fetch_all(&self.pool)
            .await
            .context("Failed to fetch rows")?;

        Ok(rows)
    }

    /// Health check
    pub async fn health_check(&self) -> bool {
        match sqlx::query("SELECT 1").execute(&self.pool).await {
            Ok(_) => true,
            Err(e) => {
                error!(error = %e, "RisingWave health check failed");
                false
            }
        }
    }

    /// Create materialized view for package stats
    #[instrument(skip(self))]
    pub async fn create_package_stats_view(&self) -> Result<()> {
        let query = r#"
            CREATE MATERIALIZED VIEW IF NOT EXISTS package_stats AS
            SELECT
                ecosystem,
                COUNT(*) as package_count,
                COUNT(DISTINCT name) as unique_packages
            FROM packages
            GROUP BY ecosystem
        "#;

        self.execute(query).await?;
        info!("Created package_stats materialized view");
        Ok(())
    }

    /// Create materialized view for dependency counts
    #[instrument(skip(self))]
    pub async fn create_dependency_stats_view(&self) -> Result<()> {
        let query = r#"
            CREATE MATERIALIZED VIEW IF NOT EXISTS dependency_stats AS
            SELECT
                target_package_id,
                COUNT(*) as dependent_count
            FROM dependencies
            GROUP BY target_package_id
            ORDER BY dependent_count DESC
        "#;

        self.execute(query).await?;
        info!("Created dependency_stats materialized view");
        Ok(())
    }

    /// Create source from Kafka topic
    #[instrument(skip(self))]
    pub async fn create_kafka_source(
        &self,
        source_name: &str,
        topic: &str,
        brokers: &str,
    ) -> Result<()> {
        let query = format!(
            r#"
            CREATE SOURCE IF NOT EXISTS {} (
                package_id VARCHAR,
                version VARCHAR,
                ecosystem VARCHAR,
                event_type VARCHAR,
                timestamp TIMESTAMPTZ
            )
            WITH (
                connector = 'kafka',
                topic = '{}',
                properties.bootstrap.server = '{}',
                scan.startup.mode = 'earliest'
            ) FORMAT PLAIN ENCODE JSON
            "#,
            source_name, topic, brokers
        );

        self.execute(&query).await?;
        info!(source = source_name, topic = topic, "Created Kafka source");
        Ok(())
    }

    /// Get package statistics
    #[instrument(skip(self))]
    pub async fn get_ecosystem_stats(&self) -> Result<Vec<EcosystemStats>> {
        let query = "SELECT ecosystem, package_count, unique_packages FROM package_stats";
        self.fetch_all(query).await
    }

    /// Get most depended packages
    #[instrument(skip(self))]
    pub async fn get_top_dependencies(&self, limit: i32) -> Result<Vec<DependencyCount>> {
        let query = format!(
            "SELECT target_package_id, dependent_count FROM dependency_stats LIMIT {}",
            limit
        );
        self.fetch_all(&query).await
    }
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/// Ecosystem statistics
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EcosystemStats {
    pub ecosystem: String,
    pub package_count: i64,
    pub unique_packages: i64,
}

/// Dependency count
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DependencyCount {
    pub target_package_id: String,
    pub dependent_count: i64,
}

/// Package event from Kafka
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PackageEvent {
    pub package_id: String,
    pub version: String,
    pub ecosystem: String,
    pub event_type: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = RisingWaveConfig::default();
        assert!(config.url.contains("4566"));
        assert_eq!(config.max_connections, 10);
    }
}
