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
#[allow(dead_code)]
pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// Readiness check endpoint (dependency checks)
#[allow(dead_code)]
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

/// Memgraph memory statistics response
#[derive(Serialize)]
pub struct MemgraphMemoryResponse {
    pub memory_used_bytes: u64,
    pub peak_memory_bytes: u64,
    pub memory_limit_bytes: u64,
    pub usage_percent: f64,
    pub under_pressure: bool,
    pub critical: bool,
    pub status: &'static str,
}

/// Memgraph memory monitoring endpoint for OOM prevention
#[allow(dead_code)]
pub async fn memgraph_memory_handler(
    State(state): State<AppState>,
) -> Result<Json<MemgraphMemoryResponse>, axum::http::StatusCode> {
    match state.graph.get_memory_stats().await {
        Ok(stats) => {
            let status = if stats.critical {
                "critical"
            } else if stats.under_pressure {
                "warning"
            } else {
                "healthy"
            };

            Ok(Json(MemgraphMemoryResponse {
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
