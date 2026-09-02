//! Configuration for API Gateway service
//!
//! Production-ready configuration with fail-fast validation.
//! In production mode, missing required environment variables cause panic.

use serde::Deserialize;
use std::env;
use std::time::Duration;
use thiserror::Error;

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION ERRORS
// ═══════════════════════════════════════════════════════════════

/// Configuration errors for future use with Result-based API
#[allow(dead_code)]
#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Missing required environment variable: {0}")]
    MissingRequired(String),

    #[error("Invalid environment variable {key}: {reason}")]
    InvalidValue { key: String, reason: String },

    #[error("Configuration validation failed: {0}")]
    ValidationFailed(String),
}

// ═══════════════════════════════════════════════════════════════
// ENVIRONMENT DETECTION
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Environment {
    #[default]
    Development,
    Staging,
    Production,
}

impl Environment {
    pub fn from_env() -> Self {
        match env::var("ENVIRONMENT").as_deref() {
            Ok("production") | Ok("prod") => Self::Production,
            Ok("staging") | Ok("stage") => Self::Staging,
            _ => Self::Development,
        }
    }

    pub fn is_production(&self) -> bool {
        matches!(self, Self::Production)
    }

    pub fn is_development(&self) -> bool {
        matches!(self, Self::Development)
    }
}

