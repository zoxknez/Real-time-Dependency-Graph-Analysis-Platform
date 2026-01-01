//! Vector Writer Service - Qdrant vector database writer
//!
//! Responsibilities:
//! - Consume curated events from Redpanda
//! - Upsert vectors with metadata to Qdrant
//! - Handle failures with exponential backoff
//! - Idempotent upserts using event_id

mod writer;
mod consumer;
mod config;

use anyhow::Result;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("🔢 Starting Vector Writer Service");
    
    // TODO: Connect to Qdrant
    // TODO: Initialize Kafka consumer for curated topic
    // TODO: Start writer workers with backoff
    
    info!("✅ Vector Writer Service started successfully");
    
    tokio::signal::ctrl_c().await?;
    info!("👋 Shutting down Vector Writer Service");
    
    Ok(())
}
