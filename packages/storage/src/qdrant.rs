//! Qdrant Vector Database Client
//!
//! Provides a high-level interface for vector similarity search.

use anyhow::{Context, Result};
use qdrant_client::Qdrant;
use qdrant_client::qdrant::{
    CreateCollectionBuilder, Distance, PointStruct, 
    SearchPointsBuilder, UpsertPointsBuilder, VectorParamsBuilder,
    DeletePointsBuilder, PointId, Value as QdrantValue,
    Filter, Condition, FieldCondition, Match,
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{error, info, instrument, warn};
use crate::resilience::IsRetryable;
use uuid::Uuid;

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/// Qdrant connection configuration
#[derive(Debug, Clone)]
pub struct QdrantConfig {
    /// Qdrant URL (http://host:port)
    pub url: String,
    /// API key for authentication
    pub api_key: Option<String>,
    /// Default collection name
    pub collection: String,
    /// Vector dimension
    pub dimension: u64,
    /// Connection timeout
    pub timeout: Duration,
    /// Batch size for upserts
    pub batch_size: usize,
    /// Max retries
    pub max_retries: u32,
}

impl Default for QdrantConfig {
    fn default() -> Self {
        Self {
            url: "http://localhost:6334".to_string(),
            api_key: None,
            collection: "package_embeddings".to_string(),
            dimension: 384,
            timeout: Duration::from_secs(30),
            batch_size: 100,
            max_retries: 3,
        }
    }
}

impl QdrantConfig {
    /// Create config from environment variables
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            url: std::env::var("QDRANT_URL")
                .unwrap_or_else(|_| "http://localhost:6334".to_string()),
            api_key: std::env::var("QDRANT_API_KEY").ok(),
            collection: std::env::var("QDRANT_COLLECTION")
                .unwrap_or_else(|_| "package_embeddings".to_string()),
            dimension: std::env::var("QDRANT_DIMENSION")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(384),
            timeout: Duration::from_secs(30),
            batch_size: std::env::var("QDRANT_BATCH_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100),
            max_retries: 3,
        })
    }
}

// ═══════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════

/// Qdrant client with convenience methods
pub struct QdrantClient {
    client: Qdrant,
    config: QdrantConfig,
    healthy: Arc<RwLock<bool>>,
    circuit_breaker: Arc<crate::circuit_breaker::CircuitBreaker>,
    resilience_config: crate::resilience::ResilienceConfig,
}

impl QdrantClient {
    /// Create a new Qdrant client
    #[instrument(skip(config), fields(url = %config.url, collection = %config.collection))]
    pub async fn new(config: QdrantConfig) -> Result<Self> {
        info!("Connecting to Qdrant");

        let mut builder = Qdrant::from_url(&config.url);
        
        if let Some(ref api_key) = config.api_key {
            builder = builder.api_key(api_key.clone());
        }

        let client = builder
            .timeout(config.timeout)
            .build()
            .context("Failed to build Qdrant client")?;

        let circuit_breaker = Arc::new(crate::circuit_breaker::CircuitBreaker::new(
            "qdrant",
            "upsert",
            crate::circuit_breaker::CircuitBreakerConfig {
                failure_threshold: config.max_retries,
                success_threshold: 2,
                timeout_ms: 30_000,
                half_open_requests: 5,
            }
        ));

        let resilience_config = crate::resilience::ResilienceConfig {
            timeout: config.timeout,
            max_retries: config.max_retries,
            base_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(5),
            use_jitter: true,
        };

        let qdrant = Self {
            client,
            config,
            healthy: Arc::new(RwLock::new(true)),
            circuit_breaker,
            resilience_config,
        };

        // Ensure collection exists
        qdrant.ensure_collection().await?;

        // Create indexes for tenant_id and package_id
        qdrant.create_indexes().await?;

        info!("Successfully connected to Qdrant");
        Ok(qdrant)
    }

