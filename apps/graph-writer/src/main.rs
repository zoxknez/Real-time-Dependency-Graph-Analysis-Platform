//! Graph Writer Service - Memgraph Cypher writer
//!
//! Responsibilities:
//! - Consume domain events from Redpanda (domain.package.events.v1)
//! - Route events by event_type header to appropriate handlers
//! - Execute Cypher transactions against Memgraph
//! - Manual offset commit for at-least-once semantics
//! - Dead Letter Queue for failed events

mod config;
mod consumer;
mod dlq;
mod graph;
mod handlers;
mod proto_gen;
mod server;

use anyhow::{Context, Result};
use tokio::sync::watch;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::config::Config;
use crate::consumer::EventConsumer;
use crate::dlq::DlqPublisher;
use crate::graph::MemgraphClient;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,graph_writer=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("📊 Starting Graph Writer Service");

    // Load configuration
    let config = Config::from_env()
        .context("Failed to load configuration")?;
    
    info!(
        memgraph_uri = %config.memgraph.uri,
        kafka_brokers = %config.kafka.brokers,
        topic = %config.kafka.topic,
        "Configuration loaded"
    );

    // Initialize metrics
    let _recorder = metrics_exporter_prometheus::PrometheusBuilder::new()
        .install()
        .context("Failed to install Prometheus metrics recorder")?;

    // Connect to Memgraph
    let memgraph = MemgraphClient::connect(&config.memgraph)
        .await
        .context("Failed to connect to Memgraph")?;

    // Setup Memgraph schema (constraints + indexes)
    memgraph.setup_schema()
        .await
        .context("Failed to setup Memgraph schema")?;

    // Create DLQ publisher
    let dlq = DlqPublisher::new(&config.kafka)
        .context("Failed to create DLQ publisher")?;

    // Create event consumer
    let consumer = EventConsumer::new(
        config.kafka.clone(),
        memgraph.clone(),
        dlq,
    ).await.context("Failed to create event consumer")?;

    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    // Spawn HTTP server
    let http_handle = {
        let http_config = config.http.clone();
        let memgraph = memgraph.clone();
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            if let Err(e) = server::run_server(http_config, memgraph, shutdown_rx).await {
                error!(error = %e, "HTTP server error");
            }
        })
    };

    // Spawn consumer
    let consumer_handle = {
        let shutdown_rx = shutdown_rx.clone();
        tokio::spawn(async move {
            if let Err(e) = consumer.run(shutdown_rx).await {
                error!(error = %e, "Consumer error");
            }
        })
    };

    info!("✅ Graph Writer Service started successfully");
    info!("📡 Consuming from topic: {}", config.kafka.topic);
    info!("🔗 Connected to Memgraph: {}", config.memgraph.uri);
    info!("🌐 HTTP server: {}:{}", config.http.host, config.http.port);

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    info!("👋 Shutting down Graph Writer Service...");

    // Signal shutdown to all tasks
    let _ = shutdown_tx.send(true);

    // Wait for tasks to complete (with timeout)
    let shutdown_timeout = tokio::time::Duration::from_secs(30);
    let _ = tokio::time::timeout(
        shutdown_timeout,
        futures::future::join_all([consumer_handle, http_handle]),
    ).await;

    info!("✅ Graph Writer Service shutdown complete");
    Ok(())
}
