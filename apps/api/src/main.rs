//! API Gateway - GraphQL endpoint for dependency graph queries
//!
//! Responsibilities:
//! - GraphQL API with reverseDependents, dependencyPath, impactRadius
//! - Real-time subscriptions for new versions
//! - REST endpoints for health checks & metrics
//! - JWT-based authentication (optional)
//! - Rate limiting and query complexity limits
//! - Security headers and audit logging

mod cache;
mod config;
mod gql;
mod graph;
mod handlers;
mod embeddings;
mod kafka;
mod metrics;
mod middleware;
mod services;

use anyhow::Result;
use async_graphql::http::GraphiQLSource;
use async_graphql_axum::{GraphQLRequest, GraphQLResponse, GraphQLProtocol, GraphQLWebSocket};
use axum::{
    extract::{State, WebSocketUpgrade},
    response::{Html, IntoResponse, Json},
    routing::get,
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use axum::http::HeaderValue;

use crate::config::Config;
use crate::gql::ApiSchema;
use crate::handlers::AppState;
use crate::middleware::security_headers::SecurityHeadersLayer;
#[allow(unused_imports)]
use crate::middleware::create_rate_limiter;
use crate::middleware::auth::{optional_jwt_middleware, JwtConfig, JwtState};
use models::tenant::TenantContext;
use axum::{Extension, middleware as axum_middleware};

/// Combined app state
#[derive(Clone)]
pub struct CombinedState {
    pub schema: ApiSchema,
    pub app_state: AppState,
    pub rate_limit_rpm: u32,
    pub jwt_state: JwtState,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,api=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load environment variables from a local .env file if present.
    // This keeps local development aligned with docs and avoids shell-specific env syntax.
    dotenvy::dotenv().ok();

    info!("🌐 Starting API Gateway");

    // Initialize Prometheus metrics
    let metrics_handle = metrics::init_metrics();
    info!("📊 Prometheus metrics initialized");

    // Load configuration
    let config = Config::from_env();
    info!(
        host = %config.server.host,
        port = config.server.port,
        memgraph_uri = %config.memgraph.uri,
        rate_limit_rpm = config.guardrails.rate_limit_rpm,
        "Configuration loaded"
    );

    let jwt_config = Arc::new(JwtConfig::default());

    // Build GraphQL schema (returns channels and clients)
    let (schema, channels, graph, cache) = gql::build_schema(&config).await?;

    // Run graph migrations (indexes & backfill) in background
    let migration_client = graph.clone();
    tokio::spawn(async move {
        crate::graph::migrations::run_migrations(&migration_client).await;
    });

    // Create app state for health checks
    let app_state = AppState {
        graph: graph.clone(),
        cache: cache.map(Arc::new),
    };

    // Start Kafka consumer for subscriptions in background
    let kafka_config = config.kafka.clone();
    let kafka_channels = channels.clone();
    tokio::spawn(async move {
        if let Err(e) = kafka::start_event_consumer(&kafka_config, kafka_channels).await {
            tracing::error!("Kafka consumer error: {}", e);
        }
    });

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:3000".parse::<HeaderValue>().unwrap())
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::OPTIONS,
        ])
        .allow_credentials(true)
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            axum::http::header::ACCEPT,
            axum::http::header::ORIGIN,
        ]);

    // Security headers middleware
    let security_headers = SecurityHeadersLayer::default_headers();

    // Clone schema for WebSocket subscription service
    let ws_schema = schema.clone();

    // Create combined state
    let combined_state = CombinedState {
        schema,
        app_state,
        rate_limit_rpm: config.guardrails.rate_limit_rpm,
        jwt_state: jwt_config.clone(),
    };

    // Build router with security layers
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/ready", get(ready_handler))
        .route("/metrics", get(metrics::metrics_handler))
        .route("/graphql", get(graphql_playground).post(graphql_handler))
        .route("/graphql/ws", get(graphql_ws_handler))
        .layer(axum::Extension(metrics_handle))
        .layer(axum::Extension(ws_schema))
        .layer(axum_middleware::from_fn_with_state(jwt_config, optional_jwt_middleware))
        .layer(security_headers)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(combined_state);

    // Start server
    let addr: SocketAddr = format!("{}:{}", config.server.host, config.server.port)
        .parse()
        .expect("Invalid server address");
    
    info!(address = %addr, "Starting HTTP server");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// Health check endpoint
async fn health_handler() -> Json<handlers::HealthResponse> {
    Json(handlers::HealthResponse {
        status: "healthy",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// Readiness check endpoint
async fn ready_handler(
    State(state): State<CombinedState>,
) -> Json<handlers::ReadinessResponse> {
    let memgraph_ok = state.app_state.graph.health_check().await;
    
    let redis_ok = match &state.app_state.cache {
        Some(cache) => cache.health_check().await,
        None => true,
    };

    let status = if memgraph_ok && redis_ok {
        "ready"
    } else {
        "degraded"
    };

    Json(handlers::ReadinessResponse {
        status,
        memgraph: memgraph_ok,
        redis: redis_ok,
    })
}

/// GraphQL handler for queries and mutations
async fn graphql_handler(
    State(state): State<CombinedState>,
    Extension(tenant_context): Extension<Option<TenantContext>>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    let mut request = req.into_inner();
    if let Some(ctx) = tenant_context {
        request = request.data(ctx);
    }
    state.schema.execute(request).await.into()
}

/// GraphQL Playground UI (GraphiQL)
async fn graphql_playground() -> impl IntoResponse {
    Html(GraphiQLSource::build()
        .endpoint("/graphql")
        .subscription_endpoint("/graphql/ws")
        .finish())
}

/// GraphQL WebSocket handler for subscriptions
async fn graphql_ws_handler(
    ws: WebSocketUpgrade,
    protocol: GraphQLProtocol,
    schema: axum::Extension<gql::ApiSchema>,
) -> impl IntoResponse {
    ws.protocols(["graphql-transport-ws", "graphql-ws"])
        .on_upgrade(move |socket| {
            GraphQLWebSocket::new(socket, schema.0.clone(), protocol)
                .serve()
        })
}

