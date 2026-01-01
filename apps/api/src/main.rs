//! API Gateway - GraphQL/REST endpoint for the platform
//!
//! Responsibilities:
//! - GraphQL API for querying dependency graphs
//! - REST endpoints for health checks & metrics
//! - JWT-based authentication
//! - Rate limiting per API key

mod graphql;
mod handlers;
mod auth;
mod config;

use anyhow::Result;
use axum::{
    routing::get,
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("🌐 Starting API Gateway");
    
    // Build GraphQL schema
    let schema = graphql::build_schema().await?;
    
    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    
    // Build router
    let app = Router::new()
        .route("/health", get(handlers::health_check))
        .route("/graphql", get(graphql::graphql_playground).post(graphql::graphql_handler))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(schema);
    
    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!(address = %addr, "Starting HTTP server");
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    
    Ok(())
}
