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
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use config::Config;
use memgraph_sink::MemgraphSink;
use qdrant_sink::QdrantSink;
use risingwave_source::{RisingWaveSource, SyncEvent};

/// Batch buffer for graph operations
struct GraphBatch {
    packages: Vec<risingwave_source::PackageRecord>,
    dependencies: Vec<risingwave_source::DependencyRecord>,
}

impl GraphBatch {
    fn new() -> Self {
        Self {
            packages: Vec::new(),
            dependencies: Vec::new(),
        }
    }
    
    fn len(&self) -> usize {
        self.packages.len() + self.dependencies.len()
    }
    
    fn is_empty(&self) -> bool {
        self.packages.is_empty() && self.dependencies.is_empty()
    }
    
    fn clear(&mut self) {
        self.packages.clear();
        self.dependencies.clear();
    }
}

/// Batch buffer for vector operations
struct VectorBatch {
    embeddings: Vec<risingwave_source::EmbeddingRecord>,
}

impl VectorBatch {
    fn new() -> Self {
        Self {
            embeddings: Vec::new(),
        }
    }
    
    fn len(&self) -> usize {
        self.embeddings.len()
    }
    
    fn is_empty(&self) -> bool {
        self.embeddings.is_empty()
    }
    
    fn clear(&mut self) {
        self.embeddings.clear();
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("🔗 Starting Syncer Service");
    
    // Load configuration
    let config = Config::from_env()?;
    info!(?config, "Configuration loaded");
    
    // Connect to RisingWave source
    let mut risingwave = RisingWaveSource::new(config.risingwave.clone()).await?;
    
    // Connect to Memgraph sink (if enabled)
    let memgraph = if config.sync.enable_graph {
        let user = config.memgraph.username.as_deref().unwrap_or("");
        let password = config.memgraph.password.as_deref().unwrap_or("");
        let sink = MemgraphSink::new(&config.memgraph.url, user, password).await?;
        sink.create_indexes().await?;
        Some(Arc::new(sink))
    } else {
        warn!("Graph sync disabled");
        None
    };
    
    // Connect to Qdrant sink (if enabled)
    let qdrant = if config.sync.enable_vector {
        let sink = QdrantSink::new(&config.qdrant.url).await?;
        sink.ensure_collection().await?;
        Some(Arc::new(sink))
    } else {
        warn!("Vector sync disabled");
        None
    };
    
    info!("✅ All connections established");
    
    // Create channel for sync events
    let (tx, mut rx) = mpsc::channel::<SyncEvent>(10000);
    
    // Spawn RisingWave streaming task
    let stream_handle = tokio::spawn(async move {
        if let Err(e) = risingwave.start_streaming(tx).await {
            error!(error = %e, "RisingWave streaming error");
        }
    });
    
    // Batch buffers
    let mut graph_batch = GraphBatch::new();
    let mut vector_batch = VectorBatch::new();
    let batch_size = config.memgraph.batch_size;
    let max_retries = config.sync.max_retries;
    let retry_delay = Duration::from_millis(config.sync.retry_delay_ms);
    
    // Main sync loop
    let sync_handle = tokio::spawn(async move {
        let mut total_synced: u64 = 0;
        
        while let Some(event) = rx.recv().await {
            match event {
                SyncEvent::Package(pkg) => {
                    graph_batch.packages.push(pkg);
                    
                    // Flush if batch is full
                    if graph_batch.len() >= batch_size {
                        if let Some(ref sink) = memgraph {
                            if let Err(e) = flush_graph_batch(
                                sink.clone(), 
                                &mut graph_batch, 
                                max_retries,
                                retry_delay
                            ).await {
                                error!(error = %e, "Failed to flush graph batch");
                            } else {
                                total_synced += graph_batch.len() as u64;
                            }
                            graph_batch.clear();
                        }
                    }
                }
                
                SyncEvent::Dependency(dep) => {
                    graph_batch.dependencies.push(dep);
                    
                    if graph_batch.len() >= batch_size {
                        if let Some(ref sink) = memgraph {
                            if let Err(e) = flush_graph_batch(
                                sink.clone(),
                                &mut graph_batch,
                                max_retries,
                                retry_delay
                            ).await {
                                error!(error = %e, "Failed to flush graph batch");
                            } else {
                                total_synced += graph_batch.len() as u64;
                            }
                            graph_batch.clear();
                        }
                    }
                }
                
                SyncEvent::Embedding(emb) => {
                    vector_batch.embeddings.push(emb);
                    
                    if vector_batch.len() >= batch_size {
                        if let Some(ref sink) = qdrant {
                            if let Err(e) = flush_vector_batch(
                                sink.clone(),
                                &mut vector_batch,
                                max_retries,
                                retry_delay
                            ).await {
                                error!(error = %e, "Failed to flush vector batch");
                            } else {
                                total_synced += vector_batch.len() as u64;
                            }
                            vector_batch.clear();
                        }
                    }
                }
                
                SyncEvent::BatchComplete { count } => {
                    info!(
                        count = count,
                        total_synced = total_synced,
                        graph_pending = graph_batch.len(),
                        vector_pending = vector_batch.len(),
                        "Batch complete"
                    );
                    
                    // Flush remaining items
                    if !graph_batch.is_empty() {
                        if let Some(ref sink) = memgraph {
                            let _ = flush_graph_batch(
                                sink.clone(),
                                &mut graph_batch,
                                max_retries,
                                retry_delay
                            ).await;
                            graph_batch.clear();
                        }
                    }
                    
                    if !vector_batch.is_empty() {
                        if let Some(ref sink) = qdrant {
                            let _ = flush_vector_batch(
                                sink.clone(),
                                &mut vector_batch,
                                max_retries,
                                retry_delay
                            ).await;
                            vector_batch.clear();
                        }
                    }
                }
            }
        }
    });
    
    info!("✅ Syncer Service started successfully");
    
    // Wait for shutdown signal
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("👋 Received shutdown signal");
        }
        _ = stream_handle => {
            error!("Stream task terminated unexpectedly");
        }
        _ = sync_handle => {
            error!("Sync task terminated unexpectedly");
        }
    }
    
    info!("👋 Shutting down Syncer Service");
    
    Ok(())
}

