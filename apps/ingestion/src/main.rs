pub mod config;
pub mod producer;
pub mod consumer;
pub mod http;
pub mod model;
pub mod traits;
pub mod store;
pub mod registries;

use anyhow::Result;
use config::AppConfig;
use sqlx::postgres::PgPoolOptions;
use std::{net::SocketAddr, time::Duration};
use tracing::{info, warn, error};
use metrics_exporter_prometheus::PrometheusBuilder;
use axum::{routing::get, Router};
use store::PostgresCheckpointStore;
use std::sync::Arc;
use registries::npm::watcher::NpmWatcher;
use registries::npm::worker::NpmWorker;
use registries::npm::fetcher::NpmFetcher;
use registries::npm::state::NpmStateStore;
use consumer::EventConsumer;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    info!("Starting Ingestion Service (Enterprise)...");

    let config = AppConfig::load().unwrap_or_else(|e| {
        warn!("Failed to load config, using defaults: {}", e);
        AppConfig::default()
    });

    let builder = PrometheusBuilder::new();
    let handle = builder.install_recorder().expect("failed to install recorder");
    
    tokio::spawn(async move {
        let app = Router::new().route("/metrics", get(move || std::future::ready(handle.render())));
        let addr = SocketAddr::from(([0, 0, 0, 0], 9001));
        info!("Metrics server listening on {}", addr);
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        axum::serve(listener, app).await.unwrap();
    });

    info!("Connecting to database...");
    let pool = PgPoolOptions::new()
        .max_connections(config.database.max_connections)
        .connect(&config.database.url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;
    info!("Database migrations applied.");

    let checkpoint_store = Arc::new(PostgresCheckpointStore::new(pool.clone()));

    let producer = Arc::new(producer::EventProducer::new(&config.kafka.brokers, &config.kafka.topic)?);
    
    // Initialize Proxy Rotator (Arc for sharing)
    let rotator = Arc::new(http::ProxyRotator::new(config.crawler.proxy_urls.clone(), &config.crawler)?);

    if config.registries.npm_enabled {
        // --- Watcher Setup ---
        let watcher_store = checkpoint_store.clone();
        let watcher_producer = producer.clone();
        
        info!("Spawning NPM Watcher...");
        tokio::spawn(async move {
            loop {
                match NpmWatcher::new(watcher_store.clone(), watcher_producer.clone(), "raw.npm.changes.v1".to_string()) {
                    Ok(watcher) => {
                         if let Err(e) = watcher.run().await {
                            error!("NPM Watcher crashed: {}. Restarting in 5s...", e);
                         }
                    }
                    Err(e) => {
                        error!("Failed to initialize NPM Watcher: {}. Retrying in 5s...", e);
                    }
                }
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        });

        // --- Worker Setup ---
        let worker_producer = producer.clone();
        let worker_pool = pool.clone();
        let worker_rotator = rotator.clone();
        let brokers = config.kafka.brokers.clone();
        
        info!("Spawning NPM Worker...");
        tokio::spawn(async move {
             loop {
                // Initialize resources inside retry loop or outside? 
                // Consumer needs to be robust. 
                match EventConsumer::new(&brokers, "ingestion-npm-worker-v1", "raw.npm.changes.v1") {
                    Ok(consumer) => {
                        let fetcher = NpmFetcher::new(worker_rotator.clone());
                        let state_store = NpmStateStore::new(worker_pool.clone());
                        
                        let worker = NpmWorker::new(consumer, fetcher, state_store, worker_producer.clone());
                        
                        if let Err(e) = worker.run().await {
                            error!("NPM Worker crashed: {}. Restarting in 5s...", e);
                        }
                    }
                    Err(e) => {
                         error!("Failed to create NPM Worker Consumer: {}. Retrying in 5s...", e);
                    }
                }
                tokio::time::sleep(Duration::from_secs(5)).await;
             }
        });
    }

    info!("Ingestion Service Initialized. Tasks running.");
    
    loop {
        tokio::time::sleep(Duration::from_secs(3600)).await;
    }
}