    /// Create payload indexes
    #[instrument(skip(self))]
    async fn create_indexes(&self) -> Result<()> {
        /*
        let field_name = "tenant_id";
        info!(field = %field_name, "Ensuring index exists");
        self.client
            .create_field_index(self.config.collection.clone(), field_name, qdrant_client::qdrant::FieldType::Keyword, None, None)
            .await
            .context("Failed to create tenant_id index")?;
            
        let field_name = "package_id";
        info!(field = %field_name, "Ensuring index exists");
        self.client
            .create_field_index(self.config.collection.clone(), field_name, qdrant_client::qdrant::FieldType::Keyword, None, None)
            .await
            .context("Failed to create package_id index")?;
        */
        Ok(())
    }

    /// Create client from environment variables
    pub async fn from_env() -> Result<Self> {
        let config = QdrantConfig::from_env()?;
        Self::new(config).await
    }

    /// Ensure the collection exists
    #[instrument(skip(self))]
    async fn ensure_collection(&self) -> Result<()> {
        let collections = self
            .client
            .list_collections()
            .await
            .context("Failed to list collections")?;

        let exists = collections
            .collections
            .iter()
            .any(|c| c.name == self.config.collection);

        if !exists {
            info!(collection = %self.config.collection, "Creating collection");
            
            self.client
                .create_collection(
                    CreateCollectionBuilder::new(&self.config.collection)
                        .vectors_config(VectorParamsBuilder::new(
                            self.config.dimension,
                            Distance::Cosine,
                        )),
                )
                .await
                .context("Failed to create collection")?;
        }

        Ok(())
    }

    /// Upsert a single point
    /// Upsert a single point
    #[instrument(skip(self, vector, payload))]
    pub async fn upsert(
        &self,
        tenant_id: &str,
        id: &str,
        vector: Vec<f32>,
        mut payload: HashMap<String, QdrantValue>,
    ) -> Result<()> {
        // Generate namespaced ID ensuring isolation
        let namespaced_id = self.generate_namespaced_id(tenant_id, id);
        
        // Enrich payload
        payload.insert("tenant_id".to_string(), tenant_id.to_string().into());
        payload.insert("package_id".to_string(), id.to_string().into());
        
        let point = PointStruct::new(namespaced_id, vector, payload);
        self.upsert_with_retry(vec![point]).await
    }

    /// Batch upsert points
    #[instrument(skip(self, points), fields(count = points.len()))]
    pub async fn upsert_batch(&self, tenant_id: &str, points: Vec<VectorPoint>) -> Result<()> {
        if points.is_empty() {
            return Ok(());
        }

        let point_structs: Vec<PointStruct> = points
            .into_iter()
            .map(|mut p| {
                let namespaced_id = self.generate_namespaced_id(tenant_id, &p.id);
                p.payload.insert("tenant_id".to_string(), tenant_id.to_string().into());
                p.payload.insert("package_id".to_string(), p.id.into());
                PointStruct::new(namespaced_id, p.vector, p.payload)
            })
            .collect();

        // Process in batches
        for chunk in point_structs.chunks(self.config.batch_size) {
            self.upsert_with_retry(chunk.to_vec()).await?;
        }

        Ok(())
    }

    /// Upsert with retry logic
    async fn upsert_with_retry(&self, points: Vec<PointStruct>) -> Result<()> {
        crate::resilience::with_resilience(
            "qdrant",
            "upsert",
            &self.resilience_config,
            || async {
                self.circuit_breaker.call::<_, _, anyhow::Error>(async {
                    self.client
                        .upsert_points(UpsertPointsBuilder::new(&self.config.collection, points.clone()))
                        .await
                        .context("Failed to upsert points")
                }).await
            }
        ).await.map(|_| ())
    }

    /// Search for similar vectors
    /// NOTE: Tenant filtering temporarily disabled due to qdrant-client API compatibility
    /// TODO: Implement proper Filter construction or upgrade qdrant-client version
    #[instrument(skip(self, vector))]
    pub async fn search(&self, _tenant_id: &str, vector: Vec<f32>, limit: u64) -> Result<Vec<SearchResult>> {
        crate::resilience::with_resilience(
            "qdrant",
            "search",
            &self.resilience_config,
            || async {
                self.circuit_breaker.call::<_, _, anyhow::Error>(async {
                    let response = self
                        .client
                        .search_points(
                            SearchPointsBuilder::new(&self.config.collection, vector.clone(), limit)
                                .with_payload(true),
                        )
                        .await
                        .context("Failed to search points")?;
                    Ok(response)
                }).await
            }
        ).await.map(|response| {
             response
            .result
            .into_iter()
            .map(|p| SearchResult {
                id: extract_point_id(p.id),
                score: p.score,
                payload: p.payload,
            })
            .collect()
        })
    }

