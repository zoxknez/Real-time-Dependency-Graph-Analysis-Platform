//! API Gateway - GraphQL endpoint for dependency graph queries
//!
//! Responsibilities:
//! - GraphQL API with reverseDependents, dependencyPath, impactRadius
//! - Real-time subscriptions for new versions
//! - REST endpoints for health checks & metrics
//! - JWT-based authentication with key rotation support
//! - Rate limiting and query complexity limits
//! - Security headers and audit logging
//! - Production-safe configuration with fail-fast

mod cache;
mod config;
mod embeddings;
mod gql;
mod graph;
mod handlers;
mod kafka;
mod metrics;
mod middleware;
mod proto_gen;
mod services;

use anyhow::Result;
use async_graphql::http::GraphiQLSource;
use async_graphql_axum::{GraphQLProtocol, GraphQLRequest, GraphQLResponse, GraphQLWebSocket};
use axum::http::{HeaderValue, Method};
use axum::{
    Router,
    extract::{State, WebSocketUpgrade},
    response::{Html, IntoResponse, Json},
    routing::get,
};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Config;
use crate::handlers::{AppState, CombinedState};
use crate::handlers::{evaluate_scenario_handler, live_token_handler, security_agent_stream};
use crate::middleware::audit::init_audit_persistence;
use crate::middleware::auth::{JwtConfig, optional_jwt_middleware};
#[allow(unused_imports)]
use crate::middleware::create_rate_limiter;
use crate::middleware::security_headers::SecurityHeadersLayer;
use crate::middleware::{
    DistributedRateLimiter, DistributedRateLimiterConfig, distributed_rate_limit_middleware,
};
use axum::{Extension, middleware as axum_middleware};
use models::tenant::TenantContext;
use sqlx::postgres::PgPoolOptions;

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

    // Load configuration (validates in production mode!)
    let config = Config::from_env();
    info!(
        host = %config.server.host,
        port = config.server.port,
        environment = ?config.environment,
        memgraph_uri = %config.memgraph.uri,
        rate_limit_rpm = config.guardrails.rate_limit_rpm,
        max_depth = config.guardrails.max_depth,
        max_complexity = config.guardrails.max_complexity,
        "Configuration loaded"
    );

    // Build JWT config (validates in production mode!)
    let jwt_config = Arc::new(JwtConfig::from_env());

    // Initialize PostgreSQL pool for audit logging
    let pg_pool = PgPoolOptions::new()
        .max_connections(config.postgres.pool_size)
        .acquire_timeout(Duration::from_secs(config.postgres.connect_timeout_secs))
        .connect(&config.postgres.url)
        .await;

    match pg_pool {
        Ok(pool) => {
            info!("✓ PostgreSQL pool initialized for audit logging");
            init_audit_persistence(pool);
        }
        Err(e) => {
            tracing::warn!(
                "⚠️  PostgreSQL connection failed: {} - audit persistence disabled",
                e
            );
        }
    }

    // Build GraphQL schema (returns channels and clients)
    let (schema, channels, graph, cache) = gql::build_schema(&config).await?;

    // Run graph migrations (indexes & backfill) in background
    let migration_client = graph.clone();
    tokio::spawn(async move {
        crate::graph::migrations::run_migrations(&migration_client).await;
    });

    // Wrap cache in Arc for sharing across components
    let cache_arc = cache.map(Arc::new);

    // Create app state for health checks
    let app_state = AppState {
        graph: graph.clone(),
        cache: cache_arc.clone(),
    };

    // Start Kafka consumer for subscriptions in background
    let kafka_config = config.kafka.clone();
    let kafka_channels = channels.clone();
    tokio::spawn(async move {
        if let Err(e) = kafka::start_event_consumer(&kafka_config, kafka_channels).await {
            tracing::error!("Kafka consumer error: {}", e);
        }
    });

    // Build CORS layer from configuration
    let cors = build_cors_layer(&config);

    // Security headers middleware
    let security_headers = SecurityHeadersLayer::default_headers();

    // Initialize distributed rate limiter with Redis (if available)
    let rate_limiter = if cache_arc.is_some() {
        // Get a dedicated Redis connection for rate limiting
        match redis::Client::open(config.redis.url.as_str()) {
            Ok(client) => match client.get_multiplexed_async_connection().await {
                Ok(conn) => {
                    let limiter = DistributedRateLimiter::new(
                        conn,
                        DistributedRateLimiterConfig {
                            key_prefix: "api:ratelimit".to_string(),
                            window_size_secs: 60,
                            allow_on_redis_failure: true,
                            fallback_limit: config.guardrails.rate_limit_rpm / 2,
                        },
                    );
                    info!("✓ Distributed rate limiter initialized (Redis-backed)");
                    Arc::new(limiter)
                }
                Err(e) => {
                    tracing::warn!(
                        "Redis connection for rate limiter failed: {}, using local fallback",
                        e
                    );
                    Arc::new(DistributedRateLimiter::local_only(
                        DistributedRateLimiterConfig::default(),
                    ))
                }
            },
            Err(e) => {
                tracing::warn!("Redis client creation failed: {}, using local fallback", e);
                Arc::new(DistributedRateLimiter::local_only(
                    DistributedRateLimiterConfig::default(),
                ))
            }
        }
    } else {
        info!("Redis not configured, using local rate limiter");
        Arc::new(DistributedRateLimiter::local_only(
            DistributedRateLimiterConfig::default(),
        ))
    };

    // Clone schema for WebSocket subscription service
    let ws_schema = schema.clone();

    // Create combined state
    let combined_state = CombinedState {
        schema,
        app_state,
        rate_limit_rpm: config.guardrails.rate_limit_rpm,
        jwt_state: jwt_config.clone(),
        query_timeout: config.query_timeout(),
        gemini_api_key: config.gemini.api_key.clone(),
        max_results: config.guardrails.max_results,
    };

    // Build router with security layers
    let rate_limiter_for_middleware = rate_limiter.clone();
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/ready", get(ready_handler))
        .route("/memgraph/memory", get(memgraph_memory_handler))
        .route("/metrics", get(metrics::metrics_handler))
        .route("/graphql", get(graphql_playground).post(graphql_handler))
        .route("/graphql/ws", get(graphql_ws_handler))
        .route("/agent/stream", axum::routing::post(security_agent_stream))
        .route("/live/token", get(live_token_handler))
        .route("/analysis/scenarios/evaluate", axum::routing::post(evaluate_scenario_handler))
        .layer(axum::Extension(metrics_handle))
        .layer(axum::Extension(ws_schema))
        .layer(axum_middleware::from_fn_with_state(jwt_config, optional_jwt_middleware))
        // Distributed rate limiting (Redis-backed when available)
        .layer(axum_middleware::from_fn(move |req, next| {
            let limiter = rate_limiter_for_middleware.clone();
            distributed_rate_limit_middleware(limiter, req, next)
        }))
        // Request body size limit
        .layer(RequestBodyLimitLayer::new(config.server.max_body_size))
        // Request timeout (408 Request Timeout on exceeded)
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            config.request_timeout(),
        ))
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

