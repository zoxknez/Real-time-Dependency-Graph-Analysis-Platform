pub mod config;
pub mod producer;
pub mod consumer;
pub mod http;
pub mod model;
pub mod traits;
pub mod store;
pub mod registries;
pub mod event_utils;
pub mod proto_gen;
pub mod emit;
pub mod seed;

use anyhow::Result;
use clap::{Parser, ValueEnum};
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
use seed::{SeedRunner, SeedConfig};

/// Ingestion Service CLI
#[derive(Parser, Debug)]
#[command(name = "ingestion", about = "Package registry ingestion service")]
struct Cli {
    /// Registries to ingest from
    #[arg(long, value_enum, default_value = "all")]
    registry: Registry,

    /// Run mode
    #[arg(long, value_enum, default_value = "live")]
    mode: Mode,

    /// PyPI packages to seed (comma-separated)
    #[arg(long, default_value = "requests,flask,django")]
    seed_pypi: String,

    /// Cargo crates to seed (comma-separated)
    #[arg(long, default_value = "tokio,serde,axum")]
    seed_cargo: String,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum Registry {
    Npm,
    Pypi,
    Cargo,
    All,
}


#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    
    let cli = Cli::parse();
    
    info!("Starting Ingestion Service (Enterprise)...");
    info!("Mode: {:?}, Registry: {:?}", cli.mode, cli.registry);

    let config = AppConfig::load().unwrap_or_else(|e| {
        warn!("Failed to load config, using defaults: {}", e);
        AppConfig::default()
    });

    let builder = PrometheusBuilder::new();
    let handle = match builder.install_recorder() {
        Ok(h) => h,
        Err(e) => {
            tracing::error!("Failed to install Prometheus recorder: {}", e);
            return Err(anyhow::anyhow!("Failed to install Prometheus recorder: {}", e));
        }
    };
    
