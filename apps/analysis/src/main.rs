//! Analysis Service - AST parsing and breaking change detection
//!
//! Responsibilities:
//! - Consume PackagePublished events from Redpanda
//! - Download and extract package tarballs
//! - Parse source code using Tree-sitter
//! - Generate embeddings via configured provider
//! - Detect breaking changes between versions
//! - Produce BreakingChangeDetected events
//!
//! Architecture:
//! - Worker pool with bounded queue (backpressure via Semaphore)
//! - Idempotent processing with deduplication
//! - Dead Letter Queue (DLQ) for failed messages
//! - Graceful shutdown with CancellationToken

#![allow(dead_code)]
#![allow(unused_imports)]
#![allow(unused_variables)]
#![allow(unused_parens)]

mod ast_parser;
mod breaking_change_predictor;
mod breaking_detector;
mod config;
mod consumer;
mod embeddings;
mod feature_extraction;
mod onnx_model;

use anyhow::{Context, Result};
use config::Config;
use consumer::{AnalysisEvent, EventConsumer, EventProducer, PackagePublishedEvent};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, watch, Mutex, Semaphore};
use tokio::task::JoinSet;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::ast_parser::{Language, ParserPool, PublicApiSnapshot};
use crate::breaking_detector::{BreakingDetector, SeverityLevel};
use crate::embeddings::EmbeddingGenerator;

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing with JSON format for production
    init_tracing();

    info!(
        version = env!("CARGO_PKG_VERSION"),
        "🧠 Starting Analysis Service"
    );

    // Load configuration
    let config = Config::from_env().context("Failed to load configuration")?;
    info!(
        kafka_brokers = %config.kafka.brokers,
        worker_count = config.workers.count,
        "Configuration loaded"
    );

    // Create shutdown channel for graceful shutdown
    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    // Spawn shutdown signal handler
    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install CTRL+C handler");
        info!("🛑 Shutdown signal received");
        let _ = shutdown_tx.send(true);
    });

    // Run the service
    if let Err(e) = run_service(config, shutdown_rx).await {
        error!(error = %e, "Service failed");
        std::process::exit(1);
    }

    info!("👋 Analysis Service shutdown complete");
    Ok(())
}

fn init_tracing() {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("info")
            .add_directive("rdkafka=warn".parse().unwrap())
            .add_directive("librdkafka=warn".parse().unwrap())
    });

    tracing_subscriber::registry()
        .with(env_filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(true)
                .with_thread_ids(true)
                .with_file(true)
                .with_line_number(true),
        )
        .init();
}

// ═══════════════════════════════════════════════════════════════
// SERVICE RUNNER
// ═══════════════════════════════════════════════════════════════

async fn run_service(config: Config, shutdown_rx: watch::Receiver<bool>) -> Result<()> {
    // Initialize components
    info!("Initializing AST Parser Pool...");
    let parse_timeout = Duration::from_secs(config.workers.parse_timeout_secs);
    let parser_pool = Arc::new(ParserPool::new(
        parse_timeout,
        config.parser.max_file_size,
    ));

    info!("Initializing Embedding Generator...");
    let embedding_generator = Arc::new(
        EmbeddingGenerator::new(&config.embedding)
            .await
            .context("Failed to initialize embedding generator")?,
    );

    info!("Initializing Breaking Change Detector...");
    let breaking_detector = Arc::new(BreakingDetector::new());

    // Create work channel with bounded capacity for backpressure
    info!("Creating work channels...");
    let (work_tx, work_rx) = mpsc::channel::<WorkItem>(config.workers.queue_size);
    let work_rx = Arc::new(Mutex::new(work_rx));

    // Create concurrency semaphore
    let semaphore = Arc::new(Semaphore::new(config.workers.count));

    // Initialize Kafka consumer and producer
    info!("Connecting to Kafka (Consumer)...");
    let consumer = EventConsumer::new(&config.kafka)
        .await
        .context("Failed to create Kafka consumer")?;

    info!("Connecting to Kafka (Producer)...");
    let producer = Arc::new(
        EventProducer::new(&config.kafka)
            .await
            .context("Failed to create Kafka producer")?
    );

    info!("Spawning worker pool...");

    // Spawn worker pool
    let mut workers = JoinSet::new();
    let worker_config = WorkerCfg {
        parser_pool: parser_pool.clone(),
        embedding_generator: embedding_generator.clone(),
        breaking_detector: breaking_detector.clone(),
        producer: producer.clone(),
        semaphore: semaphore.clone(),
        dlq_topic: config.kafka.dlq_topic.clone(),
        max_retries: config.kafka.max_retries,
    };

    for worker_id in 0..config.workers.count {
        let rx = work_rx.clone();
        let cfg = worker_config.clone();
        let shutdown = shutdown_rx.clone();

        workers.spawn(async move {
            worker_loop(worker_id, rx, cfg, shutdown).await;
        });
    }

    info!(
        worker_count = config.workers.count,
        queue_size = config.workers.queue_size,
        "✅ Analysis Service started successfully"
    );

    // Main consumer loop
    consumer_loop(consumer, work_tx, &config, shutdown_rx.clone()).await?;

    // Wait for workers to finish
    info!("Waiting for workers to complete...");
    while let Some(result) = workers.join_next().await {
        if let Err(e) = result {
            warn!(error = %e, "Worker task panicked");
        }
    }

    // Flush producer
    producer.flush(Duration::from_secs(5)).await;

    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// WORK ITEM
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone)]
struct WorkItem {
    event: PackagePublishedEvent,
    retry_count: u32,
    span: tracing::Span,
}