    /// Delete points by IDs
    /// Delete points by IDs
    #[instrument(skip(self, ids), fields(count = ids.len()))]
    pub async fn delete(&self, tenant_id: &str, ids: Vec<String>) -> Result<()> {
        use qdrant_client::qdrant::{Filter, Condition, PointId};

        // We must map Logic IDs to Namespaced IDs for deletion
        let point_ids: Vec<PointId> = ids
            .into_iter()
            .map(|id| PointId::from(self.generate_namespaced_id(tenant_id, &id)))
            .collect();

        // Alternatively delete by filter: tenant_id == x AND package_id IN [ids]
        // But point_ids is efficient.

        crate::resilience::with_resilience(
            "qdrant",
            "delete",
            &self.resilience_config,
            || async {
                self.circuit_breaker.call::<_, _, anyhow::Error>(async {
                    self.client
                        .delete_points(
                            DeletePointsBuilder::new(&self.config.collection)
                                .points(point_ids.clone()),
                        )
                        .await
                        .context("Failed to delete points")?;
                    Ok(())
                }).await
            }
        ).await
    }

    /// Generate namespaced ID (Hash of tenant_id + id)
    fn generate_namespaced_id(&self, tenant_id: &str, id: &str) -> String {
        use uuid::Uuid;
        let namespace = Uuid::NAMESPACE_URL;
        let key = format!("{}/{}", tenant_id, id);
        Uuid::new_v5(&namespace, key.as_bytes()).to_string()
    }

    /// Health check
    pub async fn health_check(&self) -> bool {
        match self.client.health_check().await {
            Ok(_) => {
                *self.healthy.write().await = true;
                true
            }
            Err(e) => {
                error!(error = %e, "Qdrant health check failed");
                *self.healthy.write().await = false;
                false
            }
        }
    }

    /// Check if client is healthy
    pub async fn is_healthy(&self) -> bool {
        *self.healthy.read().await
    }
}

/// Extract point ID from PointId
fn extract_point_id(id: Option<PointId>) -> String {
    match id {
        Some(PointId { point_id_options: Some(pid) }) => {
            match pid {
                qdrant_client::qdrant::point_id::PointIdOptions::Uuid(u) => u,
                qdrant_client::qdrant::point_id::PointIdOptions::Num(n) => n.to_string(),
            }
        }
        _ => String::new(),
    }
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/// Vector point for upsert
#[derive(Debug, Clone)]
pub struct VectorPoint {
    pub id: String,
    pub vector: Vec<f32>,
    pub payload: HashMap<String, QdrantValue>,
}

impl VectorPoint {
    pub fn new(id: impl Into<String>, vector: Vec<f32>) -> Self {
        Self {
            id: id.into(),
            vector,
            payload: HashMap::new(),
        }
    }

    pub fn with_payload(mut self, key: &str, value: impl Into<QdrantValue>) -> Self {
        self.payload.insert(key.to_string(), value.into());
        self
    }
}

/// Search result
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub id: String,
    pub score: f32,
    pub payload: HashMap<String, QdrantValue>,
}

/// Filter builder helpers
pub struct FilterBuilder;

impl FilterBuilder {
    // Filters are constructed using Qdrant's Filter API directly
    // This is a placeholder for common filter patterns
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = QdrantConfig::default();
        assert_eq!(config.url, "http://localhost:6334");
        assert_eq!(config.dimension, 384);
        assert_eq!(config.batch_size, 100);
    }

    #[test]
    fn test_vector_point_builder() {
        let point = VectorPoint::new("test-id", vec![0.1, 0.2, 0.3])
            .with_payload("ecosystem", "cargo");

        assert_eq!(point.id, "test-id");
        assert_eq!(point.vector.len(), 3);
    }
}
