//! Qdrant vector writer with retry/backoff

use anyhow::Result;
use backoff::{ExponentialBackoff, future::retry};
use qdrant_client::prelude::*;

use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, info, warn};

const COLLECTION_NAME: &str = "package_embeddings";
const VECTOR_SIZE: u64 = 384;

/// Vector writer with exponential backoff retry
pub struct VectorWriter {
    client: QdrantClient,
}

impl VectorWriter {
    pub async fn new(url: &str) -> Result<Self> {
        info!(url = %url, "Connecting to Qdrant");
        let client = QdrantClient::from_url(url).build()?;
        
        Ok(Self { client })
    }
    
    /// Ensure collection exists with proper config
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
    
    /// Upsert vector with exponential backoff retry
    pub async fn upsert_with_retry(
        &self,
        id: &str,
        vector: Vec<f32>,
        metadata: HashMap<String, String>,
    ) -> Result<()> {
        let backoff = ExponentialBackoff {
            max_elapsed_time: Some(Duration::from_secs(60)),
            ..Default::default()
        };
        
        let id = id.to_string();
        let point = PointStruct::new(
            id.clone(),
            vector,
            metadata.into_iter()
                .map(|(k, v)| (k, v.into()))
                .collect::<HashMap<_, _>>(),
        );
        
        retry(backoff, || async {
            self.client

                .await
                .map_err(|e| {
                    warn!(error = %e, "Qdrant upsert failed, retrying...");
                    backoff::Error::transient(e)
                })
        }).await?;
        
        debug!(id = %id, "Vector upserted successfully");
        Ok(())
    }
    
    /// Batch upsert multiple vectors
    pub async fn upsert_batch(
        &self,
        points: Vec<(String, Vec<f32>, HashMap<String, String>)>,
    ) -> Result<()> {
        if points.is_empty() {
            return Ok(());
        }
        
        let qdrant_points: Vec<PointStruct> = points
            .into_iter()
            .map(|(id, vector, metadata)| {
                PointStruct::new(
                    id,
                    vector,
                    metadata.into_iter()
                        .map(|(k, v)| (k, v.into()))
                        .collect::<HashMap<_, _>>(),
                )
            })
            .collect();
        
        let count = qdrant_points.len();
        
        self.client

            .await?;
        
        info!(count = count, "Batch upserted successfully");
        Ok(())
    }
}
