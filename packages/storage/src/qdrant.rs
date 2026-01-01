//! Qdrant client wrapper

use anyhow::Result;
use tracing::info;

pub struct QdrantClient {
    // client: qdrant_client::QdrantClient,
}

impl QdrantClient {
    pub async fn new(url: &str) -> Result<Self> {
        info!(url = %url, "Connecting to Qdrant");
        // TODO: Initialize connection
        Ok(Self {})
    }
}
