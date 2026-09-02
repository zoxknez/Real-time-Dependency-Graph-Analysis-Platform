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
    pub gemini_model: String,
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
    #[serde(rename = "buildCommit")]
    pub build_commit: Option<String>,
}

#[derive(Serialize)]
pub struct ReadinessResponse {
    pub status: &'static str,
    pub memgraph: bool,
    pub redis: bool,
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
            .with_model(&state.gemini_model)
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
// COUNTERFACTUAL SCENARIO EVALUATION ENDPOINT (WMCP-7B / WMCP-7B-R1)
// ═══════════════════════════════════════════════════════════════

use analysis::api_snapshot::SnapshotRepository;
use analysis::counterfactual::{CounterfactualScenarioEngine, ScenarioEngineError, ScenarioPatch};
use analysis::public_api::PublicApiScope;
use axum::http::StatusCode;

/// Maximum number of breaking findings returned in a single scenario evaluation response
pub const MAX_BREAKING_CHANGES_RETURNED: usize = 100;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct EvaluateScenarioRequest {
    pub target_package_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_id: Option<String>,
    pub patch: ScenarioPatch,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EvaluateScenarioResponse {
    pub scenario_id: Option<String>,
    pub baseline_surface_hash: String,
    pub candidate_surface_hash: String,
    pub changed: bool,
    pub total_breaking_changes: usize,
    pub returned_breaking_changes: usize,
    pub breaking_changes_truncated: bool,
    pub breaking_changes: Vec<BreakingChangeDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
}

/// Core evaluation logic executing strict coordinate binding and response bounding
pub async fn evaluate_scenario_core(
    repo: &SnapshotRepository,
    req: EvaluateScenarioRequest,
) -> Result<EvaluateScenarioResponse, (StatusCode, ErrorResponse)> {
    if req.target_package_id.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            ErrorResponse {
                code: "INVALID_INPUT".to_string(),
                message: "target_package_id cannot be empty".to_string(),
            },
        ));
    }

    // Determine target snapshot ID strictly without latest guessing
    let resolved_snapshot_id = if let Some(ref snap_id) = req.snapshot_id {
        let trimmed_snap_id = snap_id.trim();
        if trimmed_snap_id.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                ErrorResponse {
                    code: "INVALID_INPUT".to_string(),
                    message: "Explicit snapshot_id cannot be empty".to_string(),
                },
            ));
        }

        // 1. Load envelope from repo
        let envelope = repo.get_by_id(trimmed_snap_id).await.map_err(|_| {
            (
                StatusCode::NOT_FOUND,
                ErrorResponse {
                    code: "NOT_FOUND".to_string(),
                    message: format!(
                        "Snapshot '{}' not found or not committed in manifest",
                        trimmed_snap_id
                    ),
                },
            )
        })?;

        // 2. Strict subject binding: verify snapshot belongs to the requested target package
        if envelope.subject != req.target_package_id {
            return Err((
                StatusCode::NOT_FOUND,
                ErrorResponse {
                    code: "NOT_FOUND".to_string(),
                    message: format!(
                        "Snapshot '{}' belongs to subject '{}', expected '{}'",
                        trimmed_snap_id, envelope.subject, req.target_package_id
                    ),
                },
            ));
        }

        // 3. Strict scope binding: verify snapshot has Package scope
        if !matches!(envelope.scope, PublicApiScope::Package { .. }) {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorResponse {
                    code: "INVALID_INPUT".to_string(),
                    message: format!(
                        "Snapshot '{}' has scope '{:?}', required Package scope",
                        trimmed_snap_id, envelope.scope
                    ),
                },
            ));
        }

        // 4. Optional base_version cross-check: if both provided, verify revision match
        if let Some(ref base_ver) = req.base_version {
            let trimmed_ver = base_ver.trim();
            if !trimmed_ver.is_empty() && envelope.revision != trimmed_ver {
                return Err((
                    StatusCode::BAD_REQUEST,
                    ErrorResponse {
                        code: "INVALID_INPUT".to_string(),
                        message: format!(
                            "Contradictory request: snapshot_id '{}' has revision '{}', but base_version is '{}'",
                            trimmed_snap_id, envelope.revision, trimmed_ver
                        ),
                    },
                ));
            }
        }

        trimmed_snap_id.to_string()
    } else if let Some(ref base_ver) = req.base_version {
        let trimmed_ver = base_ver.trim();
        if trimmed_ver.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                ErrorResponse {
                    code: "INVALID_INPUT".to_string(),
                    message: "base_version cannot be empty".to_string(),
                },
            ));
        }

        // Exact coordinate resolution: query history for target_package_id with Package scope and exact revision
        let history = repo
            .list_history(&req.target_package_id)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorResponse {
                        code: "INTERNAL_ERROR".to_string(),
                        message: format!("Failed to list snapshot history: {}", e),
                    },
                )
            })?;

        let matching_entries: Vec<_> = history
            .into_iter()
            .filter(|entry| {
                matches!(entry.scope, PublicApiScope::Package { .. })
                    && entry.revision == trimmed_ver
            })
            .collect();

        match matching_entries.len() {
            0 => {
                return Err((
                    StatusCode::NOT_FOUND,
                    ErrorResponse {
                        code: "NOT_FOUND".to_string(),
                        message: format!(
                            "Committed Package-scope snapshot not found for package '{}' version '{}'",
                            req.target_package_id, trimmed_ver
                        ),
                    },
                ));
            }
            1 => matching_entries[0].snapshot_id.clone(),
            count => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorResponse {
                        code: "INTERNAL_ERROR".to_string(),
                        message: format!(
                            "Ambiguous committed history: found {} Package-scope snapshots for package '{}' version '{}'",
                            count, req.target_package_id, trimmed_ver
                        ),
                    },
                ));
            }
        }
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            ErrorResponse {
                code: "INVALID_INPUT".to_string(),
                message: "Scenario must specify target_package_id and authoritative base_version or snapshot_id".to_string(),
            },
        ));
    };

    let engine = CounterfactualScenarioEngine::new();
    let result = engine
        .evaluate_committed_snapshot(repo, &resolved_snapshot_id, &req.patch)
        .await
        .map_err(|e| match e {
            ScenarioEngineError::SnapshotNotCommitted(msg) => (
                StatusCode::NOT_FOUND,
                ErrorResponse {
                    code: "NOT_FOUND".to_string(),
                    message: msg,
                },
            ),
            ScenarioEngineError::InvalidBaselineStatus(status) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorResponse {
                    code: "INVALID_BASELINE".to_string(),
                    message: format!("Baseline surface has non-complete status: {:?}", status),
                },
            ),
            ScenarioEngineError::SymbolNotFound(sym) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorResponse {
                    code: "SYMBOL_NOT_FOUND".to_string(),
                    message: format!("Symbol not found in baseline: {}", sym),
                },
            ),
            ScenarioEngineError::ConflictingOperations(msg) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorResponse {
                    code: "CONFLICTING_OPERATIONS".to_string(),
                    message: msg,
                },
            ),
            ScenarioEngineError::InvalidPatch(msg) => (
                StatusCode::BAD_REQUEST,
                ErrorResponse {
                    code: "INVALID_PATCH".to_string(),
                    message: msg,
                },
            ),
            ScenarioEngineError::RepositoryError(msg) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorResponse {
                    code: "REPOSITORY_ERROR".to_string(),
                    message: msg,
                },
            ),
        })?;

    let total_breaking_changes = result.breaking_changes.len();
    let breaking_changes_truncated = total_breaking_changes > MAX_BREAKING_CHANGES_RETURNED;
    let returned_count = total_breaking_changes.min(MAX_BREAKING_CHANGES_RETURNED);

    let breaking_changes_dto = result
        .breaking_changes
        .into_iter()
        .take(returned_count)
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

    Ok(EvaluateScenarioResponse {
        scenario_id: result.scenario_id,
        baseline_surface_hash: result.baseline_surface_hash,
        candidate_surface_hash: result.candidate_surface_hash,
        changed: result.changed,
        total_breaking_changes,
        returned_breaking_changes: returned_count,
        breaking_changes_truncated,
        breaking_changes: breaking_changes_dto,
    })
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

    evaluate_scenario_core(&repo, req)
        .await
        .map(Json)
        .map_err(|(status, err)| (status, Json(err)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use analysis::api_snapshot::SnapshotRepository;
    use analysis::ast_parser::{Language, SymbolKind};
    use analysis::counterfactual::{ScenarioPatch, ScenarioPatchOperation};
    use analysis::public_api::{
        AnalysisStatus, PublicApiExtractor, PublicApiScope, PublicApiSurface, PublicApiSymbol,
        PublicSymbolSignature, SourceProvenance,
    };

    #[test]
    fn health_response_serializes_optional_build_commit_safely() {
        let value = serde_json::to_value(HealthResponse {
            status: "healthy",
            version: "0.1.0",
            build_commit: Some("abc123".to_string()),
        })
        .expect("health response should serialize");

        assert_eq!(value["buildCommit"], "abc123");
        assert!(value.get("MEMGRAPH_URI").is_none());
    }

    struct TestTempDir {
        path: std::path::PathBuf,
    }

    impl TestTempDir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "test_api_scenario_{}_{}",
                std::process::id(),
                uuid::Uuid::new_v4()
            ));
            let _ = std::fs::create_dir_all(&path);
            Self { path }
        }
    }

    impl Drop for TestTempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn make_test_surface(
        package_id: &str,
        scope: PublicApiScope,
        symbols: Vec<(&str, &str, &str)>,
    ) -> PublicApiSurface {
        let pub_symbols: Vec<PublicApiSymbol> = symbols
            .into_iter()
            .map(|(name, qpath, sig)| {
                let sig_obj = PublicSymbolSignature {
                    raw_signature: sig.to_string(),
                    normalized_signature: sig.to_string(),
                    parameters: vec![],
                    return_type: None,
                    generics: vec![],
                    visibility: "Public".to_string(),
                    annotations: vec![],
                };
                let sig_digest = PublicApiExtractor::compute_signature_fingerprint(
                    SymbolKind::Function,
                    name,
                    std::slice::from_ref(&sig_obj),
                );
                PublicApiSymbol {
                    identity_key: qpath.to_string(),
                    exported_name: name.to_string(),
                    qualified_name: format!("{}::{}", package_id, name),
                    kind: SymbolKind::Function,
                    provenance: SourceProvenance {
                        file_path: "src/lib.rs".to_string(),
                        start_line: 1,
                        end_line: 5,
                    },
                    signatures: vec![sig_obj],
                    signature_fingerprint: sig_digest,
                }
            })
            .collect();

        let surface_hash = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Complete,
            &scope,
            Language::Rust,
            &pub_symbols,
        );

        PublicApiSurface {
            status: AnalysisStatus::Complete,
            scope,
            language: Language::Rust,
            symbols: pub_symbols,
            surface_hash,
            files_analyzed: 1,
            warnings: vec![],
        }
    }

    #[tokio::test]
    async fn test_7b_r1_t1_package_vs_module_same_revision_selects_package() {
        let tmp = TestTempDir::new();
        let repo = SnapshotRepository::open(&tmp.path).unwrap();

        let mod_scope = PublicApiScope::Module {
            module_path: "src/index.rs".to_string(),
        };
        let mod_surface = make_test_surface(
            "pkg_a",
            mod_scope.clone(),
            vec![("foo", "Rust::pkg_a::Function::foo", "fn foo()")],
        );

        let pkg_scope = PublicApiScope::Package {
            package_id: "pkg_a".to_string(),
            entry_points: vec!["src/lib.rs".to_string()],
        };
        let pkg_surface = make_test_surface(
            "pkg_a",
            pkg_scope.clone(),
            vec![("bar", "Rust::pkg_a::Function::bar", "fn bar()")],
        );

        repo.put("pkg_a", mod_scope, "1.0.0", mod_surface, 1000)
            .await
            .unwrap();
        let pkg_env = repo
            .put("pkg_a", pkg_scope, "1.0.0", pkg_surface, 1001)
            .await
            .unwrap();

        let req = EvaluateScenarioRequest {
            target_package_id: "pkg_a".to_string(),
            base_version: Some("1.0.0".to_string()),
            snapshot_id: None,
            patch: ScenarioPatch {
                scenario_id: Some("scen-1".to_string()),
                target_package_id: Some("pkg_a".to_string()),
                operations: vec![ScenarioPatchOperation::RemoveSymbol {
                    operation_id: "op-1".to_string(),
                    symbol_path: "Rust::pkg_a::Function::bar".to_string(),
                }],
            },
        };

        let res = evaluate_scenario_core(&repo, req).await.unwrap();
        assert_eq!(res.baseline_surface_hash, pkg_env.surface.surface_hash);
        assert_eq!(res.total_breaking_changes, 1);
        assert_eq!(res.returned_breaking_changes, 1);
        assert!(!res.breaking_changes_truncated);
    }

    #[tokio::test]
    async fn test_7b_r1_t2_foreign_subject_snapshot_id_rejected() {
        let tmp = TestTempDir::new();
        let repo = SnapshotRepository::open(&tmp.path).unwrap();

        let b_scope = PublicApiScope::Package {
            package_id: "pkg_b".to_string(),
            entry_points: vec!["src/lib.rs".to_string()],
        };
        let b_surface = make_test_surface(
            "pkg_b",
            b_scope.clone(),
            vec![("b_func", "Rust::pkg_b::Function::b_func", "fn b_func()")],
        );
        let env_b = repo
            .put("pkg_b", b_scope, "1.0.0", b_surface, 1000)
            .await
            .unwrap();

        let req = EvaluateScenarioRequest {
            target_package_id: "pkg_a".to_string(),
            base_version: None,
            snapshot_id: Some(env_b.snapshot_id),
            patch: ScenarioPatch::default(),
        };

        let err = evaluate_scenario_core(&repo, req).await.unwrap_err();
        assert_eq!(err.0, StatusCode::NOT_FOUND);
        assert_eq!(err.1.code, "NOT_FOUND");
    }

    #[tokio::test]
    async fn test_7b_r1_t3_foreign_subject_same_revision_cannot_cross_boundary() {
        let tmp = TestTempDir::new();
        let repo = SnapshotRepository::open(&tmp.path).unwrap();

        let b_scope = PublicApiScope::Package {
            package_id: "pkg_b".to_string(),
            entry_points: vec!["src/lib.rs".to_string()],
        };
        let b_surface = make_test_surface(
            "pkg_b",
            b_scope.clone(),
            vec![("b_func", "Rust::pkg_b::Function::b_func", "fn b_func()")],
        );
        repo.put("pkg_b", b_scope, "1.0.0", b_surface, 1000)
            .await
            .unwrap();

        let req = EvaluateScenarioRequest {
            target_package_id: "pkg_a".to_string(),
            base_version: Some("1.0.0".to_string()),
            snapshot_id: None,
            patch: ScenarioPatch::default(),
        };

        let err = evaluate_scenario_core(&repo, req).await.unwrap_err();
        assert_eq!(err.0, StatusCode::NOT_FOUND);
        assert_eq!(err.1.code, "NOT_FOUND");
    }

    #[tokio::test]
    async fn test_7b_r1_t4_snapshot_id_plus_version_mismatch_rejected() {
        let tmp = TestTempDir::new();
        let repo = SnapshotRepository::open(&tmp.path).unwrap();

        let a_scope = PublicApiScope::Package {
            package_id: "pkg_a".to_string(),
            entry_points: vec!["src/lib.rs".to_string()],
        };
        let surface = make_test_surface(
            "pkg_a",
            a_scope.clone(),
            vec![("a_func", "Rust::pkg_a::Function::a_func", "fn a_func()")],
        );
        let env_a = repo
            .put("pkg_a", a_scope, "1.0.0", surface, 1000)
            .await
            .unwrap();

        let req = EvaluateScenarioRequest {
            target_package_id: "pkg_a".to_string(),
            base_version: Some("2.0.0".to_string()),
            snapshot_id: Some(env_a.snapshot_id),
            patch: ScenarioPatch::default(),
        };

        let err = evaluate_scenario_core(&repo, req).await.unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert_eq!(err.1.code, "INVALID_INPUT");
    }

    #[tokio::test]
    async fn test_7b_r1_t5_and_t6_base_version_never_interpreted_as_snapshot_id_and_missing_fails()
    {
        let tmp = TestTempDir::new();
        let repo = SnapshotRepository::open(&tmp.path).unwrap();

        let a_scope = PublicApiScope::Package {
            package_id: "pkg_a".to_string(),
            entry_points: vec!["src/lib.rs".to_string()],
        };
        let surface = make_test_surface(
            "pkg_a",
            a_scope.clone(),
            vec![("a_func", "Rust::pkg_a::Function::a_func", "fn a_func()")],
        );
        let env_a = repo
            .put("pkg_a", a_scope, "1.0.0", surface, 1000)
            .await
            .unwrap();

        // Passing snapshot_id as base_version fails closed (never calls get_by_id)
        let req = EvaluateScenarioRequest {
            target_package_id: "pkg_a".to_string(),
            base_version: Some(env_a.snapshot_id.clone()),
            snapshot_id: None,
            patch: ScenarioPatch::default(),
        };

        let err = evaluate_scenario_core(&repo, req).await.unwrap_err();
        assert_eq!(err.0, StatusCode::NOT_FOUND);
        assert_eq!(err.1.code, "NOT_FOUND");
    }

    #[tokio::test]
    async fn test_7b_r1_t7_through_t10_response_bounding_below_at_above_cap_and_order() {
        let tmp = TestTempDir::new();
        let repo = SnapshotRepository::open(&tmp.path).unwrap();

        // Create 105 symbols
        let mut sym_specs = Vec::new();
        let mut ops = Vec::new();
        for i in 0..105 {
            let name = format!("fn_{:03}", i);
            let qpath = format!("Rust::pkg_big::Function::fn_{:03}", i);
            let sig = format!("fn fn_{:03}()", i);
            sym_specs.push((name, qpath.clone(), sig));
            ops.push(ScenarioPatchOperation::RemoveSymbol {
                operation_id: format!("op_{:03}", i),
                symbol_path: qpath,
            });
        }

        let sym_refs: Vec<(&str, &str, &str)> = sym_specs
            .iter()
            .map(|(n, q, s)| (n.as_str(), q.as_str(), s.as_str()))
            .collect();

        let big_scope = PublicApiScope::Package {
            package_id: "pkg_big".to_string(),
            entry_points: vec!["src/lib.rs".to_string()],
        };
        let surface = make_test_surface("pkg_big", big_scope.clone(), sym_refs);
        repo.put("pkg_big", big_scope, "1.0.0", surface, 1000)
            .await
            .unwrap();

        // 1. Below cap (e.g. 50 ops)
        let req_below = EvaluateScenarioRequest {
            target_package_id: "pkg_big".to_string(),
            base_version: Some("1.0.0".to_string()),
            snapshot_id: None,
            patch: ScenarioPatch {
                scenario_id: Some("scen-below".to_string()),
                target_package_id: Some("pkg_big".to_string()),
                operations: ops[..50].to_vec(),
            },
        };
        let res_below = evaluate_scenario_core(&repo, req_below).await.unwrap();
        assert_eq!(res_below.total_breaking_changes, 50);
        assert_eq!(res_below.returned_breaking_changes, 50);
        assert!(!res_below.breaking_changes_truncated);
        assert_eq!(res_below.breaking_changes.len(), 50);

        // 2. Exactly at cap (100 ops)
        let req_at = EvaluateScenarioRequest {
            target_package_id: "pkg_big".to_string(),
            base_version: Some("1.0.0".to_string()),
            snapshot_id: None,
            patch: ScenarioPatch {
                scenario_id: Some("scen-at".to_string()),
                target_package_id: Some("pkg_big".to_string()),
                operations: ops[..100].to_vec(),
            },
        };
        let res_at = evaluate_scenario_core(&repo, req_at).await.unwrap();
        assert_eq!(res_at.total_breaking_changes, 100);
        assert_eq!(res_at.returned_breaking_changes, 100);
        assert!(!res_at.breaking_changes_truncated);
        assert_eq!(res_at.breaking_changes.len(), 100);

        // 3. Above cap (105 ops)
        let req_above = EvaluateScenarioRequest {
            target_package_id: "pkg_big".to_string(),
            base_version: Some("1.0.0".to_string()),
            snapshot_id: None,
            patch: ScenarioPatch {
                scenario_id: Some("scen-above".to_string()),
                target_package_id: Some("pkg_big".to_string()),
                operations: ops.clone(),
            },
        };
        let res_above = evaluate_scenario_core(&repo, req_above).await.unwrap();
        assert_eq!(res_above.total_breaking_changes, 105);
        assert_eq!(res_above.returned_breaking_changes, 100);
        assert!(res_above.breaking_changes_truncated);
        assert_eq!(res_above.breaking_changes.len(), 100);

        // Verify deterministic order: first 100 match res_at findings
        for (i, bc) in res_above.breaking_changes.iter().enumerate() {
            assert_eq!(bc.symbol_path, res_at.breaking_changes[i].symbol_path);
        }
    }
}