impl WorkItem {
    fn new(event: PackagePublishedEvent) -> Self {
        let span = tracing::info_span!(
            "process_package",
            package_id = %event.package_id,
            version = %event.version,
            ecosystem = %event.ecosystem,
        );
        Self {
            event,
            retry_count: 0,
            span,
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// WORKER CONFIGURATION
// ═══════════════════════════════════════════════════════════════

#[derive(Clone)]
struct WorkerCfg {
    parser_pool: Arc<ParserPool>,
    embedding_generator: Arc<EmbeddingGenerator>,
    breaking_detector: Arc<BreakingDetector>,
    producer: Arc<EventProducer>,
    semaphore: Arc<Semaphore>,
    dlq_topic: String,
    max_retries: u32,
}

// ═══════════════════════════════════════════════════════════════
// CONSUMER LOOP
// ═══════════════════════════════════════════════════════════════

async fn consumer_loop(
    consumer: EventConsumer,
    work_tx: mpsc::Sender<WorkItem>,
    _config: &Config,
    mut shutdown_rx: watch::Receiver<bool>,
) -> Result<()> {
    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    info!("Consumer loop shutting down");
                    break;
                }
            }
            result = consumer.poll(Duration::from_millis(100)) => {
                match result {
                    Ok(Some(event)) => {
                        let work_item = WorkItem::new(event);

                        // Try to send to worker pool, with timeout for backpressure
                        match tokio::time::timeout(
                            Duration::from_secs(30),
                            work_tx.send(work_item.clone())
                        ).await {
                            Ok(Ok(())) => {
                                // Successfully queued
                            }
                            Ok(Err(_)) => {
                                // Channel closed, shutting down
                                break;
                            }
                            Err(_) => {
                                // Timeout - backpressure
                                warn!(
                                    package_id = %work_item.event.package_id,
                                    "Work queue full, applying backpressure"
                                );
                                // Retry after delay
                                tokio::time::sleep(Duration::from_secs(1)).await;
                            }
                        }
                    }
                    Ok(None) => {
                        // No message available
                    }
                    Err(e) => {
                        error!(error = %e, "Failed to poll Kafka");
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        }
    }

    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// WORKER LOOP
// ═══════════════════════════════════════════════════════════════

async fn worker_loop(
    worker_id: usize,
    rx: Arc<Mutex<mpsc::Receiver<WorkItem>>>,
    config: WorkerCfg,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    info!(worker_id, "Worker started");

    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    info!(worker_id, "Worker shutting down");
                    break;
                }
            }
            item = async {
                let mut guard = rx.lock().await;
                guard.recv().await
            } => {
                match item {
                    Some(work_item) => {
                        // Acquire semaphore permit
                        let _permit = config.semaphore.acquire().await.unwrap();

                        // Process in the span context
                        let result = work_item.span.in_scope(|| {
                            process_work_item(&work_item, &config)
                        }).await;

                        match result {
                            Ok(events) => {
                                // Publish analysis events
                                for event in events {
                                    if let Err(e) = config.producer.send_analysis_event(&event).await {
                                        error!(error = %e, "Failed to publish analysis event");
                                    }
                                }
                            }
                            Err(e) => {
                                error!(
                                    error = %e,
                                    package_id = %work_item.event.package_id,
                                    retry_count = work_item.retry_count,
                                    "Failed to process package"
                                );

                                // Send to DLQ after max retries
                                if work_item.retry_count >= config.max_retries {
                                    if let Err(dlq_err) = config.producer.send_to_dlq(
                                        &config.dlq_topic,
                                        &work_item.event,
                                        &e.to_string(),
                                    ).await {
                                        error!(error = %dlq_err, "Failed to send to DLQ");
                                    }
                                }
                            }
                        }
                    }
                    None => {
                        info!(worker_id, "Channel closed, worker stopping");
                        break;
                    }
                }
            }
        }
    }

    info!(worker_id, "Worker stopped");
}

// ═══════════════════════════════════════════════════════════════
// WORK ITEM PROCESSING
// ═══════════════════════════════════════════════════════════════

