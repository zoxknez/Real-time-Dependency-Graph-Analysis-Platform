//! Configuration for graph-writer service
use serde::Deserialize;

/// Graph Writer Service Configuration
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct Config {
    /// Service name for tracing/metrics
    #[serde(default = "default_service_name")]
    pub service_name: String,

    /// Memgraph configuration
    pub memgraph: MemgraphConfig,

    /// Kafka consumer configuration
    pub kafka: KafkaConfig,

    /// HTTP server configuration (metrics/health)
    pub http: HttpConfig,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct MemgraphConfig {
    /// Memgraph Bolt URI (e.g., "bolt://localhost:7687")
    #[serde(default = "default_memgraph_uri")]
    pub uri: String,

    /// Memgraph username
    #[serde(default)]
    pub username: Option<String>,

    /// Memgraph password
    #[serde(default)]
    pub password: Option<String>,

    /// Connection pool size
    #[serde(default = "default_pool_size")]
    pub pool_size: usize,

    /// Connection timeout in seconds
    #[serde(default = "default_connection_timeout")]
    pub connection_timeout_secs: u64,

    /// Query timeout in seconds
    #[serde(default = "default_query_timeout")]
    pub query_timeout_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct KafkaConfig {
    /// Kafka broker list
    #[serde(default = "default_kafka_brokers")]
    pub brokers: String,

    /// Consumer group ID
    #[serde(default = "default_group_id")]
    pub group_id: String,

    /// Topic to consume (single topic envelope pattern)
    #[serde(default = "default_topic")]
    pub topic: String,

    /// Dead letter queue topic
    #[serde(default = "default_dlq_topic")]
    pub dlq_topic: String,

    /// Auto offset reset policy
    #[serde(default = "default_auto_offset_reset")]
    pub auto_offset_reset: String,

    /// Enable auto commit (should be false for at-least-once)
    #[serde(default)]
    pub enable_auto_commit: bool,

    /// Session timeout in milliseconds
    #[serde(default = "default_session_timeout")]
    pub session_timeout_ms: i32,

    /// Heartbeat interval in milliseconds
    #[serde(default = "default_heartbeat_interval")]
    pub heartbeat_interval_ms: i32,

    /// Max poll interval in milliseconds
    #[serde(default = "default_max_poll_interval")]
    pub max_poll_interval_ms: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HttpConfig {
    /// HTTP server host
    #[serde(default = "default_http_host")]
    pub host: String,

    /// HTTP server port (metrics/health)
    #[serde(default = "default_http_port")]
    pub port: u16,
}

// Default value functions
fn default_service_name() -> String {
    "graph-writer".to_string()
}

fn default_memgraph_uri() -> String {
    "127.0.0.1:7687".to_string()
}

fn default_pool_size() -> usize {
    10
}

fn default_connection_timeout() -> u64 {
    30
}

fn default_query_timeout() -> u64 {
    60
}

fn default_kafka_brokers() -> String {
    "localhost:19092".to_string()
}

fn default_group_id() -> String {
    "graph-writer-cg".to_string()
}

fn default_topic() -> String {
    "domain.package.events.v1".to_string()
}

fn default_dlq_topic() -> String {
    "domain.ingestion.deadletter.v1".to_string()
}

fn default_auto_offset_reset() -> String {
    "earliest".to_string()
}

fn default_session_timeout() -> i32 {
    45000
}

fn default_heartbeat_interval() -> i32 {
    3000
}

fn default_max_poll_interval() -> i32 {
    300000
}

fn default_http_host() -> String {
    "0.0.0.0".to_string()
}

fn default_http_port() -> u16 {
    8081
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> anyhow::Result<Self> {
        let config = config::Config::builder()
            .add_source(
                config::Environment::default()
                    .separator("__")
                    .prefix("GRAPH_WRITER"),
            )
            .set_default("service_name", default_service_name())?
            .set_default("memgraph.uri", default_memgraph_uri())?
            .set_default("memgraph.pool_size", default_pool_size() as i64)?
            .set_default(
                "memgraph.connection_timeout_secs",
                default_connection_timeout() as i64,
            )?
            .set_default(
                "memgraph.query_timeout_secs",
                default_query_timeout() as i64,
            )?
            .set_default("kafka.brokers", default_kafka_brokers())?
            .set_default("kafka.group_id", default_group_id())?
            .set_default("kafka.topic", default_topic())?
            .set_default("kafka.dlq_topic", default_dlq_topic())?
            .set_default("kafka.auto_offset_reset", default_auto_offset_reset())?
            .set_default("kafka.enable_auto_commit", false)?
            .set_default("kafka.session_timeout_ms", default_session_timeout())?
            .set_default("kafka.heartbeat_interval_ms", default_heartbeat_interval())?
            .set_default("kafka.max_poll_interval_ms", default_max_poll_interval())?
            .set_default("http.host", default_http_host())?
            .set_default("http.port", default_http_port() as i64)?
            .build()?;

        config.try_deserialize().map_err(Into::into)
    }
}
