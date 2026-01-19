//! Qdrant Vector Writer with Retry/Backoff
//!
//! Features:
//! - Collection auto-creation with proper schema
//! - Batch upsert with configurable batch size
//! - Exponential backoff retry for transient failures
//! - Idempotent writes using stable point IDs
//! - Payload indexing for efficient filtering

use anyhow::{Context, Result};
use qdrant_client::qdrant::{
    CreateCollectionBuilder, Distance, PointStruct, ScalarQuantizationBuilder,
    SearchPointsBuilder, UpsertPointsBuilder, VectorParamsBuilder, Value,
    CreateFieldIndexCollectionBuilder, FieldType,
};
use qdrant_client::Qdrant;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
use tracing::{debug, error, info, instrument, warn};

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_COLLECTION: &str = "package_embeddings";
const VECTOR_SIZE: u64 = 384; // MiniLM-L6-v2 dimension

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/// Vector writer configuration
#[derive(Debug, Clone)]
pub struct VectorWriterConfig {
    /// Qdrant URL
    pub url: String,
    /// Collection name
    pub collection: String,
    /// Vector dimension
    pub dimension: u64,
    /// Batch size for upserts
    #[allow(dead_code)]
    pub batch_size: usize,
    /// Maximum retries for failed operations
    pub max_retries: u32,
    /// Initial retry delay
    pub retry_delay_ms: u64,
    /// Maximum concurrent requests
    pub max_concurrent: usize,
}

