//! Syncer Service - Bridge between RisingWave and Storage Layer
//!
//! Responsibilities:
//! - Read processed data from RisingWave (PostgreSQL protocol)
//! - Transform rows into Cypher queries for Memgraph
//! - Upsert vectors into Qdrant
//! - Handle batching for optimal performance

mod memgraph_sink;
mod qdrant_sink;
mod risingwave_source;
mod config;

use anyhow::Result;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("🔗 Starting Syncer Service");
    
    // TODO: Connect to RisingWave
    // TODO: Connect to Memgraph
    // TODO: Connect to Qdrant
    // TODO: Start sync workers
    
    info!("✅ Syncer Service started successfully");
    
    // Keep alive
    tokio::signal::ctrl_c().await?;
    info!("👋 Shutting down Syncer Service");
    
    Ok(())
}