#[allow(unused)]
async fn process_work_item(item: &WorkItem, config: &WorkerCfg) -> Result<Vec<AnalysisEvent>> {
    let event = &item.event;
    let mut analysis_events = Vec::new();

    info!("Processing package");

    // 1. Download and extract tarball
    let tarball_path = download_tarball(&event.tarball_url).await?;

    // 2. Extract source files
    let source_files = extract_source_files(&tarball_path).await?;

    // 3. Parse source and extract public API
    let mut api_snapshot = PublicApiSnapshot::new(event.package_id.clone(), event.version.clone());

    for (file_path, content) in &source_files {
        if let Some(ext) = std::path::Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str())
        {
            if let Some(lang) = Language::from_extension(ext) {
                match config.parser_pool.parse(lang, content, file_path) {
                    Ok(symbols) => {
                        *api_snapshot.language_stats.entry(lang).or_insert(0) += 1;
                        api_snapshot.symbols.extend(symbols);
                        api_snapshot.files_parsed += 1;
                    }
                    Err(e) => {
                        api_snapshot.parse_errors.push(format!("{}: {}", file_path, e));
                    }
                }
            }
        }
    }

    api_snapshot.compute_hash();
    info!(
        symbols = api_snapshot.symbols.len(),
        files = api_snapshot.files_parsed,
        hash = %api_snapshot.api_hash,
        "API extraction complete"
    );

    // 4. Generate embeddings for symbols
    let public_symbols = api_snapshot.public_symbols();
    if !public_symbols.is_empty() {
        let texts: Vec<String> = public_symbols
            .iter()
            .map(|s| format!("{} {}", s.name, s.documentation.as_deref().unwrap_or("")))
            .collect();

        match config.embedding_generator.generate_batch(&texts).await {
            Ok(embeddings) => {
                info!(count = embeddings.len(), "Generated embeddings");
                // Emit embedding event
                analysis_events.push(AnalysisEvent::EmbeddingsGenerated {
                    package_id: event.package_id.clone(),
                    version: event.version.clone(),
                    symbol_count: public_symbols.len(),
                    embedding_count: embeddings.len(),
                });
            }
            Err(e) => {
                warn!(error = %e, "Failed to generate embeddings");
            }
        }
    }

    // 5. Detect breaking changes (if previous version exists)
    if let Some(ref prev_version) = event.previous_version {
        info!(previous = %prev_version, "Checking for breaking changes");

        // Load previous API snapshot (from cache/storage)
        if let Some(prev_snapshot) = load_previous_snapshot(&event.package_id, prev_version).await {
            let changes = config
                .breaking_detector
                .detect_breaking_changes(&prev_snapshot, &api_snapshot);

            if !changes.is_empty() {
                let breaking_count = changes
                    .iter()
                    .filter(|c| c.severity == SeverityLevel::Breaking)
                    .count();

                info!(
                    total_changes = changes.len(),
                    breaking = breaking_count,
                    "Breaking changes detected"
                );

                analysis_events.push(AnalysisEvent::BreakingChangesDetected {
                    package_id: event.package_id.clone(),
                    version: event.version.clone(),
                    previous_version: prev_version.clone(),
                    changes: changes.into_iter().map(|c| c.into()).collect(),
                });
            }
        }
    }

    // 6. Emit API parsed event
    analysis_events.push(AnalysisEvent::ApiParsed {
        package_id: event.package_id.clone(),
        version: event.version.clone(),
        symbol_count: api_snapshot.symbols.len(),
        public_symbol_count: api_snapshot.public_symbols().len(),
        api_hash: api_snapshot.api_hash.clone(),
    });

    // Cleanup
    cleanup_tarball(&tarball_path).await;

    Ok(analysis_events)
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async fn download_tarball(url: &str) -> Result<String> {
    // TODO: Implement actual tarball download
    // For now, return a placeholder path
    info!(url, "Downloading tarball");
    Ok(format!("/tmp/tarball-{}.tgz", uuid::Uuid::new_v4()))
}

async fn extract_source_files(tarball_path: &str) -> Result<Vec<(String, String)>> {
    // TODO: Implement actual tarball extraction
    // Returns list of (file_path, content) tuples
    info!(path = tarball_path, "Extracting source files");
    Ok(vec![])
}

async fn load_previous_snapshot(
    package_id: &str,
    version: &str,
) -> Option<PublicApiSnapshot> {
    // TODO: Load from cache/database
    info!(package_id, version, "Loading previous API snapshot");
    None
}

async fn cleanup_tarball(path: &str) {
    // TODO: Remove temporary files
    info!(path, "Cleaning up tarball");
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_work_item_creation() {
        let event = PackagePublishedEvent {
            package_id: "test-package".to_string(),
            version: "1.0.0".to_string(),
            ecosystem: "npm".to_string(),
            tarball_url: "https://example.com/test.tgz".to_string(),
            previous_version: None,
            published_at: chrono::Utc::now(),
        };

        let work_item = WorkItem::new(event.clone());
        assert_eq!(work_item.event.package_id, "test-package");
        assert_eq!(work_item.retry_count, 0);
    }
}