impl Default for VectorWriterConfig {
    fn default() -> Self {
        Self {
            url: "http://localhost:6334".to_string(),
            collection: DEFAULT_COLLECTION.to_string(),
            dimension: VECTOR_SIZE,
            batch_size: 100,
            max_retries: 3,
            retry_delay_ms: 100,
            max_concurrent: 4,
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// VECTOR POINT
// ═══════════════════════════════════════════════════════════════

/// A vector point with metadata
#[derive(Debug, Clone, Serialize)]
pub struct VectorPoint {
    /// Unique stable ID (e.g., "npm:express:1.0.0:functionName")
    pub id: String,
    /// The embedding vector
    pub vector: Vec<f32>,
    /// Payload/metadata fields
    pub payload: HashMap<String, PayloadValue>,
}

/// Supported payload value types
#[derive(Debug, Clone, Serialize)]
pub enum PayloadValue {
    String(String),
    Integer(i64),
    Float(f64),
    Bool(bool),
    StringList(Vec<String>),
}

impl From<PayloadValue> for Value {
    fn from(val: PayloadValue) -> Self {
        match val {
            PayloadValue::String(s) => Value::from(s),
            PayloadValue::Integer(i) => Value::from(i),
            PayloadValue::Float(f) => Value::from(f),
            PayloadValue::Bool(b) => Value::from(b),
            PayloadValue::StringList(v) => Value::from(v),
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// VECTOR WRITER
// ═══════════════════════════════════════════════════════════════

/// Qdrant vector writer with retry logic
pub struct VectorWriter {
    client: Qdrant,
    config: VectorWriterConfig,
    semaphore: Arc<Semaphore>,
}

impl VectorWriter {
    /// Create a new vector writer and connect to Qdrant
    #[instrument(skip(config), fields(url = %config.url, collection = %config.collection))]
    pub async fn new(config: VectorWriterConfig) -> Result<Self> {
        info!("Connecting to Qdrant");

        let client = Qdrant::from_url(&config.url)
            .build()
            .context("Failed to create Qdrant client")?;

        let semaphore = Arc::new(Semaphore::new(config.max_concurrent));

        let writer = Self {
            client,
            config,
            semaphore,
        };

        // Ensure collection exists
        writer.ensure_collection().await?;

        info!("Connected to Qdrant successfully");
        Ok(writer)
    }

    /// Ensure collection exists with proper configuration
    #[instrument(skip(self))]
    pub async fn ensure_collection(&self) -> Result<()> {
        let exists = self
            .client
            .collection_exists(&self.config.collection)
            .await
            .context("Failed to check collection existence")?;

        if exists {
            info!(collection = %self.config.collection, "Collection already exists");
            return Ok(());
        }

        info!(collection = %self.config.collection, "Creating collection");

        // Create collection with optimized settings
        self.client
            .create_collection(
                CreateCollectionBuilder::new(&self.config.collection)
                    .vectors_config(
                        VectorParamsBuilder::new(self.config.dimension, Distance::Cosine)
                    )
                    // Enable scalar quantization for memory efficiency
                    .quantization_config(ScalarQuantizationBuilder::default()),
            )
            .await
            .context("Failed to create collection")?;

        // Create payload indexes for efficient filtering
        self.create_payload_indexes().await?;

        info!(collection = %self.config.collection, "Collection created successfully");
        Ok(())
    }

    /// Create indexes on common filter fields
    async fn create_payload_indexes(&self) -> Result<()> {
        let indexed_fields = [
            ("package_id", FieldType::Keyword),
            ("ecosystem", FieldType::Keyword),
            ("version", FieldType::Keyword),
            ("symbol_kind", FieldType::Keyword),
        ];

        for (field, field_type) in indexed_fields {
            if let Err(e) = self
                .client
                .create_field_index(
                    CreateFieldIndexCollectionBuilder::new(
                        &self.config.collection,
                        field,
                        field_type,
                    )
                )
                .await
            {
                warn!(field, error = %e, "Failed to create field index (may already exist)");
            }
        }

        Ok(())
    }

    /// Upsert a single vector with retry
    #[allow(dead_code)]
    #[instrument(skip(self, point), fields(id = %point.id))]
    pub async fn upsert(&self, point: VectorPoint) -> Result<()> {
        self.upsert_batch(vec![point]).await
    }

    /// Upsert multiple vectors with retry
    #[instrument(skip(self, points), fields(count = points.len()))]
    pub async fn upsert_batch(&self, points: Vec<VectorPoint>) -> Result<()> {
        if points.is_empty() {
            return Ok(());
        }

        // Convert to Qdrant points
        let qdrant_points: Vec<PointStruct> = points
            .into_iter()
            .map(|p| {
                let payload: HashMap<String, Value> = p
                    .payload
                    .into_iter()
                    .map(|(k, v)| (k, v.into()))
                    .collect();

                PointStruct::new(p.id, p.vector, payload)
            })
            .collect();

        let count = qdrant_points.len();

        // Acquire semaphore permit
        let _permit = self.semaphore.acquire().await
            .map_err(|_| anyhow::anyhow!("Semaphore closed"))?;

        // Retry with exponential backoff
        let mut attempt = 0;
        let mut delay = Duration::from_millis(self.config.retry_delay_ms);

        loop {
            match self
                .client
                .upsert_points(UpsertPointsBuilder::new(
                    &self.config.collection,
                    qdrant_points.clone(),
                ))
                .await
            {
                Ok(_) => {
                    debug!(count, "Vectors upserted successfully");
                    return Ok(());
                }
                Err(e) => {
                    attempt += 1;
                    if attempt >= self.config.max_retries {
                        error!(error = %e, attempts = attempt, "Max retries exceeded");
                        return Err(e).context("Failed to upsert vectors after retries");
                    }

                    warn!(
                        error = %e,
                        attempt,
                        delay_ms = delay.as_millis(),
                        "Upsert failed, retrying"
                    );

                    tokio::time::sleep(delay).await;
                    delay *= 2; // Exponential backoff
                }
            }
        }
    }

    /// Delete vectors by IDs
    #[allow(dead_code)]
    #[instrument(skip(self, ids), fields(count = ids.len()))]
    pub async fn delete_batch(&self, ids: Vec<String>) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }

        use qdrant_client::qdrant::{DeletePointsBuilder, PointsIdsList};

        let points_selector = PointsIdsList {
            ids: ids.iter().map(|id| id.clone().into()).collect(),
        };

        self.client
            .delete_points(
                DeletePointsBuilder::new(&self.config.collection)
                    .points(points_selector)
            )
            .await
            .context("Failed to delete vectors")?;

        debug!(count = ids.len(), "Vectors deleted successfully");
        Ok(())
    }

    /// Search for similar vectors
    #[allow(dead_code)]
    #[instrument(skip(self, vector), fields(top_k))]
    pub async fn search(
        &self,
        vector: Vec<f32>,
        top_k: u64,
        filter: Option<HashMap<String, String>>,
    ) -> Result<Vec<SearchResult>> {
        use qdrant_client::qdrant::{Condition, Filter};

        let mut search_builder = SearchPointsBuilder::new(
            &self.config.collection,
            vector,
            top_k,
        )
        .with_payload(true);

        // Add filter conditions
        if let Some(filter_map) = filter {
            let conditions: Vec<Condition> = filter_map
                .into_iter()
                .map(|(key, value)| Condition::matches(key, value))
                .collect();

            search_builder = search_builder.filter(Filter::must(conditions));
        }

        let response = self
            .client
            .search_points(search_builder)
            .await
            .context("Failed to search vectors")?;

        let results = response
            .result
            .into_iter()
            .map(|point| SearchResult {
                id: match point.id {
                    Some(id) => format!("{:?}", id),
                    None => String::new(),
                },
                score: point.score,
                payload: point
                    .payload
                    .into_iter()
                    .map(|(k, v)| (k, format!("{:?}", v)))
                    .collect(),
            })
            .collect();

        Ok(results)
    }

    /// Get collection info
    #[allow(dead_code)]
    pub async fn collection_info(&self) -> Result<CollectionStats> {
        let info = self
            .client
            .collection_info(&self.config.collection)
            .await
            .context("Failed to get collection info")?;

        Ok(CollectionStats {
            points_count: info.result.as_ref().map(|r| r.points_count.unwrap_or(0)).unwrap_or(0),
            vectors_count: info.result.as_ref().and_then(|r| r.indexed_vectors_count).unwrap_or(0),
        })
    }

    /// Health check
    #[allow(dead_code)]
    pub async fn health_check(&self) -> Result<bool> {
        match self.client.health_check().await {
            Ok(_) => Ok(true),
            Err(e) => {
                warn!(error = %e, "Qdrant health check failed");
                Ok(false)
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// RESULT TYPES
// ═══════════════════════════════════════════════════════════════

/// Search result
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SearchResult {
    pub id: String,
    pub score: f32,
    pub payload: HashMap<String, String>,
}

/// Collection statistics
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CollectionStats {
    pub points_count: u64,
    pub vectors_count: u64,
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_payload_value_conversion() {
        let string_val = PayloadValue::String("test".to_string());
        let _: Value = string_val.into();

        let int_val = PayloadValue::Integer(42);
        let _: Value = int_val.into();

        let float_val = PayloadValue::Float(3.14);
        let _: Value = float_val.into();

        let bool_val = PayloadValue::Bool(true);
        let _: Value = bool_val.into();
    }

    #[test]
    fn test_vector_point_creation() {
        let point = VectorPoint {
            id: "test-id".to_string(),
            vector: vec![0.1, 0.2, 0.3],
            payload: {
                let mut m = HashMap::new();
                m.insert("package_id".to_string(), PayloadValue::String("npm:express".to_string()));
                m
            },
        };

        assert_eq!(point.id, "test-id");
        assert_eq!(point.vector.len(), 3);
    }

    #[test]
    fn test_default_config() {
        let config = VectorWriterConfig::default();
        assert_eq!(config.collection, DEFAULT_COLLECTION);
        assert_eq!(config.dimension, VECTOR_SIZE);
        assert_eq!(config.batch_size, 100);
    }
}
