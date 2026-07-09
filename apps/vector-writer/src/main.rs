//! Vector Writer Service - Qdrant vector database writer
//!
//! Responsibilities:
//! - Consume embedding events from Redpanda
//! - Upsert vectors with metadata to Qdrant
//! - Handle failures with exponential backoff
//! - Idempotent upserts using stable point IDs

mod config;
mod consumer;
mod dlq;
mod health;
mod writer;

use anyhow::{Context, Result};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tokio::sync::watch;
use tracing::{error, info};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Config;
use crate::consumer::EventConsumer;
use crate::dlq::DlqPublisher;
use crate::writer::{VectorWriter, VectorWriterConfig};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,vector_writer=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("🔢 Starting Vector Writer Service");

    // Load configuration
    let config = Config::from_env().context("Failed to load configuration")?;

    info!(
        qdrant_url = %config.qdrant.url,
        kafka_brokers = %config.kafka.brokers,
        "Configuration loaded"
    );

    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    let ready = Arc::new(AtomicBool::new(false));
    let health_port = std::env::var("HEALTH_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(9092);
    {
        let ready = ready.clone();
        tokio::spawn(async move {
            if let Err(e) = health::serve(health_port, ready).await {
                error!(error = %e, "Health server failed");
            }
        });
    }

    // Initialize Vector Writer
    let writer_config = VectorWriterConfig {
        url: config.qdrant.url.clone(),
        collection: config.qdrant.collection.clone(),
        dimension: config.qdrant.dimension,
        batch_size: config.qdrant.batch_size,
        max_retries: config.qdrant.max_retries,
        retry_delay_ms: config.qdrant.retry_delay_ms,
        max_concurrent: config.qdrant.max_concurrent,
    };

    let writer = Arc::new(
        VectorWriter::new(writer_config)
            .await
            .context("Failed to initialize Vector Writer")?,
    );

    // Initialize DLQ publisher
    let dlq = DlqPublisher::new(&config.kafka).context("Failed to create DLQ publisher")?;
    info!(
        "📥 DLQ publisher initialized for topic: {}",
        config.kafka.dlq_topic
    );

    // Initialize Kafka consumer
    let consumer = EventConsumer::new(&config.kafka, writer.clone(), dlq)
        .await
        .context("Failed to create Kafka consumer")?;

    ready.store(true, Ordering::Relaxed);

    // Spawn consumer task
    let consumer_handle = {
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            if let Err(e) = consumer.run(shutdown_rx).await {
                error!(error = %e, "Consumer error");
            }
        })
    };

    info!("✅ Vector Writer Service started successfully");
    info!("📡 Consuming from topic: {}", config.kafka.topic);
    info!("🎯 Writing to Qdrant: {}", config.qdrant.url);

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    info!("🛑 Shutdown signal received");

    // Signal shutdown
    let _ = shutdown_tx.send(true);

    // Wait for consumer to finish (with timeout)
    let shutdown_timeout = tokio::time::Duration::from_secs(30);
    match tokio::time::timeout(shutdown_timeout, consumer_handle).await {
        Ok(Ok(())) => info!("Consumer stopped gracefully"),
        Ok(Err(e)) => error!(error = %e, "Consumer task panicked"),
        Err(_) => error!("Consumer shutdown timed out"),
    }

    info!("👋 Vector Writer Service shutdown complete");
    Ok(())
}
