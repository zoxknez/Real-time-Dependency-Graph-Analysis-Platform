//! Configuration for API Gateway service

use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub memgraph: MemgraphConfig,
    pub redis: RedisConfig,
    pub kafka: KafkaConfig,
    pub qdrant: QdrantConfig,
    pub embedding: EmbeddingConfig,
    pub gemini: GeminiConfig,
    pub guardrails: GuardrailsConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeminiConfig {
    pub api_key: String,
    pub flash_model: String,
    pub thinking_model: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MemgraphConfig {
    pub uri: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub pool_size: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedisConfig {
    pub url: String,
    pub cache_ttl_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct KafkaConfig {
    pub brokers: String,
    pub topic: String,
    pub consumer_group: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct QdrantConfig {
    pub enabled: bool,
    pub url: String,
    pub collection: String,
    pub dimension: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddingConfig {
    /// Embedding provider: "mock" (default) or "openai"
    pub provider: String,
    /// OpenAI API key (when provider=openai)
    pub openai_api_key: Option<String>,
    /// OpenAI model name (when provider=openai)
    pub model: String,
    /// Expected vector dimension (must match Qdrant collection)
    pub dimension: usize,

    /// Per-request timeout for embeddings calls
    pub timeout_secs: u64,
    /// Max retries for transient provider failures (e.g. 429/5xx)
    pub max_retries: usize,
    /// Base delay in milliseconds for exponential backoff
    pub retry_base_delay_ms: u64,
    /// Optional per-process rate limit (requests per minute). 0 disables.
    pub rate_limit_rpm: u32,
    /// In-memory cache TTL for embeddings
    pub cache_ttl_secs: u64,
    /// In-memory cache max entries
    pub cache_max_entries: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GuardrailsConfig {
    /// Max depth for graph traversals (reverseDependents, impactRadius)
    pub max_traversal_depth: i32,
    /// Max hops for shortest path queries
    pub max_path_hops: i32,
    /// Max results per query
    pub max_results: i32,
    /// Query complexity limit for async-graphql
    pub max_complexity: usize,
    /// Rate limit: requests per minute per API key
    pub rate_limit_rpm: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
                port: env::var("API_PORT")
                    .ok()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(8000),
            },
            memgraph: MemgraphConfig {
                uri: env::var("MEMGRAPH_URI")
                    .unwrap_or_else(|_| "bolt://127.0.0.1:7687".to_string()),
                username: env::var("MEMGRAPH_USER").ok(),
                password: env::var("MEMGRAPH_PASSWORD").ok(),
                pool_size: env::var("MEMGRAPH_POOL_SIZE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10),
            },
            redis: RedisConfig {
                url: env::var("REDIS_URL")
                    .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string()),
                cache_ttl_secs: env::var("CACHE_TTL_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(300), // 5 minutes default
            },
            kafka: KafkaConfig {
                brokers: env::var("KAFKA_BROKERS")
                    .unwrap_or_else(|_| "localhost:19092".to_string()),
                topic: env::var("KAFKA_TOPIC")
                    .unwrap_or_else(|_| "domain.package.events.v1".to_string()),
                consumer_group: env::var("KAFKA_CONSUMER_GROUP")
                    .unwrap_or_else(|_| "api-subscriptions-cg".to_string()),
            },
            qdrant: QdrantConfig {
                enabled: env::var("QDRANT_ENABLED")
                    .ok()
                    .map(|s| matches!(s.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
                    .unwrap_or(true),
                url: env::var("QDRANT_URL")
                    .unwrap_or_else(|_| "http://127.0.0.1:6334".to_string()),
                collection: env::var("QDRANT_COLLECTION")
                    .unwrap_or_else(|_| "package_embeddings".to_string()),
                dimension: env::var("QDRANT_DIMENSION")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(384),
            },
            embedding: EmbeddingConfig {
                provider: env::var("EMBEDDING_PROVIDER")
                    .unwrap_or_else(|_| "mock".to_string()),
                openai_api_key: env::var("OPENAI_API_KEY").ok(),
                model: env::var("EMBEDDING_MODEL")
                    .unwrap_or_else(|_| "text-embedding-3-small".to_string()),
                dimension: env::var("EMBEDDING_DIMENSION")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(384),

                timeout_secs: env::var("EMBEDDING_TIMEOUT_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(30),
                max_retries: env::var("EMBEDDING_MAX_RETRIES")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(2),
                retry_base_delay_ms: env::var("EMBEDDING_RETRY_BASE_DELAY_MS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(200),
                rate_limit_rpm: env::var("EMBEDDING_RATE_LIMIT_RPM")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0),
                cache_ttl_secs: env::var("EMBEDDING_CACHE_TTL_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(3600),
                cache_max_entries: env::var("EMBEDDING_CACHE_MAX_ENTRIES")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10_000),
            },
            gemini: GeminiConfig {
                api_key: env::var("GEMINI_API_KEY").unwrap_or_default(),
                flash_model: env::var("GEMINI_FLASH_MODEL")
                    .unwrap_or_else(|_| "gemini-3-flash-preview".to_string()),
                thinking_model: env::var("GEMINI_THINKING_MODEL")
                    .unwrap_or_else(|_| "gemini-3-pro-preview".to_string()),
            },
            guardrails: GuardrailsConfig {
                max_traversal_depth: env::var("MAX_TRAVERSAL_DEPTH")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(5),
                max_path_hops: env::var("MAX_PATH_HOPS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10),
                max_results: env::var("MAX_RESULTS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(200),
                max_complexity: env::var("MAX_COMPLEXITY")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(1000),
                rate_limit_rpm: env::var("RATE_LIMIT_RPM")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(100),
            },
        }
    }
}

impl Config {
    pub fn from_env() -> Self {
        Self::default()
    }
}
