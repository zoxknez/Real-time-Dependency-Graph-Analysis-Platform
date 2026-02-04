//! Configuration for Vector Writer Service

use anyhow::Result;
use serde::Deserialize;
use std::env;

/// Main configuration
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub qdrant: QdrantConfig,
    pub kafka: KafkaConfig,
}

/// Qdrant configuration
#[derive(Debug, Clone, Deserialize)]
pub struct QdrantConfig {
    pub url: String,
    pub collection: String,
    pub dimension: u64,
    pub batch_size: usize,
    pub max_retries: u32,
    pub retry_delay_ms: u64,
    pub max_concurrent: usize,
}

/// Kafka configuration
#[derive(Debug, Clone, Deserialize)]
pub struct KafkaConfig {
    pub brokers: String,
    pub group_id: String,
    pub topic: String,
    pub dlq_topic: String,
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        Ok(Self {
            qdrant: QdrantConfig {
                url: env::var("QDRANT_URL").unwrap_or_else(|_| "http://localhost:6334".to_string()),
                collection: env::var("QDRANT_COLLECTION")
                    .unwrap_or_else(|_| "package_embeddings".to_string()),
                dimension: env::var("QDRANT_DIMENSION")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(384),
                batch_size: env::var("QDRANT_BATCH_SIZE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(100),
                max_retries: env::var("QDRANT_MAX_RETRIES")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(3),
                retry_delay_ms: env::var("QDRANT_RETRY_DELAY_MS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(100),
                max_concurrent: env::var("QDRANT_MAX_CONCURRENT")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(4),
            },
            kafka: KafkaConfig {
                brokers: env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".to_string()),
                group_id: env::var("KAFKA_GROUP_ID")
                    .unwrap_or_else(|_| "vector-writer".to_string()),
                topic: env::var("KAFKA_TOPIC")
                    .unwrap_or_else(|_| "analysis-events".to_string()),
                dlq_topic: env::var("KAFKA_DLQ_TOPIC")
                    .unwrap_or_else(|_| "vector-writer-dlq".to_string()),
            },
        })
    }
}

impl Default for Config {
    fn default() -> Self {
        Config::from_env().unwrap_or_else(|_| Config {
            qdrant: QdrantConfig {
                url: "http://localhost:6334".to_string(),
                collection: "package_embeddings".to_string(),
                dimension: 384,
                batch_size: 100,
                max_retries: 3,
                retry_delay_ms: 100,
                max_concurrent: 4,
            },
            kafka: KafkaConfig {
                brokers: "localhost:9092".to_string(),
                group_id: "vector-writer".to_string(),
                topic: "analysis-events".to_string(),
                dlq_topic: "vector-writer-dlq".to_string(),
            },
        })
    }
}
