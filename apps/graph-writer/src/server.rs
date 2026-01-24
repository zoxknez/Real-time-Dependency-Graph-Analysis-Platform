//! HTTP server for metrics and health endpoints

use anyhow::Result;
use axum::{routing::get, Router};
use std::net::SocketAddr;
use tokio::sync::watch;
use tracing::{info, instrument};

use crate::config::HttpConfig;
use crate::graph::MemgraphClient;

/// Start the HTTP server for metrics and health
#[instrument(skip(config, memgraph, shutdown_rx), fields(host = %config.host, port = %config.port))]
pub async fn run_server(
    config: HttpConfig,
    memgraph: MemgraphClient,
    mut shutdown_rx: watch::Receiver<bool>,
) -> Result<()> {
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/health/live", get(liveness_handler))
        .route("/health/ready", get({
            let memgraph = memgraph.clone();
            move || readiness_handler(memgraph.clone())
        }))
        .route("/metrics", get(metrics_handler));

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .map_err(|e| anyhow::anyhow!("Invalid server address '{}:{}': {}", config.host, config.port, e))?;

    info!("Starting HTTP server on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.changed().await;
        })
        .await?;

    info!("HTTP server stopped");
    Ok(())
}

/// Basic health check (always returns OK)
async fn health_handler() -> &'static str {
    "OK"
}

/// Liveness probe - returns OK if process is alive
async fn liveness_handler() -> &'static str {
    "OK"
}

/// Readiness probe - checks Memgraph connection
async fn readiness_handler(memgraph: MemgraphClient) -> Result<&'static str, (axum::http::StatusCode, String)> {
    match memgraph.health_check().await {
        Ok(true) => Ok("OK"),
        Ok(false) => Err((
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            "Memgraph not ready".to_string(),
        )),
        Err(e) => Err((
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            format!("Memgraph error: {}", e),
        )),
    }
}

/// Prometheus metrics endpoint
async fn metrics_handler() -> String {
    let _handle = metrics_exporter_prometheus::PrometheusBuilder::new()
        .build_recorder();
    
    // For now, return basic metrics
    // In production, we'd use a shared recorder
    format!(
        r#"# HELP graph_writer_up Indicates if the graph-writer service is up
# TYPE graph_writer_up gauge
graph_writer_up 1
"#
    )
}
