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

pub mod api_snapshot;
mod ast_parser;
mod breaking_change_predictor;
mod breaking_detector;
mod config;
mod consumer;
mod embeddings;
mod feature_extraction;
mod health;
#[cfg(feature = "onnx")]
mod onnx_model;
mod proto_gen;
pub mod public_api;

use anyhow::{Context, Result};
use config::{Config, ParserConfig};
use consumer::{AnalysisEvent, EventConsumer, EventProducer, PackagePublishedEvent};
use futures::StreamExt;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tokio::sync::{Mutex, Semaphore, mpsc, watch};
use tokio::task::JoinSet;
use tracing::{debug, error, info, warn};
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use crate::ast_parser::{Language, ParserPool, PublicApiSnapshot};
use crate::breaking_detector::{BreakingDetector, SeverityLevel};
use crate::embeddings::EmbeddingGenerator;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

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

    let ready = Arc::new(AtomicBool::new(false));
    if config.service.metrics_enabled {
        let port = config.service.metrics_port;
        let ready = ready.clone();
        tokio::spawn(async move {
            if let Err(e) = health::serve(port, ready).await {
                error!(error = %e, "Health server failed");
            }
        });
    }

    // Spawn shutdown signal handler
    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install CTRL+C handler");
        info!("🛑 Shutdown signal received");
        let _ = shutdown_tx.send(true);
    });

    // Run the service
    if let Err(e) = run_service(config, shutdown_rx, ready).await {
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

async fn run_service(
    config: Config,
    shutdown_rx: watch::Receiver<bool>,
    ready: Arc<AtomicBool>,
) -> Result<()> {
    // Initialize components
    info!("Initializing AST Parser Pool...");
    let parse_timeout = Duration::from_secs(config.workers.parse_timeout_secs);
    let parser_pool = Arc::new(ParserPool::new(parse_timeout, config.parser.max_file_size));

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
            .context("Failed to create Kafka producer")?,
    );

    ready.store(true, Ordering::Relaxed);

    info!("Spawning worker pool...");

    // Spawn worker pool
    let mut workers = JoinSet::new();
    let worker_config = WorkerCfg {
        parser_pool: parser_pool.clone(),
        embedding_generator: embedding_generator.clone(),
        breaking_detector: breaking_detector.clone(),
        producer: producer.clone(),
        semaphore: semaphore.clone(),
        parser: config.parser.clone(),
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
    parser: ParserConfig,
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

    debug!(
        package_id = %event.package_id,
        version = %event.version,
        "Processing package"
    );

    if let Some(size_bytes) = event.size_bytes {
        if size_bytes > config.parser.max_unpacked_size_bytes as i64 {
            warn!(
                package_id = %event.package_id,
                version = %event.version,
                size_bytes,
                max_unpacked_size_bytes = config.parser.max_unpacked_size_bytes,
                "Skipping oversized package"
            );
            return Ok(analysis_events);
        }
    }

    // 1. Download tarball with a hard compressed-size limit.
    let Some(tarball_path) =
        download_tarball(&event.tarball_url, config.parser.max_tarball_size_bytes).await?
    else {
        return Ok(analysis_events);
    };

    // 2. Stream source files from the archive without unpacking the whole package.
    let source_files = match extract_source_files(&tarball_path, &config.parser).await {
        Ok(files) => files,
        Err(err) => {
            cleanup_tarball(&tarball_path).await;
            return Err(err);
        }
    };
    cleanup_tarball(&tarball_path).await;

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
                        api_snapshot
                            .parse_errors
                            .push(format!("{}: {}", file_path, e));
                    }
                }
            }
        }
    }

    api_snapshot.compute_hash();
    debug!(
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
                debug!(count = embeddings.len(), "Generated embeddings");
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

    // Detect primary language
    let primary_lang = source_files
        .iter()
        .find_map(|(p, _)| {
            std::path::Path::new(p)
                .extension()
                .and_then(|e| e.to_str())
                .and_then(Language::from_extension)
        })
        .unwrap_or(Language::JavaScript);

    // Resolve authoritative package entry points (no all-files blind injection)
    let extracted_package_surface =
        resolve_package_entry_points(&source_files, &event.package_id, primary_lang).and_then(
            |entry_points| {
                public_api::PublicApiExtractor::extract_package(
                    &config.parser_pool,
                    &event.package_id,
                    primary_lang,
                    &entry_points,
                )
                .ok()
            },
        );

    // 5. Detect breaking changes (if previous version exists)
    if let Some(ref prev_version) = event.previous_version {
        debug!(previous = %prev_version, "Checking for breaking changes");

        let mut prev_snapshot: Option<PublicApiSnapshot> = None;

        // V1-first baseline resolution from authoritative snapshot repository
        if let Ok(snapshot_repo) = api_snapshot::SnapshotRepository::open_from_env() {
            if let Some(ref current_surface) = extracted_package_surface {
                if let Ok(prev_env) = snapshot_repo
                    .get_by_coordinate(&event.package_id, &current_surface.scope, prev_version)
                    .await
                {
                    prev_snapshot = Some(api_snapshot::surface_to_snapshot(
                        &prev_env.surface,
                        &event.package_id,
                        prev_version,
                    ));
                }
            }
        }

        // Legacy read-only fallback if V1 snapshot was not found
        if prev_snapshot.is_none() {
            prev_snapshot = load_previous_snapshot(&event.package_id, prev_version).await;
        }

        // Run breaking change detection if a baseline was resolved
        if let Some(ref prev) = prev_snapshot {
            let changes = config
                .breaking_detector
                .detect_breaking_changes(prev, &api_snapshot);

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

    // Persist current authoritative API snapshot if Complete
    if let Some(surface) = extracted_package_surface {
        if surface.status == public_api::AnalysisStatus::Complete {
            if let Ok(snapshot_repo) = api_snapshot::SnapshotRepository::open_from_env() {
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                let scope = surface.scope.clone();
                if let Err(e) = snapshot_repo
                    .put(&event.package_id, scope, &event.version, surface, now_ms)
                    .await
                {
                    warn!(error = %e, "Failed to persist authoritative API snapshot");
                }
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

    Ok(analysis_events)
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async fn download_tarball(url: &str, max_bytes: usize) -> Result<Option<String>> {
    debug!(url, "Downloading tarball");

    let client = reqwest::Client::new();
    let response = client.get(url).send().await?.error_for_status()?;
    if let Some(content_length) = response.content_length() {
        if content_length > max_bytes as u64 {
            warn!(
                url,
                content_length, max_bytes, "Skipping tarball because Content-Length exceeds limit"
            );
            return Ok(None);
        }
    }

    let base_dir = std::env::temp_dir().join("randomapp-tarballs");
    tokio::fs::create_dir_all(&base_dir).await?;
    let file_path = base_dir.join(format!("tarball-{}.tgz", uuid::Uuid::new_v4()));

    let mut file = tokio::fs::File::create(&file_path).await?;
    let mut downloaded = 0usize;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        downloaded += chunk.len();
        if downloaded > max_bytes {
            cleanup_tarball(&file_path.to_string_lossy()).await;
            warn!(
                url,
                downloaded, max_bytes, "Skipping tarball because streamed body exceeds limit"
            );
            return Ok(None);
        }
        file.write_all(&chunk).await?;
    }
    file.flush().await?;

    Ok(Some(file_path.to_string_lossy().to_string()))
}

async fn extract_source_files(
    tarball_path: &str,
    parser_config: &ParserConfig,
) -> Result<Vec<(String, String)>> {
    debug!(path = tarball_path, "Extracting source files");
    let tarball_path = tarball_path.to_string();
    let max_file_size = parser_config.max_file_size;
    let max_files = parser_config.max_files_per_package;
    let max_unpacked_size = parser_config.max_unpacked_size_bytes;

    let files = tokio::task::spawn_blocking(move || -> Result<Vec<(String, String)>> {
        use std::io::Read;

        let file = std::fs::File::open(&tarball_path)?;
        let decoder = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);

        let mut results = Vec::new();
        let mut inspected_unpacked_bytes = 0usize;

        for entry in archive.entries()? {
            let mut entry = match entry {
                Ok(entry) => entry,
                Err(err) => {
                    debug!(error = %err, "Skipping unreadable tar entry");
                    continue;
                }
            };

            if !entry.header().entry_type().is_file() {
                continue;
            }

            let path = match entry.path() {
                Ok(path) => path.into_owned(),
                Err(err) => {
                    debug!(error = %err, "Skipping tar entry with invalid path");
                    continue;
                }
            };

            let Some(rel_path) = safe_relative_path(&path) else {
                continue;
            };

            let Some(ext) = Path::new(&rel_path).extension().and_then(|e| e.to_str()) else {
                continue;
            };
            if Language::from_extension(ext).is_none() {
                continue;
            }

            let entry_size = entry.header().size().unwrap_or(0) as usize;
            inspected_unpacked_bytes = inspected_unpacked_bytes.saturating_add(entry_size);
            if inspected_unpacked_bytes > max_unpacked_size {
                warn!(
                    inspected_unpacked_bytes,
                    max_unpacked_size,
                    "Stopping package extraction because unpacked-size budget was reached"
                );
                break;
            }

            if entry_size > max_file_size {
                continue;
            }

            let mut bytes = Vec::with_capacity(entry_size.min(max_file_size));
            let mut limited = entry.by_ref().take(max_file_size as u64 + 1);
            limited.read_to_end(&mut bytes)?;
            if bytes.len() > max_file_size {
                continue;
            }

            if bytes.contains(&0) {
                continue;
            }

            let content = match String::from_utf8(bytes) {
                Ok(text) => text,
                Err(_) => continue,
            };

            results.push((rel_path, content));
            if results.len() >= max_files {
                debug!(
                    max_files,
                    "Stopping package extraction because file limit was reached"
                );
                break;
            }
        }

        Ok(results)
    })
    .await??;

    Ok(files)
}

fn safe_relative_path(path: &Path) -> Option<String> {
    let mut parts = Vec::new();
    for component in path.components() {
        if let std::path::Component::Normal(part) = component {
            parts.push(part.to_string_lossy().to_string());
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

async fn load_previous_snapshot(package_id: &str, version: &str) -> Option<PublicApiSnapshot> {
    debug!(package_id, version, "Loading previous API snapshot");
    let path = snapshot_path(package_id, version);
    if !path.exists() {
        return None;
    }

    match tokio::fs::read_to_string(path).await {
        Ok(content) => serde_json::from_str::<PublicApiSnapshot>(&content).ok(),
        Err(_) => None,
    }
}

async fn cleanup_tarball(path: &str) {
    debug!(path, "Cleaning up tarball");
    let _ = tokio::fs::remove_file(path).await;
}

fn snapshot_base_dir() -> PathBuf {
    std::env::var("ANALYSIS_SNAPSHOT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("randomapp-snapshots"))
}

fn sanitize_segment(value: &str) -> String {
    value.replace(['/', '\\', ':'], "_")
}

fn snapshot_path(package_id: &str, version: &str) -> PathBuf {
    let base = snapshot_base_dir();
    let pkg = sanitize_segment(package_id);
    base.join(pkg)
        .join(format!("{}.json", sanitize_segment(version)))
}

fn resolve_package_entry_points<'a>(
    source_files: &'a [(String, String)],
    _package_id: &str,
    lang: Language,
) -> Option<Vec<(&'a str, &'a str, &'a str)>> {
    match lang {
        Language::JavaScript | Language::TypeScript => {
            // Check for package.json metadata
            if let Some((_, content)) = source_files
                .iter()
                .find(|(p, _)| p.ends_with("package.json") || p == "package.json")
            {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(content) {
                    if let Some(main) = v.get("main").and_then(|m| m.as_str()) {
                        let normalized = main.trim_start_matches("./");
                        if let Some((p, c)) =
                            source_files.iter().find(|(p, _)| p.ends_with(normalized))
                        {
                            return Some(vec![(p.as_str(), p.as_str(), c.as_str())]);
                        }
                    }
                    if let Some(types) = v
                        .get("types")
                        .or_else(|| v.get("typings"))
                        .and_then(|t| t.as_str())
                    {
                        let normalized = types.trim_start_matches("./");
                        if let Some((p, c)) =
                            source_files.iter().find(|(p, _)| p.ends_with(normalized))
                        {
                            return Some(vec![(p.as_str(), p.as_str(), c.as_str())]);
                        }
                    }
                }
            }
            // Standard convention roots
            for standard in &[
                "src/index.ts",
                "src/index.js",
                "index.ts",
                "index.js",
                "lib/index.ts",
                "lib/index.js",
            ] {
                if let Some((p, c)) = source_files.iter().find(|(p, _)| p.ends_with(standard)) {
                    return Some(vec![(p.as_str(), p.as_str(), c.as_str())]);
                }
            }
            None
        }
        Language::Rust => {
            // Standard crate roots
            for standard in &["src/lib.rs", "lib.rs"] {
                if let Some((p, c)) = source_files.iter().find(|(p, _)| p.ends_with(standard)) {
                    return Some(vec![(p.as_str(), p.as_str(), c.as_str())]);
                }
            }
            None
        }
        Language::Python => {
            for standard in &["__init__.py", "src/__init__.py"] {
                if let Some((p, c)) = source_files.iter().find(|(p, _)| p.ends_with(standard)) {
                    return Some(vec![(p.as_str(), p.as_str(), c.as_str())]);
                }
            }
            None
        }
        Language::Java => {
            if let Some((p, c)) = source_files
                .iter()
                .find(|(p, _)| p.ends_with("module-info.java"))
            {
                return Some(vec![(p.as_str(), p.as_str(), c.as_str())]);
            }
            None
        }
        Language::Go => {
            if let Some((p, c)) = source_files
                .iter()
                .find(|(p, _)| p.ends_with("main.go") || p.ends_with("lib.go"))
            {
                return Some(vec![(p.as_str(), p.as_str(), c.as_str())]);
            }
            None
        }
    }
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
            tarball_url: "https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz"
                .to_string(),
            size_bytes: None,
            previous_version: None,
            published_at: chrono::Utc::now(),
        };

        let work_item = WorkItem::new(event.clone());
        assert_eq!(work_item.event.package_id, "test-package");
        assert_eq!(work_item.retry_count, 0);
    }

    #[test]
    fn test_resolve_package_entry_points_metadata_and_conventions() {
        // 6R2-T14 & 6R2-T15: TS package with package.json pointing to index.ts while internal.ts exists
        let files_ts = vec![
            (
                "package.json".to_string(),
                r#"{"name": "foo", "main": "src/index.ts"}"#.to_string(),
            ),
            (
                "src/index.ts".to_string(),
                "export function publicFn() {}".to_string(),
            ),
            (
                "src/internal.ts".to_string(),
                "export function secretInternal() {}".to_string(),
            ),
        ];
        let ep_ts = resolve_package_entry_points(&files_ts, "foo", Language::TypeScript).unwrap();
        assert_eq!(ep_ts.len(), 1);
        assert_eq!(ep_ts[0].0, "src/index.ts");

        // 6R2-T16: Ambiguous / missing entry points returns None
        let files_ambiguous = vec![
            (
                "src/helper1.ts".to_string(),
                "export const A = 1;".to_string(),
            ),
            (
                "src/helper2.ts".to_string(),
                "export const B = 2;".to_string(),
            ),
        ];
        assert!(
            resolve_package_entry_points(&files_ambiguous, "foo", Language::TypeScript).is_none()
        );

        // 6R2-T17: Rust crate root resolves src/lib.rs
        let files_rs = vec![
            ("src/lib.rs".to_string(), "pub fn run() {}".to_string()),
            (
                "src/internal_mod.rs".to_string(),
                "pub fn helper() {}".to_string(),
            ),
        ];
        let ep_rs = resolve_package_entry_points(&files_rs, "rust_crate", Language::Rust).unwrap();
        assert_eq!(ep_rs.len(), 1);
        assert_eq!(ep_rs[0].0, "src/lib.rs");

        // 6R2-T18: Python package root resolves __init__.py
        let files_py = vec![
            (
                "src/__init__.py".to_string(),
                "def main(): pass".to_string(),
            ),
            (
                "src/internal.py".to_string(),
                "def hidden(): pass".to_string(),
            ),
        ];
        let ep_py = resolve_package_entry_points(&files_py, "py_pkg", Language::Python).unwrap();
        assert_eq!(ep_py.len(), 1);
        assert_eq!(ep_py[0].0, "src/__init__.py");
    }
}