/// Flush graph batch to Memgraph with retry
async fn flush_graph_batch(
    sink: Arc<MemgraphSink>,
    batch: &mut GraphBatch,
    max_retries: u32,
    retry_delay: Duration,
) -> Result<()> {
    let mut last_error = None;
    
    for attempt in 1..=max_retries {
        match flush_graph_batch_inner(&sink, batch).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                warn!(
                    attempt = attempt,
                    max_retries = max_retries,
                    error = %e,
                    "Graph batch flush failed, retrying..."
                );
                last_error = Some(e);
                tokio::time::sleep(retry_delay).await;
            }
        }
    }
    
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Unknown error")))
}

async fn flush_graph_batch_inner(
    sink: &MemgraphSink,
    batch: &GraphBatch,
) -> Result<()> {
    // Upsert packages
    for pkg in &batch.packages {
        sink.upsert_package(
            &pkg.id,
            &pkg.name,
            &pkg.ecosystem,
            pkg.description.as_deref(),
        ).await?;
    }
    
    // Create dependency edges
    for dep in &batch.dependencies {
        sink.create_dependency(
            &dep.from_package_id,
            &dep.to_package_id,
            &dep.version_constraint,
            &dep.dependency_type,
        ).await?;
    }
    
    info!(
        packages = batch.packages.len(),
        dependencies = batch.dependencies.len(),
        "Flushed graph batch"
    );
    
    Ok(())
}

/// Flush vector batch to Qdrant with retry
async fn flush_vector_batch(
    sink: Arc<QdrantSink>,
    batch: &mut VectorBatch,
    max_retries: u32,
    retry_delay: Duration,
) -> Result<()> {
    let mut last_error = None;
    
    for attempt in 1..=max_retries {
        match flush_vector_batch_inner(&sink, batch).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                warn!(
                    attempt = attempt,
                    max_retries = max_retries,
                    error = %e,
                    "Vector batch flush failed, retrying..."
                );
                last_error = Some(e);
                tokio::time::sleep(retry_delay).await;
            }
        }
    }
    
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Unknown error")))
}

async fn flush_vector_batch_inner(
    sink: &QdrantSink,
    batch: &VectorBatch,
) -> Result<()> {
    use std::collections::HashMap;
    
    for emb in &batch.embeddings {
        let mut metadata = HashMap::new();
        metadata.insert("model".to_string(), emb.model.clone());
        
        sink.upsert_vector(
            &emb.package_id,
            emb.embedding.clone(),
            metadata,
        ).await?;
    }
    
    info!(
        embeddings = batch.embeddings.len(),
        "Flushed vector batch"
    );
    
    Ok(())
}
