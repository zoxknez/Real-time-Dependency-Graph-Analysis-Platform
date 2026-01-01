//! Memgraph client wrapper

use anyhow::Result;
use tracing::info;

pub struct MemgraphClient {
    // graph: neo4rs::Graph,
}

impl MemgraphClient {
    pub async fn new(uri: &str) -> Result<Self> {
        info!(uri = %uri, "Connecting to Memgraph");
        // TODO: Initialize connection
        Ok(Self {})
    }
}