    tokio::spawn(async move {
        let app = Router::new().route("/metrics", get(move || std::future::ready(handle.render())));
        let addr = SocketAddr::from(([0, 0, 0, 0], 9001));
        info!("Metrics server listening on {}", addr);
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                if let Err(e) = axum::serve(listener, app).await {
                    tracing::error!("Metrics server crashed: {}", e);
                }
            }
            Err(e) => {
                tracing::error!("Failed to bind metrics server to port 9001: {}", e);
            }
        }
    });

    info!("Connecting to database...");
    let pool = PgPoolOptions::new()
        .max_connections(config.database.max_connections)
        .connect(&config.database.url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;
    info!("Database migrations applied.");

    // Handle different modes
    match cli.mode {
        Mode::Seed => run_seed_mode(&cli, pool).await,
        Mode::Publish => run_publish_mode(config, pool).await,
        Mode::Live => run_live_mode(&cli, config, pool).await,
        Mode::Simulation => run_simulation_mode(config).await,
    }
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum Mode {
    /// Live polling from registries
    Live,
    /// Seed mode - fetch specific packages then exit
    Seed,
    /// Publish mode - run outbox publisher only (push events to Kafka)
    Publish,
    /// Simulation mode - generate fake events for demo
    Simulation,
}

/// Run simulation mode - generate fake events
/// Run simulation mode - generate fake events
async fn run_simulation_mode(config: AppConfig) -> Result<()> {
    info!("Running in SIMULATION mode - generating fake events...");
    use rand::Rng;
    use prost::Message;

    let producer = producer::EventProducer::new(&config.kafka.brokers, "domain.package.events.v1")?;
    let mut rng = rand::thread_rng();

    info!("Starting event simulation ticker (2s interval)...");
    
    // List of popular packages to simulate activity for
    let popular_packages = vec![
        ("react", "npm"),
        ("lodash", "npm"),
        ("express", "npm"),
        ("tokio", "cargo"),
        ("serde", "cargo"),
        ("requests", "pypi"),
        ("flask", "pypi"),
    ];
    
    loop {
        let (name, ecosystem) = popular_packages[rng.gen_range(0..popular_packages.len())];
        let major = rng.gen_range(1..20);
        let minor = rng.gen_range(0..50);
        let patch = rng.gen_range(0..100);
        let version = format!("{}.{}.{}", major, minor, patch);
        
        let now = std::time::SystemTime::now(); 
        
        // Use fully qualified path to ensure correct struct
        let tarball_url = build_simulated_tarball_url(ecosystem, name, &version);

        let event = crate::proto_gen::domain::package::v1::VersionUpserted {
            meta: Some(crate::proto_gen::shared::event::v1::EventMeta {
                event_id: uuid::Uuid::new_v4().to_string(),
                source: "ingestion-simulation".to_string(),
                traceparent: String::new(),
                occurred_at: Some(prost_types::Timestamp::from(now)),
                schema_version: "v1".to_string(),
            }),
            ecosystem: ecosystem.to_string(),
            package_name: name.to_string(),
            version: version.clone(),
            yanked: false,
            tarball_url,
            integrity: "".to_string(),
            size_bytes: rng.gen_range(1000..5000000),
            published_at: Some(prost_types::Timestamp::from(now)),
            dependencies: vec![],
            dev_dependencies: vec![],
            optional_dependencies: vec![],
        };

        let topic = "domain.version.upsert.v1";
        let key = format!("{}:{}:{}", ecosystem, name, version);
        
        let payload = event.encode_to_vec();
        
        info!("Simulating: {} -> {} ({} bytes)", key, topic, payload.len());
        
        if let Err(e) = producer.publish_raw(topic, &key, &payload).await {
            error!("Failed to publish simulated event: {}", e);
        }
        
        tokio::time::sleep(Duration::from_millis(rng.gen_range(2000..5000))).await;
    }
}

fn build_simulated_tarball_url(ecosystem: &str, name: &str, version: &str) -> String {
    match ecosystem.to_ascii_lowercase().as_str() {
        "npm" => format!("https://registry.npmjs.org/{}/-/{}-{}.tgz", name, name, version),
        "cargo" | "crates" | "crates.io" => {
            format!("https://crates.io/api/v1/crates/{}/{}/download", name, version)
        }
        "pypi" | "py_pi" => format!("https://pypi.org/project/{}/{}/", name, version),
        _ => "".to_string(),
    }
}

/// Run seed mode - fetch specific packages and exit
async fn run_seed_mode(cli: &Cli, pool: sqlx::PgPool) -> Result<()> {
    info!("Running in SEED mode...");
    
    let seed_config = SeedConfig {
        pypi_packages: cli.seed_pypi.split(',').map(|s| s.trim().to_string()).collect(),
        cargo_crates: cli.seed_cargo.split(',').map(|s| s.trim().to_string()).collect(),
    };
    
    let runner = SeedRunner::new(pool)?;
    
    match cli.registry {
        Registry::Pypi => {
            for pkg in &seed_config.pypi_packages {
                if let Err(e) = runner.run(&SeedConfig {
                    pypi_packages: vec![pkg.clone()],
                    cargo_crates: vec![],
                }).await {
                    error!(package = %pkg, error = %e, "Failed to seed PyPI package");
                }
            }
        }
        Registry::Cargo => {
            for crate_name in &seed_config.cargo_crates {
                if let Err(e) = runner.run(&SeedConfig {
                    pypi_packages: vec![],
                    cargo_crates: vec![crate_name.clone()],
                }).await {
                    error!(crate_name = %crate_name, error = %e, "Failed to seed Cargo crate");
                }
            }
        }
        Registry::All | Registry::Npm => {
            runner.run(&seed_config).await?;
        }
    }
    
    info!("Seed mode complete! Events written to outbox.");
    info!("Run the OutboxPublisher to push events to Kafka, or check directly in the database.");
    
    Ok(())
}

/// Run publish mode - only run the outbox publisher to push events to Kafka
async fn run_publish_mode(config: AppConfig, pool: sqlx::PgPool) -> Result<()> {
    use emit::{OutboxPublisher, OutboxPublisherConfig};
    
    info!("Running in PUBLISH mode - pushing outbox events to Kafka...");
    
    // Check outbox count first
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM ingestion_outbox WHERE status = 'pending'")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));
    
    info!("Pending events in outbox: {}", count.0);
    
    if count.0 == 0 {
        info!("No pending events to publish!");
        return Ok(());
    }
    
    let producer = producer::EventProducer::new(&config.kafka.brokers, "domain.package.events.v1")?;
    
    let publisher = OutboxPublisher::new(
        pool,
        producer.inner_producer().clone(),
        OutboxPublisherConfig {
            batch_size: 100,
            poll_interval: std::time::Duration::from_millis(500),
            max_attempts: 10,
            lock_timeout: std::time::Duration::from_secs(300),
            cleanup_stuck_locks: true,
        },
        "outbox-publisher-cli",
    );
    
    // Run until all events are published or user cancels
    info!("Starting outbox publisher... Press Ctrl+C to stop.");
    
    publisher.run().await
}

/// Run live mode - poll registries continuously
async fn run_live_mode(cli: &Cli, config: AppConfig, pool: sqlx::PgPool) -> Result<()> {
    let checkpoint_store = Arc::new(PostgresCheckpointStore::new(pool.clone()));
    let producer = Arc::new(producer::EventProducer::new(&config.kafka.brokers, &config.kafka.topic)?);
    
    // Initialize Outbox Publisher (publishes events from outbox to Kafka)
    let publisher_pool = pool.clone();
    let publisher_producer = producer.inner_producer().clone();
    
    info!("Spawning Outbox Publisher...");
    tokio::spawn(async move {
        use emit::OutboxPublisher;
        
        loop {
            let publisher = OutboxPublisher::new(
                publisher_pool.clone(),
                publisher_producer.clone(),
                emit::OutboxPublisherConfig {
                    batch_size: 100,
                    poll_interval: Duration::from_secs(1),
                    max_attempts: 10,
                    lock_timeout: Duration::from_secs(300),
                    cleanup_stuck_locks: true,
                },
                "outbox-publisher-1",
            );
            
            if let Err(e) = publisher.run().await {
                error!("Outbox Publisher crashed: {}. Restarting in 5s...", e);
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    });
    
    // Initialize Proxy Rotator
    let rotator = Arc::new(http::ProxyRotator::new(config.crawler.proxy_urls.clone(), &config.crawler)?);

    // Start NPM if enabled
    let npm_enabled = matches!(cli.registry, Registry::Npm | Registry::All) && config.registries.npm_enabled;
    if npm_enabled {
        spawn_npm_ingestion(
            checkpoint_store.clone(),
            producer.clone(),
            pool.clone(),
            rotator.clone(),
            &config.kafka.brokers,
        );
    }

    // Start PyPI if enabled
    let pypi_enabled = matches!(cli.registry, Registry::Pypi | Registry::All) && config.registries.pypi_enabled;
    if pypi_enabled {
        spawn_pypi_ingestion(
            checkpoint_store.clone(),
            producer.clone(),
            pool.clone(),
            &config.kafka.brokers,
        );
    }

    // Start Cargo if enabled
    let cargo_enabled = matches!(cli.registry, Registry::Cargo | Registry::All) && config.registries.cargo_enabled;
    if cargo_enabled {
        spawn_cargo_ingestion(pool.clone());
    }

    info!("Ingestion Service Initialized. Tasks running.");
    
    loop {
        tokio::time::sleep(Duration::from_secs(3600)).await;
    }
}

fn spawn_npm_ingestion(
    checkpoint_store: Arc<PostgresCheckpointStore>,
    producer: Arc<producer::EventProducer>,
    pool: sqlx::PgPool,
    rotator: Arc<http::ProxyRotator>,
    brokers: &str,
) {
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

    let worker_pool = pool.clone();
    let worker_rotator = rotator.clone();
    let brokers = brokers.to_string();
    
    info!("Spawning NPM Worker...");
    tokio::spawn(async move {
        loop {
            match EventConsumer::new(&brokers, "ingestion-npm-worker-v1", "raw.npm.changes.v1") {
                Ok(consumer) => {
                    let fetcher = NpmFetcher::new(worker_rotator.clone());
                    let state_store = NpmStateStore::new(worker_pool.clone());
                    let worker = NpmWorker::new(consumer, fetcher, state_store, worker_pool.clone());
                    
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

fn spawn_pypi_ingestion(
    checkpoint_store: Arc<PostgresCheckpointStore>,
    producer: Arc<producer::EventProducer>,
    pool: sqlx::PgPool,
    brokers: &str,
) {
    use registries::pypi::{PypiWatcher, PypiWorker, PypiFetcher, PypiStateStore};
    
    let watcher_store = checkpoint_store.clone();
    let watcher_producer = producer.clone();
    
    info!("Spawning PyPI Watcher...");
    tokio::spawn(async move {
        loop {
            match PypiWatcher::new(watcher_store.clone(), watcher_producer.clone(), "raw.pypi.journal.v1".to_string()) {
                Ok(watcher) => {
                    if let Err(e) = watcher.run().await {
                        error!("PyPI Watcher crashed: {}. Restarting in 5s...", e);
                    }
                }
                Err(e) => {
                    error!("Failed to initialize PyPI Watcher: {}. Retrying in 5s...", e);
                }
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });

    let worker_pool = pool.clone();
    let brokers = brokers.to_string();
    
    info!("Spawning PyPI Worker...");
    tokio::spawn(async move {
        loop {
            match EventConsumer::new(&brokers, "ingestion-pypi-worker-v1", "raw.pypi.journal.v1") {
                Ok(consumer) => {
                    // Use our custom RateLimiter from http module
                    let rate_limiter = Arc::new(http::rate_limit::RateLimiter::new(
                        "pypi".to_string(),
                        10, // 10 requests per second
                        20, // burst of 20
                    ));
                    
                    match PypiFetcher::new(rate_limiter) {
                        Ok(fetcher) => {
                            let state_store = PypiStateStore::new(worker_pool.clone());
                            let worker = PypiWorker::new(consumer, fetcher, state_store, worker_pool.clone());
                            
                            if let Err(e) = worker.run().await {
                                error!("PyPI Worker crashed: {}. Restarting in 5s...", e);
                            }
                        }
                        Err(e) => {
                            error!("Failed to create PyPI Fetcher: {}. Retrying in 5s...", e);
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to create PyPI Worker Consumer: {}. Retrying in 5s...", e);
                }
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}

fn spawn_cargo_ingestion(_pool: sqlx::PgPool) {
    use registries::crates::CargoWatcher;
    use rdkafka::producer::FutureProducer;
    use rdkafka::ClientConfig;
    
    info!("Spawning Cargo Watcher (seed crates only)...");
    
    // For now, Cargo uses a watch list rather than a global firehose
    // The watcher polls specific crates and emits changes
    tokio::spawn(async move {
        loop {
            // Create a simple producer for the watcher
            let producer: Result<FutureProducer, _> = ClientConfig::new()
                .set("bootstrap.servers", std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:19092".to_string()))
                .set("message.timeout.ms", "5000")
                .create();
                
            match producer {
                Ok(prod) => {
                    match CargoWatcher::new(prod) {
                        Ok(watcher) => {
                            // Add default crates to watch
                            watcher.watch_crates(&["tokio", "serde", "axum", "anyhow", "thiserror"]).await;
                            
                            if let Err(e) = watcher.run().await {
                                error!("Cargo Watcher crashed: {}. Restarting in 5s...", e);
                            }
                        }
                        Err(e) => {
                            error!("Failed to initialize Cargo Watcher: {}. Retrying in 5s...", e);
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to create Kafka producer for Cargo: {:?}. Retrying in 5s...", e);
                }
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
    
    // Note: Cargo Worker would consume from raw.cargo.index.v1 and emit domain events
    // For seed mode, we bypass this and write directly to outbox
}