/// Build CORS layer from configuration
fn build_cors_layer(config: &Config) -> CorsLayer {
    let cors_config = &config.cors;

    // Parse origins into HeaderValues
    let origins: Vec<HeaderValue> = cors_config
        .allowed_origins
        .iter()
        .filter_map(|o| o.parse::<HeaderValue>().ok())
        .collect();

    if origins.is_empty() {
        tracing::warn!("⚠️  No valid CORS origins configured, using permissive defaults");
        return CorsLayer::permissive();
    }

    info!(
        origins = ?cors_config.allowed_origins,
        credentials = cors_config.allow_credentials,
        "CORS configured"
    );

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_credentials(cors_config.allow_credentials)
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            axum::http::header::ACCEPT,
            axum::http::header::ORIGIN,
        ])
        .max_age(Duration::from_secs(cors_config.max_age_secs))
}

/// Health check endpoint
async fn health_handler() -> Json<handlers::HealthResponse> {
    Json(handlers::HealthResponse {
        status: "healthy",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// Readiness check endpoint
async fn ready_handler(State(state): State<CombinedState>) -> Json<handlers::ReadinessResponse> {
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

/// Memgraph memory monitoring endpoint
async fn memgraph_memory_handler(
    State(state): State<CombinedState>,
) -> Result<Json<handlers::MemgraphMemoryResponse>, axum::http::StatusCode> {
    match state.app_state.graph.get_memory_stats().await {
        Ok(stats) => {
            let status = if stats.critical {
                "critical"
            } else if stats.under_pressure {
                "warning"
            } else {
                "healthy"
            };

            Ok(Json(handlers::MemgraphMemoryResponse {
                memory_used_bytes: stats.memory_used_bytes,
                peak_memory_bytes: stats.peak_memory_bytes,
                memory_limit_bytes: stats.memory_limit_bytes,
                usage_percent: stats.usage_percent,
                under_pressure: stats.under_pressure,
                critical: stats.critical,
                status,
            }))
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to get Memgraph memory stats");
            Err(axum::http::StatusCode::SERVICE_UNAVAILABLE)
        }
    }
}

/// GraphQL handler for queries and mutations with timeout
async fn graphql_handler(
    State(state): State<CombinedState>,
    Extension(tenant_context): Extension<Option<TenantContext>>,
    req: GraphQLRequest,
) -> Result<GraphQLResponse, axum::http::StatusCode> {
    use tokio::time::timeout;

    let result = timeout(state.query_timeout, async {
        let mut request = req.into_inner();
        request = request.data(tenant_context);
        state.schema.execute(request).await
    })
    .await;

    match result {
        Ok(response) => Ok(response.into()),
        Err(_) => {
            tracing::warn!("GraphQL query timed out after {:?}", state.query_timeout);
            Err(axum::http::StatusCode::GATEWAY_TIMEOUT)
        }
    }
}

/// GraphQL Playground UI (GraphiQL)
async fn graphql_playground() -> impl IntoResponse {
    Html(
        GraphiQLSource::build()
            .endpoint("/graphql")
            .subscription_endpoint("/graphql/ws")
            .finish(),
    )
}

/// GraphQL WebSocket handler for subscriptions
async fn graphql_ws_handler(
    ws: WebSocketUpgrade,
    protocol: GraphQLProtocol,
    schema: axum::Extension<gql::ApiSchema>,
) -> impl IntoResponse {
    ws.protocols(["graphql-transport-ws", "graphql-ws"])
        .on_upgrade(move |socket| GraphQLWebSocket::new(socket, schema.0.clone(), protocol).serve())
}
