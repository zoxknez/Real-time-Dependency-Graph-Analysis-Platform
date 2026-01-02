//! HTTP handlers

use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;

use crate::cache::CacheClient;
use crate::graph::GraphClient;

/// Application state for health checks
#[derive(Clone)]
pub struct AppState {
    pub graph: GraphClient,
    pub cache: Option<Arc<CacheClient>>,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
}

#[derive(Serialize)]
pub struct ReadinessResponse {
    pub status: &'static str,
    pub memgraph: bool,
    pub redis: bool,
}

/// Health check endpoint (liveness probe)
pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// Readiness check endpoint (dependency checks)
pub async fn readiness_check(
    State(state): State<AppState>,
) -> Json<ReadinessResponse> {
    let memgraph_ok = state.graph.health_check().await;
    
    let redis_ok = match &state.cache {
        Some(cache) => cache.health_check().await,
        None => true, // Redis disabled, consider ready
    };

    let status = if memgraph_ok && redis_ok {
        "ready"
    } else {
        "degraded"
    };

    Json(ReadinessResponse {
        status,
        memgraph: memgraph_ok,
        redis: redis_ok,
    })
}
