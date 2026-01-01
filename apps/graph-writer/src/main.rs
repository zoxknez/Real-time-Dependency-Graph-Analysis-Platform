//! Graph Writer Service - Memgraph Cypher writer
//!
//! Responsibilities:
//! - Consume curated events from Redpanda
//! - Batch Cypher transactions for optimal performance
//! - Idempotent upserts using event_id
//! - Handle failures with retry/backoff

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

    info!("📊 Starting Graph Writer Service");
    
    // TODO: Connect to Memgraph
    // TODO: Initialize Kafka consumer for curated topic
    // TODO: Start batch writer workers
    
    info!("✅ Graph Writer Service started successfully");
    
    tokio::signal::ctrl_c().await?;
    info!("👋 Shutting down Graph Writer Service");
    
    Ok(())
}
