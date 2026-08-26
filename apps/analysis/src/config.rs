//! Configuration for analysis service

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Analysis service configuration
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Config {
    /// Kafka/Redpanda configuration
    #[serde(default)]
    pub kafka: KafkaConfig,

    /// Worker pool configuration
    #[serde(default)]
    pub workers: WorkerConfig,

    /// Parser configuration
    #[serde(default)]
    pub parser: ParserConfig,

    /// Embedding configuration
    #[serde(default)]
    pub embedding: EmbeddingConfig,

    /// Service configuration
    #[serde(default)]
    pub service: ServiceConfig,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct KafkaConfig {
    /// Broker addresses (comma-separated)
    #[serde(default = "default_brokers")]
    pub brokers: String,

    /// Consumer group ID
    #[serde(default = "default_consumer_group")]
    pub consumer_group: String,

    /// Topic to consume package events from
    #[serde(default = "default_input_topic")]
    pub input_topic: String,

    /// Topic to publish breaking change events to
    #[serde(default = "default_output_topic")]
    pub output_topic: String,

    /// Dead letter queue topic
    #[serde(default = "default_dlq_topic")]
    pub dlq_topic: String,

    /// Maximum retries before sending to DLQ
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct WorkerConfig {
    /// Number of parallel workers
    #[serde(default = "default_worker_count")]
    pub count: usize,

    /// Maximum queue size (backpressure)
    #[serde(default = "default_queue_size")]
    pub queue_size: usize,

    /// Parse timeout per file in seconds
    #[serde(default = "default_parse_timeout_secs")]
    pub parse_timeout_secs: u64,

    /// Graceful shutdown timeout in seconds
    #[serde(default = "default_shutdown_timeout_secs")]
    pub shutdown_timeout_secs: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ParserConfig {
    /// Enable Rust parsing
    #[serde(default = "default_true")]
    pub rust_enabled: bool,

    /// Enable JavaScript/TypeScript parsing
    #[serde(default = "default_true")]
    pub js_enabled: bool,

    /// Enable Python parsing
    #[serde(default = "default_true")]
    pub python_enabled: bool,

    /// Maximum file size to parse (bytes)
    #[serde(default = "default_max_file_size")]
    pub max_file_size: usize,

    /// Maximum files per package
    #[serde(default = "default_max_files")]
    pub max_files_per_package: usize,

    /// Maximum compressed tarball size to download (bytes)
    #[serde(default = "default_max_tarball_size_bytes")]
    pub max_tarball_size_bytes: usize,

    /// Maximum uncompressed package content to inspect (bytes)
    #[serde(default = "default_max_unpacked_size_bytes")]
    pub max_unpacked_size_bytes: usize,

    /// Maximum serialized snapshot size to cache (bytes)
    #[serde(default = "default_snapshot_max_bytes")]
    pub snapshot_max_bytes: usize,

    /// Maximum cached snapshots to retain per package
    #[serde(default = "default_snapshot_versions_per_package")]
    pub snapshot_versions_per_package: usize,

    /// Maximum total snapshot cache size across all packages (bytes)
    #[serde(default = "default_snapshot_total_max_bytes")]
    pub snapshot_total_max_bytes: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EmbeddingConfig {
    /// Embedding provider: "local" or "openai"
    #[serde(default = "default_embedding_provider")]
    pub provider: String,

    /// OpenAI API key (if using openai provider)
    pub openai_api_key: Option<String>,

    /// Local model path
    #[serde(default = "default_model_path")]
    pub model_path: String,

    /// Embedding dimension
    #[serde(default = "default_embedding_dim")]
    pub dimension: usize,

    /// Batch size for embedding generation
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServiceConfig {
    /// Service name for tracing
    #[serde(default = "default_service_name")]
    pub name: String,

    /// Log level
    #[serde(default = "default_log_level")]
    pub log_level: String,

    /// Enable metrics endpoint
    #[serde(default = "default_true")]
    pub metrics_enabled: bool,

    /// Metrics port
    #[serde(default = "default_metrics_port")]
    pub metrics_port: u16,
}

// Default functions
fn default_brokers() -> String {
    "localhost:19092".to_string()
}
fn default_consumer_group() -> String {
    "analysis-service-cg".to_string()
}
fn default_input_topic() -> String {
    "domain.package.events.v1".to_string()
}
fn default_output_topic() -> String {
    "domain.analysis.events.v1".to_string()
}
fn default_dlq_topic() -> String {
    "domain.analysis.dlq.v1".to_string()
}
fn default_max_retries() -> u32 {
    3
}
fn default_worker_count() -> usize {
    4
}
fn default_queue_size() -> usize {
    1000
}
fn default_parse_timeout_secs() -> u64 {
    30
}
fn default_shutdown_timeout_secs() -> u64 {
    30
}
fn default_true() -> bool {
    true
}
fn default_max_file_size() -> usize {
    1024 * 1024
} // 1MB
fn default_max_files() -> usize {
    1000
}
fn default_max_tarball_size_bytes() -> usize {
    64 * 1024 * 1024
} // 64MB
fn default_max_unpacked_size_bytes() -> usize {
    200 * 1024 * 1024
} // 200MB
fn default_snapshot_max_bytes() -> usize {
    5 * 1024 * 1024
} // 5MB
fn default_snapshot_versions_per_package() -> usize {
    20
}
fn default_snapshot_total_max_bytes() -> usize {
    256 * 1024 * 1024
} // 256MB
#[cfg(test)]
fn default_embedding_provider() -> String {
    "mock".to_string()
}
#[cfg(all(not(test), feature = "onnx"))]
fn default_embedding_provider() -> String {
    "local".to_string()
}
#[cfg(all(not(test), not(feature = "onnx")))]
fn default_embedding_provider() -> String {
    "mock".to_string()
}
fn default_model_path() -> String {
    "./models/all-MiniLM-L6-v2".to_string()
}
fn default_embedding_dim() -> usize {
    384
}
fn default_batch_size() -> usize {
    32
}
fn default_service_name() -> String {
    "analysis-service".to_string()
}
fn default_log_level() -> String {
    "info".to_string()
}
fn default_metrics_port() -> u16 {
    9091
}

impl Default for KafkaConfig {
    fn default() -> Self {
        Self {
            brokers: default_brokers(),
            consumer_group: default_consumer_group(),
            input_topic: default_input_topic(),
            output_topic: default_output_topic(),
            dlq_topic: default_dlq_topic(),
            max_retries: default_max_retries(),
        }
    }
}

impl Default for WorkerConfig {
    fn default() -> Self {
        Self {
            count: default_worker_count(),
            queue_size: default_queue_size(),
            parse_timeout_secs: default_parse_timeout_secs(),
            shutdown_timeout_secs: default_shutdown_timeout_secs(),
        }
    }
}

impl Default for ParserConfig {
    fn default() -> Self {
        Self {
            rust_enabled: true,
            js_enabled: true,
            python_enabled: true,
            max_file_size: default_max_file_size(),
            max_files_per_package: default_max_files(),
            max_tarball_size_bytes: default_max_tarball_size_bytes(),
            max_unpacked_size_bytes: default_max_unpacked_size_bytes(),
            snapshot_max_bytes: default_snapshot_max_bytes(),
            snapshot_versions_per_package: default_snapshot_versions_per_package(),
            snapshot_total_max_bytes: default_snapshot_total_max_bytes(),
        }
    }
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            provider: default_embedding_provider(),
            openai_api_key: None,
            model_path: default_model_path(),
            dimension: default_embedding_dim(),
            batch_size: default_batch_size(),
        }
    }
}

impl Default for ServiceConfig {
    fn default() -> Self {
        Self {
            name: default_service_name(),
            log_level: default_log_level(),
            metrics_enabled: true,
            metrics_port: default_metrics_port(),
        }
    }
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        let config = config::Config::builder()
            // Add defaults first
            .add_source(config::Config::try_from(&Config::default())?)
            .add_source(config::Environment::with_prefix("ANALYSIS").separator("__"))
            .build()
            .context("Failed to build configuration")?;

        config
            .try_deserialize()
            .context("Failed to deserialize configuration")
    }

    /// Get parse timeout as Duration
    pub fn parse_timeout(&self) -> Duration {
        Duration::from_secs(self.workers.parse_timeout_secs)
    }

    /// Get shutdown timeout as Duration
    pub fn shutdown_timeout(&self) -> Duration {
        Duration::from_secs(self.workers.shutdown_timeout_secs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.kafka.brokers, "localhost:19092");
        assert!(config.parser.rust_enabled);
    }
}
