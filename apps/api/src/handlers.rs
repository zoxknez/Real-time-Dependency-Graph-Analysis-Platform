//! HTTP handlers

use axum::response::sse::{Event, KeepAlive, Sse};
use axum::{Json, extract::State};
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use crate::cache::CacheClient;
use crate::gql::ApiSchema;
use crate::graph::GraphClient;
use crate::middleware::auth::JwtState;
use crate::services::gemini_agent::{AgentStep, VulnerabilityFinding};
use crate::services::{AgentAction, GeminiSecurityAgent, execute_security_agent_tool};

/// Combined app state shared by router handlers.
#[derive(Clone)]
pub struct CombinedState {
    pub schema: ApiSchema,
    pub app_state: AppState,
    #[allow(dead_code)]
    pub rate_limit_rpm: u32,
    #[allow(dead_code)]
    pub jwt_state: JwtState,
    pub query_timeout: Duration,
    pub gemini_api_key: String,
    pub max_results: i32,
}

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
pub async fn readiness_check(State(state): State<AppState>) -> Json<ReadinessResponse> {
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

// ═════════════════════════════════════════════════════════════════════════════=
// Live API Ephemeral Token (demo helper)
// ═════════════════════════════════════════════════════════════════════════════=

#[derive(Serialize)]
pub struct LiveTokenResponse {
    pub token: String,
    pub note: String,
}

/// Returns a pre-generated ephemeral token for Gemini Live API demos.
/// Set GEMINI_LIVE_EPHEMERAL_TOKEN in the environment.
pub async fn live_token_handler() -> Result<Json<LiveTokenResponse>, axum::http::StatusCode> {
    match std::env::var("GEMINI_LIVE_EPHEMERAL_TOKEN") {
        Ok(token) if !token.is_empty() => Ok(Json(LiveTokenResponse {
            token,
            note: "Ephemeral token is short-lived and for Live API only".to_string(),
        })),
        _ => Err(axum::http::StatusCode::NOT_IMPLEMENTED),
    }
}

// ═════════════════════════════════════════════════════════════════════════════=
// Security Agent Streaming (SSE)
// ═════════════════════════════════════════════════════════════════════════════=

#[derive(Debug, Deserialize)]
pub struct SecurityAgentStreamRequest {
    pub task: String,
    pub max_steps: Option<i32>,
    pub target_packages: Option<Vec<String>>,
    pub analysis_depth: Option<i32>,
}

#[derive(Debug, Serialize)]
struct SecurityAgentStreamStep {
    step_number: usize,
    action_type: &'static str,
    tool_name: Option<String>,
    tool_args: Option<String>,
    tool_result: Option<String>,
    text_response: Option<String>,
    thought_summary: Option<String>,
}

#[derive(Debug, Serialize)]
struct SecurityAgentStreamFinal {
    task: String,
    steps: Vec<SecurityAgentStreamStep>,
    final_response: String,
    total_function_calls: usize,
    packages_analyzed: Vec<String>,
    vulnerabilities_found: Vec<VulnerabilityFinding>,
    recommendations: Vec<String>,
    structured_report_json: Option<String>,
    success: bool,
    execution_time_ms: i64,
}

fn map_step(step: AgentStep) -> SecurityAgentStreamStep {
    match step.action {
        AgentAction::FunctionCall { name, args, result } => SecurityAgentStreamStep {
            step_number: step.step_number,
            action_type: "FUNCTION_CALL",
            tool_name: Some(name),
            tool_args: Some(serde_json::to_string(&args).unwrap_or_default()),
            tool_result: result.map(|r| serde_json::to_string(&r).unwrap_or_default()),
            text_response: None,
            thought_summary: step.thought_summary,
        },
        AgentAction::TextResponse { content } => SecurityAgentStreamStep {
            step_number: step.step_number,
            action_type: "TEXT_RESPONSE",
            tool_name: None,
            tool_args: None,
            tool_result: None,
            text_response: Some(content),
            thought_summary: step.thought_summary,
        },
        AgentAction::Error { message } => SecurityAgentStreamStep {
            step_number: step.step_number,
            action_type: "ERROR",
            tool_name: None,
            tool_args: None,
            tool_result: None,
            text_response: Some(message),
            thought_summary: step.thought_summary,
        },
    }
}

/// Stream security agent steps over SSE for real-time UI updates
pub async fn security_agent_stream(
    State(state): State<CombinedState>,
    Json(payload): Json<SecurityAgentStreamRequest>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let (tx, rx) = mpsc::channel::<Result<Event, Infallible>>(32);

    // Build task prompt with optional constraints
    let mut task_prompt = payload.task.clone();
    if let Some(targets) = &payload.target_packages {
        if !targets.is_empty() {
            task_prompt.push_str("\n\nTarget packages: ");
            task_prompt.push_str(&targets.join(", "));
            task_prompt.push('.');
        }
    }
    if let Some(depth) = payload.analysis_depth {
        task_prompt.push_str(&format!("\n\nAnalysis depth: {}.", depth));
    }

    let api_key = state.gemini_api_key.clone();
    let graph = state.app_state.graph.clone();
    let max_results = state.max_results;

    tokio::spawn(async move {
        let start = std::time::Instant::now();
        if api_key.is_empty() {
            let _ = tx
                .send(Ok(Event::default()
                    .event("error")
                    .data("Gemini API key missing")))
                .await;
            return;
        }

        let agent = GeminiSecurityAgent::new(api_key)
            .with_max_steps(payload.max_steps.unwrap_or(10) as usize);

        let tool_executor = move |name: String, args: serde_json::Value| {
            let graph = graph.clone();
            async move {
                execute_security_agent_tool(
                    graph,
                    None,
                    "public".to_string(),
                    max_results,
                    name,
                    args,
                )
                .await
            }
        };

        let step_sender = tx.clone();
        let result = agent
            .execute_with_callback(&task_prompt, tool_executor, move |step| {
                let mapped = map_step(step);
                let event = Event::default().event("step").json_data(&mapped);
                if let Ok(event) = event {
                    let _ = step_sender.try_send(Ok(event));
                }
            })
            .await;

        match result {
            Ok(res) => {
                let steps = res.steps.clone().into_iter().map(map_step).collect();
                let execution_time_ms = start.elapsed().as_millis() as i64;
                let final_payload = SecurityAgentStreamFinal {
                    task: res.task,
                    steps,
                    final_response: res.final_response,
                    total_function_calls: res.total_function_calls,
                    packages_analyzed: res.packages_analyzed,
                    vulnerabilities_found: res.vulnerabilities_found,
                    recommendations: res.recommendations,
                    structured_report_json: res
                        .structured_report
                        .map(|r| serde_json::to_string_pretty(&r).unwrap_or_default()),
                    success: true,
                    execution_time_ms,
                };
                let _ = tx
                    .send(Ok(Event::default()
                        .event("final")
                        .json_data(&final_payload)
                        .unwrap()))
                    .await;
            }
            Err(e) => {
                let _ = tx
                    .send(Ok(Event::default().event("error").data(e.to_string())))
                    .await;
            }
        }
    });

    Sse::new(ReceiverStream::new(rx))
        .keep_alive(KeepAlive::new().interval(std::time::Duration::from_secs(15)))
}

// ═══════════════════════════════════════════════════════════════
// COUNTERFACTUAL SCENARIO EVALUATION ENDPOINT (WMCP-7B)
// ═══════════════════════════════════════════════════════════════

use analysis::api_snapshot::SnapshotRepository;
use analysis::counterfactual::{CounterfactualScenarioEngine, ScenarioEngineError, ScenarioPatch};
use axum::http::StatusCode;

#[derive(Debug, Deserialize)]
pub struct EvaluateScenarioRequest {
    pub target_package_id: String,
    pub base_version: Option<String>,
    pub snapshot_id: Option<String>,
    pub patch: ScenarioPatch,
}

#[derive(Debug, Serialize)]
pub struct BreakingChangeDto {
    pub change_type: String,
    pub symbol_path: String,
    pub description: String,
    pub severity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub migration_hint: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct EvaluateScenarioResponse {
    pub scenario_id: Option<String>,
    pub baseline_surface_hash: String,
    pub candidate_surface_hash: String,
    pub changed: bool,
    pub breaking_changes: Vec<BreakingChangeDto>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
}

pub async fn evaluate_scenario_handler(
    Json(req): Json<EvaluateScenarioRequest>,
) -> Result<Json<EvaluateScenarioResponse>, (StatusCode, Json<ErrorResponse>)> {
    let repo = SnapshotRepository::open_from_env().map_err(|e| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                code: "UNAVAILABLE".to_string(),
                message: format!("Snapshot repository unavailable: {}", e),
            }),
        )
    })?;

    // Determine target snapshot ID strictly without latest guessing
    let resolved_snapshot_id = if let Some(ref snap_id) = req.snapshot_id {
        if snap_id.trim().is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    code: "INVALID_INPUT".to_string(),
                    message: "Explicit snapshot_id cannot be empty".to_string(),
                }),
            ));
        }
        snap_id.clone()
    } else if let Some(ref base_ver) = req.base_version {
        let trimmed_ver = base_ver.trim();
        if trimmed_ver.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    code: "INVALID_INPUT".to_string(),
                    message: "base_version cannot be empty".to_string(),
                }),
            ));
        }
        // Check if base_version directly is a snapshot id in repo
        if repo.get_by_id(trimmed_ver).await.is_ok() {
            trimmed_ver.to_string()
        } else {
            // Check history entries for target_package_id matching version
            let history = repo.list_history(&req.target_package_id).await.map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        code: "INTERNAL_ERROR".to_string(),
                        message: format!("Failed to list snapshot history: {}", e),
                    }),
                )
            })?;

            let matched_entry = history
                .into_iter()
                .find(|entry| entry.revision == trimmed_ver);

            match matched_entry {
                Some(entry) => entry.snapshot_id,
                None => {
                    return Err((
                        StatusCode::NOT_FOUND,
                        Json(ErrorResponse {
                            code: "NOT_FOUND".to_string(),
                            message: format!(
                                "Committed snapshot not found for package '{}' version '{}'",
                                req.target_package_id, trimmed_ver
                            ),
                        }),
                    ));
                }
            }
        }
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                code: "INVALID_INPUT".to_string(),
                message: "Scenario must specify target_package_id and authoritative base_version or snapshot_id".to_string(),
            }),
        ));
    };

    let engine = CounterfactualScenarioEngine::new();
    let result = engine
        .evaluate_committed_snapshot(&repo, &resolved_snapshot_id, &req.patch)
        .await
        .map_err(|e| match e {
            ScenarioEngineError::SnapshotNotCommitted(msg) => (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    code: "NOT_FOUND".to_string(),
                    message: msg,
                }),
            ),
            ScenarioEngineError::InvalidBaselineStatus(status) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(ErrorResponse {
                    code: "INVALID_BASELINE".to_string(),
                    message: format!("Baseline surface has non-complete status: {:?}", status),
                }),
            ),
            ScenarioEngineError::SymbolNotFound(sym) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(ErrorResponse {
                    code: "SYMBOL_NOT_FOUND".to_string(),
                    message: format!("Symbol not found in baseline: {}", sym),
                }),
            ),
            ScenarioEngineError::ConflictingOperations(msg) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(ErrorResponse {
                    code: "CONFLICTING_OPERATIONS".to_string(),
                    message: msg,
                }),
            ),
            ScenarioEngineError::InvalidPatch(msg) => (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    code: "INVALID_PATCH".to_string(),
                    message: msg,
                }),
            ),
            ScenarioEngineError::RepositoryError(msg) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    code: "REPOSITORY_ERROR".to_string(),
                    message: msg,
                }),
            ),
        })?;

    let breaking_changes_dto = result
        .breaking_changes
        .into_iter()
        .map(|bc| BreakingChangeDto {
            change_type: format!("{:?}", bc.change_type),
            symbol_path: bc.symbol_path,
            description: bc.description,
            severity: format!("{:?}", bc.severity),
            old_signature: bc.old_signature,
            new_signature: bc.new_signature,
            migration_hint: bc.migration_hint,
        })
        .collect();

    Ok(Json(EvaluateScenarioResponse {
        scenario_id: result.scenario_id,
        baseline_surface_hash: result.baseline_surface_hash,
        candidate_surface_hash: result.candidate_surface_hash,
        changed: result.changed,
        breaking_changes: breaking_changes_dto,
    }))
}
