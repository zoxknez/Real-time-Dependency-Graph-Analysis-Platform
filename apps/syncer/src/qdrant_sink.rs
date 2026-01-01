//! Qdrant vector database sink

use anyhow::Result;
use qdrant_client::prelude::*;
use qdrant_client::qdrant::{
    CreateCollection, Distance, VectorParams, VectorsConfig,
    PointStruct, UpsertPointsBuilder,
};
use std::collections::HashMap;
use tracing::{debug, info};

const COLLECTION_NAME: &str = "package_embeddings";
const VECTOR_SIZE: u64 = 384; // all-MiniLM-L6-v2 dimension

/// Qdrant vector database client
pub struct QdrantSink {
    client: QdrantClient,
}

impl QdrantSink {
    /// Connect to Qdrant
    pub async fn new(url: &str) -> Result<Self> {
        info!(url = %url, "Connecting to Qdrant");
        
        let client = QdrantClient::from_url(url).build()?;
        
        Ok(Self { client })
    }
    
    /// Create collection if it doesn't exist
    pub async fn ensure_collection(&self) -> Result<()> {
        let collections = self.client.list_collections().await?;
        
        let exists = collections.collections
            .iter()
            .any(|c| c.name == COLLECTION_NAME);
        
        if !exists {
            info!(collection = %COLLECTION_NAME, "Creating collection");
            
            self.client
                .create_collection(
                    CreateCollection {
                        collection_name: COLLECTION_NAME.into(),
                        vectors_config: Some(VectorsConfig {
                            config: Some(qdrant_client::qdrant::vectors_config::Config::Params(
                                VectorParams {
                                    size: VECTOR_SIZE,
                                    distance: Distance::Cosine.into(),
                                    ..Default::default()
                                }
                            )),
                        }),
                        ..Default::default()
                    }
                )
                .await?;
        }
        
        Ok(())
    }
    
    /// Upsert a vector with metadata
    pub async fn upsert_vector(
        &self,
        id: &str,
        vector: Vec<f32>,
        metadata: HashMap<String, String>,
    ) -> Result<()> {
        let point = PointStruct::new(
            id.to_string(),
            vector,
            metadata.into_iter()
                .map(|(k, v)| (k, v.into()))
                .collect::<HashMap<_, _>>(),
        );
        
        self.client
            .upsert_points(UpsertPointsBuilder::new(COLLECTION_NAME, vec![point]))
            .await?;
        
        debug!(id = %id, "Upserted vector");
        Ok(())
    }
    
    /// Search for similar vectors
    pub async fn search(
        &self,
        query_vector: Vec<f32>,
        limit: u64,
    ) -> Result<Vec<(String, f32)>> {
        let response = self.client
            .search_points(
                SearchPointsBuilder::new(COLLECTION_NAME, query_vector, limit)
                    .with_payload(true)
            )
            .await?;
        
        let results = response.result
            .into_iter()
            .filter_map(|p| {
                p.id.and_then(|id| {
                    match id.point_id_options {
                        Some(qdrant_client::qdrant::point_id::PointIdOptions::Uuid(uuid)) => {
                            Some((uuid, p.score))
                        }
                        _ => None
                    }
                })
            })
            .collect();
        
        Ok(results)
    }
}