impl<'de> serde::Deserialize<'de> for Environment {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        match s.to_lowercase().as_str() {
            "production" | "prod" => Ok(Self::Production),
            "staging" | "stage" => Ok(Self::Staging),
            "development" | "dev" | "" => Ok(Self::Development),
            other => Err(serde::de::Error::custom(format!(
                "Unknown environment: {}. Expected: production, staging, development",
                other
            ))),
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// MAIN CONFIG
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub environment: Environment,
    pub server: ServerConfig,
    pub cors: CorsConfig,
    pub memgraph: MemgraphConfig,
    pub redis: RedisConfig,
    pub kafka: KafkaConfig,
    pub postgres: PostgresConfig,
    pub qdrant: QdrantConfig,
    pub embedding: EmbeddingConfig,
    pub gemini: GeminiConfig,
    pub guardrails: GuardrailsConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CorsConfig {
    /// Allowed origins (comma-separated)
    pub allowed_origins: Vec<String>,
    /// Allow credentials
    pub allow_credentials: bool,
    /// Max age for preflight cache (seconds)
    pub max_age_secs: u64,
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
    /// Request timeout in seconds
    pub request_timeout_secs: u64,
    /// Request body size limit in bytes
    pub max_body_size: usize,
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
pub struct PostgresConfig {
    /// PostgreSQL connection URL
    pub url: String,
    /// Connection pool size
    pub pool_size: u32,
    /// Connection acquire timeout in seconds
    pub connect_timeout_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct QdrantConfig {
    pub enabled: bool,
    pub url: String,
    pub api_key: Option<String>,
    pub collection: String,
    pub dimension: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddingConfig {
    /// Embedding provider: "openai", "tei", "hybrid", or "mock"
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
    /// Query depth limit for async-graphql
    pub max_depth: usize,
    /// Rate limit: requests per minute per API key
    pub rate_limit_rpm: u32,
    /// Query timeout in seconds
    pub query_timeout_secs: u64,
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

impl Config {
    /// Load configuration from environment with validation.
    ///
    /// # Panics
    /// In production mode, panics if required environment variables are missing.
    pub fn from_env() -> Self {
        let environment = Environment::from_env();

        // Log environment detection
        match environment {
            Environment::Production => {
                tracing::info!("🔒 Running in PRODUCTION mode - strict validation enabled");
            }
            Environment::Staging => {
                tracing::info!("🔧 Running in STAGING mode");
            }
            Environment::Development => {
                tracing::info!("🛠️  Running in DEVELOPMENT mode - using defaults for missing vars");
            }
        }

        // Validate required vars in production
        if environment.is_production() {
            Self::validate_production_env();
        }

        let config = Self::load_with_defaults(environment);

        // Warn about insecure defaults in development
        if environment.is_development() {
            Self::warn_insecure_defaults();
        }

        config
    }

    /// Validate that all required production variables are set
    fn validate_production_env() {
        let required_vars = ["JWT_SECRET", "DATABASE_URL", "MEMGRAPH_URI"];

        let mut missing = Vec::new();

        for var in required_vars {
            if env::var(var).is_err() {
                missing.push(var);
            }
        }

        // JWT_SECRET must be strong enough
        if let Ok(secret) = env::var("JWT_SECRET") {
            if secret.len() < 32 {
                panic!(
                    "❌ SECURITY ERROR: JWT_SECRET must be at least 32 characters in production. Current length: {}",
                    secret.len()
                );
            }
            if secret.starts_with("dev") || secret.contains("development") || secret == "secret" {
                panic!(
                    "❌ SECURITY ERROR: JWT_SECRET appears to be a development value. Use a strong random secret in production."
                );
            }
        }

        // CORS_ORIGINS must be set and not contain wildcard with credentials
        if let Ok(origins) = env::var("CORS_ORIGINS") {
            if origins == "*" {
                let allow_creds = env::var("CORS_ALLOW_CREDENTIALS")
                    .map(|v| v == "true" || v == "1")
                    .unwrap_or(true);

                if allow_creds {
                    panic!(
                        "❌ SECURITY ERROR: CORS_ORIGINS cannot be '*' when credentials are allowed"
                    );
                }
            }
        }

        if !missing.is_empty() {
            panic!(
                "❌ CONFIGURATION ERROR: Missing required environment variables for production: {}",
                missing.join(", ")
            );
        }
    }

    /// Warn about insecure default values in development mode
    fn warn_insecure_defaults() {
        if env::var("JWT_SECRET").is_err() {
            tracing::warn!("⚠️  JWT_SECRET not set - using insecure development default!");
        }

        if env::var("CORS_ORIGINS").is_err() {
            tracing::warn!("⚠️  CORS_ORIGINS not set - defaulting to localhost:3000");
        }
    }

    fn load_with_defaults(environment: Environment) -> Self {
        // Calculate optimal pool size based on CPU cores
        let cpu_count = std::thread::available_parallelism()
            .map(|p| p.get())
            .unwrap_or(4);
        let optimal_pool_size = (cpu_count * 2) + 1;

        // Set stricter limits in production
        let (max_depth, max_complexity, query_timeout) = if environment.is_production() {
            (10, 500, 30)
        } else {
            (15, 1000, 60)
        };

        Self {
            environment,
            server: ServerConfig {
                host: env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
                port: env::var("API_PORT")
                    .ok()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(8000),
                request_timeout_secs: env::var("REQUEST_TIMEOUT_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(query_timeout),
                max_body_size: env::var("MAX_BODY_SIZE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(1024 * 1024), // 1MB default
            },
            cors: CorsConfig {
                allowed_origins: env::var("CORS_ORIGINS")
                    .map(|s| {
                        s.split(',')
                            .map(|o| o.trim().to_lowercase().trim_end_matches('/').to_string())
                            .filter(|s| !s.is_empty())
                            .collect()
                    })
                    .unwrap_or_else(|_| vec!["http://localhost:3000".to_string()]),
                allow_credentials: env::var("CORS_ALLOW_CREDENTIALS")
                    .map(|v| v == "true" || v == "1")
                    .unwrap_or(true),
                max_age_secs: env::var("CORS_MAX_AGE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(3600),
            },
            memgraph: MemgraphConfig {
                uri: env::var("MEMGRAPH_URI")
                    .unwrap_or_else(|_| "bolt://127.0.0.1:7687".to_string()),
                username: env::var("MEMGRAPH_USER").ok(),
                password: env::var("MEMGRAPH_PASSWORD").ok(),
                pool_size: env::var("MEMGRAPH_POOL_SIZE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(optimal_pool_size),
            },
            redis: RedisConfig {
                url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string()),
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
            postgres: PostgresConfig {
                url: env::var("DATABASE_URL").unwrap_or_else(|_| {
                    "postgres://postgres:postgres@127.0.0.1:5432/idp".to_string()
                }),
                pool_size: env::var("POSTGRES_POOL_SIZE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(5),
                connect_timeout_secs: env::var("POSTGRES_CONNECT_TIMEOUT_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(5),
            },
            qdrant: QdrantConfig {
                enabled: env::var("QDRANT_ENABLED")
                    .ok()
                    .map(|s| matches!(s.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
                    .unwrap_or(true),
                url: env::var("QDRANT_URL").unwrap_or_else(|_| "http://127.0.0.1:6334".to_string()),
                api_key: env::var("QDRANT_API_KEY").ok().filter(|key| !key.is_empty()),
                collection: env::var("QDRANT_COLLECTION")
                    .unwrap_or_else(|_| "package_embeddings".to_string()),
                dimension: env::var("QDRANT_DIMENSION")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(384),
            },
            embedding: EmbeddingConfig {
                provider: env::var("EMBEDDING_PROVIDER").unwrap_or_else(|_| "openai".to_string()),
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
                    .unwrap_or_else(|_| "gemini-3.8-flash".to_string()),
                thinking_model: env::var("GEMINI_THINKING_MODEL")
                    .unwrap_or_else(|_| "gemini-3.8-flash".to_string()),
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
                    .unwrap_or(max_complexity),
                max_depth: env::var("MAX_DEPTH")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(max_depth),
                rate_limit_rpm: env::var("RATE_LIMIT_RPM")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(100),
                query_timeout_secs: env::var("QUERY_TIMEOUT_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(query_timeout),
            },
        }
    }

    /// Get request timeout as Duration
    pub fn request_timeout(&self) -> Duration {
        Duration::from_secs(self.server.request_timeout_secs)
    }

    /// Get query timeout as Duration
    pub fn query_timeout(&self) -> Duration {
        Duration::from_secs(self.guardrails.query_timeout_secs)
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_environment_detection() {
        // Default should be development
        assert!(Environment::from_env().is_development());
    }

    #[test]
    fn test_config_loads_defaults() {
        // In test environment (development), this should not panic
        let config = Config::from_env();
        assert!(config.environment.is_development());
        assert!(!config.cors.allowed_origins.is_empty());
    }
}
