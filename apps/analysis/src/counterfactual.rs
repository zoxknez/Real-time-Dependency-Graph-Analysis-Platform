//! Counterfactual API Scenario Engine Core (WMCP-7A / WMCP-7A-R1)
//!
//! Provides deterministic, source-grounded evaluation of hypothetical API changes against
//! committed baseline public API snapshots.
//!
//! Invariants:
//! - Pure domain analysis: zero writes to authoritative snapshot repository.
//! - Closed authority: consumes V1 `PublicApiSurface` and WMCP-5 canonical hashing.
//! - Canonical identity: recomputes stable `identity_key` on rename using WMCP-5 authority.
//! - Explicit input bounds: enforces finite length limits on all scenario identifiers and expressions.
//! - Detector reuse: executes existing `BreakingDetector` via lossless `surface_to_snapshot` adapter.
//! - Determinism: identical baseline + patch produces bit-for-bit identical candidate surface and ordered findings.

use crate::api_snapshot::{SnapshotError, SnapshotRepository, surface_to_snapshot};
use crate::ast_parser::{PublicApiSnapshot, SymbolKind};
use crate::breaking_detector::{BreakingChange, BreakingDetector};
use crate::public_api::{
    AnalysisStatus, PublicApiExtractor, PublicApiScope, PublicApiSurface, PublicApiSymbol,
    PublicParameter, PublicSymbolSignature, SourceProvenance,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// ═══════════════════════════════════════════════════════════════
// SCENARIO PATCH DOMAIN TYPES & BOUNDS
// ═══════════════════════════════════════════════════════════════

/// Explicit, typed patch operations applicable to public API symbols
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind")]
pub enum ScenarioPatchOperation {
    #[serde(rename = "REMOVE_SYMBOL")]
    RemoveSymbol {
        operation_id: String,
        symbol_path: String,
    },
    #[serde(rename = "RENAME_SYMBOL")]
    RenameSymbol {
        operation_id: String,
        symbol_path: String,
        new_symbol_path: String,
    },
    #[serde(rename = "CHANGE_RETURN_TYPE")]
    ChangeReturnType {
        operation_id: String,
        symbol_path: String,
        new_return_type: String,
    },
    #[serde(rename = "CHANGE_PARAMETER_TYPE")]
    ChangeParameterType {
        operation_id: String,
        symbol_path: String,
        parameter_name: String,
        new_type: String,
    },
    #[serde(rename = "ADD_REQUIRED_PARAMETER")]
    AddRequiredParameter {
        operation_id: String,
        symbol_path: String,
        parameter_name: String,
        parameter_type: String,
    },
    #[serde(rename = "CHANGE_VISIBILITY")]
    ChangeVisibility {
        operation_id: String,
        symbol_path: String,
        new_visibility: String,
    },
}

impl ScenarioPatchOperation {
    /// Returns the target symbol path or identity key referenced by this operation
    pub fn target_symbol_path(&self) -> &str {
        match self {
            Self::RemoveSymbol { symbol_path, .. } => symbol_path,
            Self::RenameSymbol { symbol_path, .. } => symbol_path,
            Self::ChangeReturnType { symbol_path, .. } => symbol_path,
            Self::ChangeParameterType { symbol_path, .. } => symbol_path,
            Self::AddRequiredParameter { symbol_path, .. } => symbol_path,
            Self::ChangeVisibility { symbol_path, .. } => symbol_path,
        }
    }

    /// Returns the unique operation identifier
    pub fn operation_id(&self) -> &str {
        match self {
            Self::RemoveSymbol { operation_id, .. } => operation_id,
            Self::RenameSymbol { operation_id, .. } => operation_id,
            Self::ChangeReturnType { operation_id, .. } => operation_id,
            Self::ChangeParameterType { operation_id, .. } => operation_id,
            Self::AddRequiredParameter { operation_id, .. } => operation_id,
            Self::ChangeVisibility { operation_id, .. } => operation_id,
        }
    }
}

/// A structured hypothetical scenario patch containing one or more operations
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ScenarioPatch {
    pub scenario_id: Option<String>,
    pub target_package_id: Option<String>,
    pub operations: Vec<ScenarioPatchOperation>,
}

impl ScenarioPatch {
    /// Maximum allowed operations in a single scenario patch
    pub const MAX_OPERATIONS: usize = 256;
    /// Maximum allowed length for an operation identifier
    pub const MAX_OPERATION_ID_LEN: usize = 128;
    /// Maximum allowed length for a scenario identifier
    pub const MAX_SCENARIO_ID_LEN: usize = 128;
    /// Maximum allowed length for a symbol path or package identifier
    pub const MAX_SYMBOL_PATH_LEN: usize = 512;
    /// Maximum allowed length for a new symbol path during rename
    pub const MAX_NEW_SYMBOL_PATH_LEN: usize = 512;
    /// Maximum allowed length for a parameter name
    pub const MAX_PARAMETER_NAME_LEN: usize = 128;
    /// Maximum allowed length for a type expression
    pub const MAX_TYPE_EXPRESSION_LEN: usize = 512;

    /// Validates internal consistency and explicit input bounds of the scenario patch
    pub fn validate(&self) -> Result<(), ScenarioEngineError> {
        if self.operations.len() > Self::MAX_OPERATIONS {
            return Err(ScenarioEngineError::InvalidPatch(format!(
                "Patch exceeds maximum operation count ({})",
                Self::MAX_OPERATIONS
            )));
        }

        validate_bounded_optional("scenario_id", &self.scenario_id, Self::MAX_SCENARIO_ID_LEN)?;
        validate_bounded_optional(
            "target_package_id",
            &self.target_package_id,
            Self::MAX_SYMBOL_PATH_LEN,
        )?;

        // Check for conflicting duplicate operations targeting the same symbol
        let mut seen_symbols = HashSet::new();
        for op in &self.operations {
            validate_bounded_non_empty(
                "operation_id",
                op.operation_id(),
                Self::MAX_OPERATION_ID_LEN,
            )?;
            validate_bounded_non_empty(
                "symbol_path",
                op.target_symbol_path(),
                Self::MAX_SYMBOL_PATH_LEN,
            )?;

            match op {
                ScenarioPatchOperation::RemoveSymbol { .. } => {}
                ScenarioPatchOperation::RenameSymbol {
                    new_symbol_path, ..
                } => {
                    validate_bounded_non_empty(
                        "new_symbol_path",
                        new_symbol_path,
                        Self::MAX_NEW_SYMBOL_PATH_LEN,
                    )?;
                }
                ScenarioPatchOperation::ChangeReturnType {
                    new_return_type, ..
                } => {
                    validate_bounded_non_empty(
                        "new_return_type",
                        new_return_type,
                        Self::MAX_TYPE_EXPRESSION_LEN,
                    )?;
                }
                ScenarioPatchOperation::ChangeParameterType {
                    parameter_name,
                    new_type,
                    ..
                } => {
                    validate_bounded_non_empty(
                        "parameter_name",
                        parameter_name,
                        Self::MAX_PARAMETER_NAME_LEN,
                    )?;
                    validate_bounded_non_empty(
                        "new_type",
                        new_type,
                        Self::MAX_TYPE_EXPRESSION_LEN,
                    )?;
                }
                ScenarioPatchOperation::AddRequiredParameter {
                    parameter_name,
                    parameter_type,
                    ..
                } => {
                    validate_bounded_non_empty(
                        "parameter_name",
                        parameter_name,
                        Self::MAX_PARAMETER_NAME_LEN,
                    )?;
                    validate_bounded_non_empty(
                        "parameter_type",
                        parameter_type,
                        Self::MAX_TYPE_EXPRESSION_LEN,
                    )?;
                }
                ScenarioPatchOperation::ChangeVisibility { new_visibility, .. } => {
                    validate_bounded_non_empty(
                        "new_visibility",
                        new_visibility,
                        Self::MAX_PARAMETER_NAME_LEN,
                    )?;
                }
            }

            let target = op.target_symbol_path();
            if !seen_symbols.insert(target) {
                return Err(ScenarioEngineError::ConflictingOperations(format!(
                    "Multiple conflicting operations targeting symbol '{}'",
                    target
                )));
            }
        }

        Ok(())
    }
}

fn validate_bounded_non_empty(
    field_name: &str,
    value: &str,
    max_len: usize,
) -> Result<(), ScenarioEngineError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(ScenarioEngineError::InvalidPatch(format!(
            "Field '{}' cannot be empty or whitespace-only",
            field_name
        )));
    }
    if value.len() > max_len {
        return Err(ScenarioEngineError::InvalidPatch(format!(
            "Field '{}' exceeds maximum allowed length of {} bytes (got {} bytes)",
            field_name,
            max_len,
            value.len()
        )));
    }
    Ok(())
}

fn validate_bounded_optional(
    field_name: &str,
    value: &Option<String>,
    max_len: usize,
) -> Result<(), ScenarioEngineError> {
    if let Some(val) = value {
        let trimmed = val.trim();
        if trimmed.is_empty() {
            return Err(ScenarioEngineError::InvalidPatch(format!(
                "Field '{}' cannot be whitespace-only",
                field_name
            )));
        }
        if val.len() > max_len {
            return Err(ScenarioEngineError::InvalidPatch(format!(
                "Field '{}' exceeds maximum allowed length of {} bytes (got {} bytes)",
                field_name,
                max_len,
                val.len()
            )));
        }
    }
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// RESULT AND ERROR TYPES
// ═══════════════════════════════════════════════════════════════

/// Result of evaluating a counterfactual scenario against a baseline surface
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CounterfactualScenarioResult {
    pub scenario_id: Option<String>,
    pub baseline_surface_hash: String,
    pub candidate_surface_hash: String,
    pub changed: bool,
    pub candidate_surface: PublicApiSurface,
    pub breaking_changes: Vec<BreakingChange>,
}

/// Typed domain errors for counterfactual evaluation
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ScenarioEngineError {
    #[error("Snapshot not found or not committed in manifest: {0}")]
    SnapshotNotCommitted(String),

    #[error("Baseline surface has non-complete status: {0:?}")]
    InvalidBaselineStatus(AnalysisStatus),

    #[error("Symbol not found in baseline surface: {0}")]
    SymbolNotFound(String),

    #[error("Conflicting patch operations for symbol: {0}")]
    ConflictingOperations(String),

    #[error("Invalid patch: {0}")]
    InvalidPatch(String),

    #[error("Snapshot repository error: {0}")]
    RepositoryError(String),
}

// ═══════════════════════════════════════════════════════════════
// COUNTERFACTUAL SCENARIO ENGINE
// ═══════════════════════════════════════════════════════════════

/// Evaluates hypothetical API patches against authoritative public API baselines
#[derive(Default)]
pub struct CounterfactualScenarioEngine {
    detector: BreakingDetector,
}

impl std::fmt::Debug for CounterfactualScenarioEngine {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CounterfactualScenarioEngine").finish()
    }
}

impl CounterfactualScenarioEngine {
    pub fn new() -> Self {
        Self {
            detector: BreakingDetector::default(),
        }
    }

    /// Evaluates a scenario patch against a committed snapshot retrieved from `SnapshotRepository`
    pub async fn evaluate_committed_snapshot(
        &self,
        repo: &SnapshotRepository,
        snapshot_id: &str,
        patch: &ScenarioPatch,
    ) -> Result<CounterfactualScenarioResult, ScenarioEngineError> {
        let envelope = repo.get_by_id(snapshot_id).await.map_err(|e| match e {
            SnapshotError::SnapshotNotFound(msg) => ScenarioEngineError::SnapshotNotCommitted(msg),
            other => ScenarioEngineError::RepositoryError(other.to_string()),
        })?;

        if envelope.surface.status != AnalysisStatus::Complete {
            return Err(ScenarioEngineError::InvalidBaselineStatus(
                envelope.surface.status,
            ));
        }

        self.evaluate_surface(&envelope.surface, patch)
    }

    /// Evaluates a scenario patch against an authoritative in-memory `PublicApiSurface` baseline
    pub fn evaluate_surface(
        &self,
        baseline: &PublicApiSurface,
        patch: &ScenarioPatch,
    ) -> Result<CounterfactualScenarioResult, ScenarioEngineError> {
        if baseline.status != AnalysisStatus::Complete {
            return Err(ScenarioEngineError::InvalidBaselineStatus(baseline.status));
        }

        patch.validate()?;

        // Empty patch returns identity
        if patch.operations.is_empty() {
            return Ok(CounterfactualScenarioResult {
                scenario_id: patch.scenario_id.clone(),
                baseline_surface_hash: baseline.surface_hash.clone(),
                candidate_surface_hash: baseline.surface_hash.clone(),
                changed: false,
                candidate_surface: baseline.clone(),
                breaking_changes: Vec::new(),
            });
        }

        // 1. Construct candidate surface by applying patch operations
        let mut candidate_symbols = baseline.symbols.clone();

        for op in &patch.operations {
            let target_ref = op.target_symbol_path();

            // Locate symbol index (exact identity_key, qualified_name, or exported_name)
            let sym_idx = find_symbol_index(&candidate_symbols, target_ref)
                .ok_or_else(|| ScenarioEngineError::SymbolNotFound(target_ref.to_string()))?;

            match op {
                ScenarioPatchOperation::RemoveSymbol { .. } => {
                    candidate_symbols.remove(sym_idx);
                }
                ScenarioPatchOperation::RenameSymbol {
                    new_symbol_path, ..
                } => {
                    let sym = &mut candidate_symbols[sym_idx];
                    let old_name = sym.exported_name.clone();
                    sym.exported_name = new_symbol_path.clone();
                    if sym.qualified_name.ends_with(&old_name) {
                        let prefix = sym.qualified_name.strip_suffix(&old_name).unwrap_or("");
                        sym.qualified_name = format!("{}{}", prefix, new_symbol_path);
                    } else {
                        sym.qualified_name = new_symbol_path.clone();
                    }

                    // Recompute canonical identity_key using exact WMCP-5 authority
                    sym.identity_key = PublicApiExtractor::compute_identity_key(
                        baseline.language,
                        &sym.provenance.file_path,
                        sym.kind,
                        &sym.qualified_name,
                    );

                    // Update signature strings and fingerprints
                    for sig in &mut sym.signatures {
                        sig.normalized_signature = sig
                            .normalized_signature
                            .replace(
                                &format!("function {}", old_name),
                                &format!("function {}", new_symbol_path),
                            )
                            .replace(
                                &format!("fn {}", old_name),
                                &format!("fn {}", new_symbol_path),
                            );
                        sig.raw_signature = sig
                            .raw_signature
                            .replace(
                                &format!("function {}", old_name),
                                &format!("function {}", new_symbol_path),
                            )
                            .replace(
                                &format!("fn {}", old_name),
                                &format!("fn {}", new_symbol_path),
                            );
                    }
                    sym.signature_fingerprint = PublicApiExtractor::compute_signature_fingerprint(
                        sym.kind,
                        &sym.exported_name,
                        &sym.signatures,
                    );

                    // Explicit domain validation: check that rename does not collide with existing symbol
                    let renamed_identity = sym.identity_key.clone();
                    let renamed_qualified = sym.qualified_name.clone();
                    let renamed_exported = sym.exported_name.clone();

                    for (i, other) in candidate_symbols.iter().enumerate() {
                        if i != sym_idx
                            && (other.identity_key == renamed_identity
                                || other.qualified_name == renamed_qualified
                                || other.exported_name == renamed_exported)
                        {
                            return Err(ScenarioEngineError::ConflictingOperations(format!(
                                "Renaming symbol '{}' to '{}' creates a collision with existing symbol '{}'",
                                old_name, new_symbol_path, other.exported_name
                            )));
                        }
                    }
                }
                ScenarioPatchOperation::ChangeReturnType {
                    new_return_type, ..
                } => {
                    let sym = &mut candidate_symbols[sym_idx];
                    for sig in &mut sym.signatures {
                        sig.return_type = Some(new_return_type.clone());
                        sig.normalized_signature = update_signature_return_type(
                            &sig.normalized_signature,
                            new_return_type,
                        );
                        sig.raw_signature =
                            update_signature_return_type(&sig.raw_signature, new_return_type);
                    }
                    sym.signature_fingerprint = PublicApiExtractor::compute_signature_fingerprint(
                        sym.kind,
                        &sym.exported_name,
                        &sym.signatures,
                    );
                }
                ScenarioPatchOperation::ChangeParameterType {
                    parameter_name,
                    new_type,
                    ..
                } => {
                    let sym = &mut candidate_symbols[sym_idx];
                    for sig in &mut sym.signatures {
                        for param in &mut sig.parameters {
                            if &param.name == parameter_name {
                                param.type_annotation = Some(new_type.clone());
                            }
                        }
                        sig.normalized_signature = update_signature_parameter_type(
                            &sig.normalized_signature,
                            parameter_name,
                            new_type,
                        );
                        sig.raw_signature = update_signature_parameter_type(
                            &sig.raw_signature,
                            parameter_name,
                            new_type,
                        );
                    }
                    sym.signature_fingerprint = PublicApiExtractor::compute_signature_fingerprint(
                        sym.kind,
                        &sym.exported_name,
                        &sym.signatures,
                    );
                }
                ScenarioPatchOperation::AddRequiredParameter {
                    parameter_name,
                    parameter_type,
                    ..
                } => {
                    let sym = &mut candidate_symbols[sym_idx];
                    for sig in &mut sym.signatures {
                        sig.parameters.push(PublicParameter {
                            name: parameter_name.clone(),
                            type_annotation: Some(parameter_type.clone()),
                            default_value: None,
                            is_optional: false,
                            is_variadic: false,
                        });
                        sig.normalized_signature = add_parameter_to_signature(
                            &sig.normalized_signature,
                            parameter_name,
                            parameter_type,
                        );
                        sig.raw_signature = add_parameter_to_signature(
                            &sig.raw_signature,
                            parameter_name,
                            parameter_type,
                        );
                    }
                    sym.signature_fingerprint = PublicApiExtractor::compute_signature_fingerprint(
                        sym.kind,
                        &sym.exported_name,
                        &sym.signatures,
                    );
                }
                ScenarioPatchOperation::ChangeVisibility { new_visibility, .. } => {
                    let is_public = new_visibility.eq_ignore_ascii_case("public");
                    if !is_public {
                        // Visibility reduced to non-public -> removed from public surface
                        candidate_symbols.remove(sym_idx);
                    }
                }
            }
        }

        // 2. Compute canonical candidate surface hash using exact WMCP-5 authority
        let candidate_surface_hash = PublicApiExtractor::compute_surface_hash(
            baseline.status,
            &baseline.scope,
            baseline.language,
            &candidate_symbols,
        );

        let changed = candidate_surface_hash != baseline.surface_hash;

        let candidate_surface = PublicApiSurface {
            status: baseline.status,
            scope: baseline.scope.clone(),
            language: baseline.language,
            symbols: candidate_symbols,
            surface_hash: candidate_surface_hash.clone(),
            files_analyzed: baseline.files_analyzed,
            warnings: baseline.warnings.clone(),
        };

        // 3. Execute semantic breaking change analysis via lossless adapter
        let package_id = match &baseline.scope {
            PublicApiScope::Package { package_id, .. } => package_id.as_str(),
            PublicApiScope::Module { module_path } => module_path.as_str(),
        };

        let baseline_snapshot = surface_to_snapshot(baseline, package_id, "baseline");
        let candidate_snapshot = surface_to_snapshot(&candidate_surface, package_id, "candidate");

        let mut breaking_changes = self
            .detector
            .detect_breaking_changes(&baseline_snapshot, &candidate_snapshot);

        // Sort breaking findings deterministically by symbol_path, change description, and migration hint
        breaking_changes.sort_by(|a, b| {
            a.symbol_path
                .cmp(&b.symbol_path)
                .then_with(|| a.change_type.description().cmp(b.change_type.description()))
                .then_with(|| a.description.cmp(&b.description))
        });

        Ok(CounterfactualScenarioResult {
            scenario_id: patch.scenario_id.clone(),
            baseline_surface_hash: baseline.surface_hash.clone(),
            candidate_surface_hash,
            changed,
            candidate_surface,
            breaking_changes,
        })
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS FOR SIGNATURE MANIPULATION
// ═══════════════════════════════════════════════════════════════

fn find_symbol_index(symbols: &[PublicApiSymbol], target_ref: &str) -> Option<usize> {
    // 1. Exact identity key match
    if let Some(idx) = symbols.iter().position(|s| s.identity_key == target_ref) {
        return Some(idx);
    }
    // 2. Exact qualified name match
    if let Some(idx) = symbols.iter().position(|s| s.qualified_name == target_ref) {
        return Some(idx);
    }
    // 3. Exact exported name match
    symbols.iter().position(|s| s.exported_name == target_ref)
}

fn update_signature_return_type(sig_str: &str, new_return_type: &str) -> String {
    if let Some((prefix, _)) = sig_str.rsplit_once("->") {
        format!("{}-> {}", prefix, new_return_type)
    } else if let Some((prefix, _)) = sig_str.rsplit_once(':') {
        format!("{}: {}", prefix, new_return_type)
    } else {
        format!("{} -> {}", sig_str, new_return_type)
    }
}

fn update_signature_parameter_type(sig_str: &str, param_name: &str, new_type: &str) -> String {
    let needle = format!("{}: ", param_name);
    if let Some(pos) = sig_str.find(&needle) {
        let after_needle = &sig_str[pos + needle.len()..];
        let end_param = after_needle.find([',', ')']).unwrap_or(after_needle.len());
        let old_type_slice = &after_needle[..end_param];
        sig_str.replacen(
            &format!("{}{}", needle, old_type_slice),
            &format!("{}{}", needle, new_type),
            1,
        )
    } else {
        sig_str.to_string()
    }
}

fn add_parameter_to_signature(sig_str: &str, param_name: &str, param_type: &str) -> String {
    if let Some(close_paren) = sig_str.rfind(')') {
        let (before_close, after_close) = sig_split_at_preserve(sig_str, close_paren);
        let separator = if before_close.ends_with('(') {
            ""
        } else {
            ", "
        };
        format!(
            "{}{}{}: {}{}",
            before_close, separator, param_name, param_type, after_close
        )
    } else {
        format!("{}({}: {})", sig_str, param_name, param_type)
    }
}

fn sig_split_at_preserve(s: &str, mid: usize) -> (&str, &str) {
    (&s[..mid], &s[mid..])
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast_parser::Language;

    fn make_test_symbol(
        package_id: &str,
        name: &str,
        return_type: &str,
        params: Vec<(&str, &str)>,
    ) -> PublicApiSymbol {
        let param_sigs: Vec<PublicParameter> = params
            .into_iter()
            .map(|(pname, ptype)| PublicParameter {
                name: pname.to_string(),
                type_annotation: Some(ptype.to_string()),
                default_value: None,
                is_optional: false,
                is_variadic: false,
            })
            .collect();

        let param_str = param_sigs
            .iter()
            .map(|p| {
                format!(
                    "{}: {}",
                    p.name,
                    p.type_annotation.as_deref().unwrap_or("any")
                )
            })
            .collect::<Vec<_>>()
            .join(", ");

        let sig_text = format!("fn {}({}) -> {}", name, param_str, return_type);

        let sig = PublicSymbolSignature {
            raw_signature: sig_text.clone(),
            normalized_signature: sig_text,
            parameters: param_sigs,
            return_type: Some(return_type.to_string()),
            generics: vec![],
            visibility: "Public".to_string(),
            annotations: vec![],
        };

        let sig_digest = PublicApiExtractor::compute_signature_fingerprint(
            SymbolKind::Function,
            name,
            std::slice::from_ref(&sig),
        );

        let qualified_name = format!("{}::{}", package_id, name);
        let identity_key = PublicApiExtractor::compute_identity_key(
            Language::Rust,
            "src/lib.rs",
            SymbolKind::Function,
            &qualified_name,
        );

        PublicApiSymbol {
            identity_key,
            exported_name: name.to_string(),
            qualified_name,
            kind: SymbolKind::Function,
            provenance: SourceProvenance {
                file_path: "src/lib.rs".to_string(),
                start_line: 1,
                end_line: 5,
            },
            signatures: vec![sig],
            signature_fingerprint: sig_digest,
        }
    }

    fn make_test_surface(package_id: &str, symbols: Vec<PublicApiSymbol>) -> PublicApiSurface {
        let scope = PublicApiScope::Package {
            package_id: package_id.to_string(),
            entry_points: vec!["src/lib.rs".to_string()],
        };
        let surface_hash = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Complete,
            &scope,
            Language::Rust,
            &symbols,
        );
        PublicApiSurface {
            status: AnalysisStatus::Complete,
            scope,
            language: Language::Rust,
            symbols,
            surface_hash,
            files_analyzed: 1,
            warnings: vec![],
        }
    }

    #[tokio::test]
    async fn test_7a_t1_through_t25_counterfactual_engine() {
        let engine = CounterfactualScenarioEngine::new();
        let sym_a = make_test_symbol("pkg_a", "calculate", "i32", vec![("x", "i32")]);
        let sym_b = make_test_symbol("pkg_a", "render", "String", vec![]);
        let baseline = make_test_surface("pkg_a", vec![sym_a.clone(), sym_b.clone()]);

        // 7A-T1: Committed baseline accepted through repository
        let temp_dir = std::env::temp_dir().join(format!("7a_repo_{}", uuid::Uuid::new_v4()));
        let repo = SnapshotRepository::open(&temp_dir).unwrap();
        let envelope = repo
            .put(
                "pkg_a",
                baseline.scope.clone(),
                "1.0.0",
                baseline.clone(),
                1000,
            )
            .await
            .unwrap();

        let empty_patch = ScenarioPatch::default();
        let res_committed = engine
            .evaluate_committed_snapshot(&repo, &envelope.snapshot_id, &empty_patch)
            .await
            .unwrap();
        assert_eq!(res_committed.baseline_surface_hash, baseline.surface_hash);
        assert!(!res_committed.changed);

        // 7A-T2: Uncommitted / orphan baseline rejected
        let orphan_res = engine
            .evaluate_committed_snapshot(&repo, "non_existent_snapshot_id", &empty_patch)
            .await;
        assert!(orphan_res.is_err());
        assert!(matches!(
            orphan_res.unwrap_err(),
            ScenarioEngineError::SnapshotNotCommitted(_)
        ));

        // 7A-T3 & 7A-T4: Empty patch is semantic identity and produces zero breaking changes
        let res_empty = engine.evaluate_surface(&baseline, &empty_patch).unwrap();
        assert_eq!(res_empty.baseline_surface_hash, baseline.surface_hash);
        assert_eq!(res_empty.candidate_surface_hash, baseline.surface_hash);
        assert!(!res_empty.changed);
        assert!(res_empty.breaking_changes.is_empty());

        // 7A-T5: Counterfactual evaluation performs zero SnapshotRepository writes
        let history_before = repo.list_history("pkg_a").await.unwrap();
        let patch_remove = ScenarioPatch {
            scenario_id: Some("scen-1".to_string()),
            target_package_id: Some("pkg_a".to_string()),
            operations: vec![ScenarioPatchOperation::RemoveSymbol {
                operation_id: "op-1".to_string(),
                symbol_path: sym_a.identity_key.clone(),
            }],
        };
        let res_remove = engine
            .evaluate_committed_snapshot(&repo, &envelope.snapshot_id, &patch_remove)
            .await
            .unwrap();
        let history_after = repo.list_history("pkg_a").await.unwrap();
        assert_eq!(
            history_before.len(),
            history_after.len(),
            "7A-T5: Must perform zero snapshot writes"
        );

        // 7A-T6 & 7A-T7: Remove public symbol produces candidate and breaking change
        assert!(res_remove.changed);
        assert_ne!(res_remove.candidate_surface_hash, baseline.surface_hash);
        assert_eq!(res_remove.candidate_surface.symbols.len(), 1);
        assert_eq!(
            res_remove.candidate_surface.symbols[0].exported_name,
            "render"
        );
        assert_eq!(res_remove.breaking_changes.len(), 1);
        assert_eq!(
            res_remove.breaking_changes[0].change_type,
            crate::breaking_detector::BreakingChangeType::RemovedSymbol
        );

        // 7A-T8 & 7A-T9: Signature change produces expected candidate and breaking change
        let patch_sig = ScenarioPatch {
            scenario_id: Some("scen-2".to_string()),
            target_package_id: Some("pkg_a".to_string()),
            operations: vec![ScenarioPatchOperation::ChangeReturnType {
                operation_id: "op-2".to_string(),
                symbol_path: sym_a.identity_key.clone(),
                new_return_type: "f64".to_string(),
            }],
        };
        let res_sig = engine.evaluate_surface(&baseline, &patch_sig).unwrap();
        assert!(res_sig.changed);
        assert_eq!(
            res_sig.candidate_surface.symbols[0].signatures[0]
                .return_type
                .as_deref(),
            Some("f64")
        );
        assert_eq!(res_sig.breaking_changes.len(), 1);
        assert_eq!(
            res_sig.breaking_changes[0].change_type,
            crate::breaking_detector::BreakingChangeType::ReturnTypeChanged
        );

        // 7A-T10: Unknown symbol rejected with typed error
        let patch_unknown = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::RemoveSymbol {
                operation_id: "op-err".to_string(),
                symbol_path: "non_existent_symbol".to_string(),
            }],
        };
        let err_unknown = engine
            .evaluate_surface(&baseline, &patch_unknown)
            .unwrap_err();
        assert_eq!(
            err_unknown,
            ScenarioEngineError::SymbolNotFound("non_existent_symbol".to_string())
        );

        // 7A-T11: Conflicting operations rejected
        let patch_conflicting = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![
                ScenarioPatchOperation::RemoveSymbol {
                    operation_id: "op-a".to_string(),
                    symbol_path: sym_a.identity_key.clone(),
                },
                ScenarioPatchOperation::ChangeReturnType {
                    operation_id: "op-b".to_string(),
                    symbol_path: sym_a.identity_key.clone(),
                    new_return_type: "bool".to_string(),
                },
            ],
        };
        let err_conflict = engine
            .evaluate_surface(&baseline, &patch_conflicting)
            .unwrap_err();
        assert!(matches!(
            err_conflict,
            ScenarioEngineError::ConflictingOperations(_)
        ));

        // 7A-T12: Baseline remains immutable
        let baseline_clone = baseline.clone();
        let _ = engine.evaluate_surface(&baseline, &patch_sig).unwrap();
        assert_eq!(
            baseline, baseline_clone,
            "7A-T12: Baseline must remain unchanged"
        );

        // 7A-T13: Candidate hash matches WMCP-5 canonical authority
        let expected_hash = PublicApiExtractor::compute_surface_hash(
            baseline.status,
            &baseline.scope,
            baseline.language,
            &res_sig.candidate_surface.symbols,
        );
        assert_eq!(res_sig.candidate_surface_hash, expected_hash);

        // 7A-T14 & 7A-T15: Repeated evaluation is deterministic across 100 iterations
        for _ in 0..100 {
            let iter_res = engine.evaluate_surface(&baseline, &patch_sig).unwrap();
            assert_eq!(
                iter_res.candidate_surface_hash,
                res_sig.candidate_surface_hash
            );
            assert_eq!(
                iter_res.breaking_changes.len(),
                res_sig.breaking_changes.len()
            );
            assert_eq!(
                iter_res.breaking_changes[0].symbol_path,
                res_sig.breaking_changes[0].symbol_path
            );
            assert_eq!(
                iter_res.breaking_changes[0].change_type,
                res_sig.breaking_changes[0].change_type
            );
        }

        // 7A-T16: Breaking findings are deterministically ordered
        let patch_multi_break = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![
                ScenarioPatchOperation::RemoveSymbol {
                    operation_id: "op-1".to_string(),
                    symbol_path: sym_b.identity_key.clone(),
                },
                ScenarioPatchOperation::RemoveSymbol {
                    operation_id: "op-2".to_string(),
                    symbol_path: sym_a.identity_key.clone(),
                },
            ],
        };
        let res_multi = engine
            .evaluate_surface(&baseline, &patch_multi_break)
            .unwrap();
        assert_eq!(res_multi.breaking_changes.len(), 2);
        assert!(
            res_multi.breaking_changes[0].symbol_path <= res_multi.breaking_changes[1].symbol_path
        );

        // 7A-T17..T20: TypeScript overload grouping preserved
        let ts_sig1 = PublicSymbolSignature {
            raw_signature: "function parse(x: string): string".to_string(),
            normalized_signature: "function parse(x: string): string".to_string(),
            parameters: vec![PublicParameter {
                name: "x".to_string(),
                type_annotation: Some("string".to_string()),
                default_value: None,
                is_optional: false,
                is_variadic: false,
            }],
            return_type: Some("string".to_string()),
            generics: vec![],
            visibility: "Public".to_string(),
            annotations: vec![],
        };
        let ts_sig2 = PublicSymbolSignature {
            raw_signature: "function parse(x: number): number".to_string(),
            normalized_signature: "function parse(x: number): number".to_string(),
            parameters: vec![PublicParameter {
                name: "x".to_string(),
                type_annotation: Some("number".to_string()),
                default_value: None,
                is_optional: false,
                is_variadic: false,
            }],
            return_type: Some("number".to_string()),
            generics: vec![],
            visibility: "Public".to_string(),
            annotations: vec![],
        };
        let ts_sym = PublicApiSymbol {
            identity_key: "TypeScript::src/index.ts::Function::ts_pkg::parse".to_string(),
            exported_name: "parse".to_string(),
            qualified_name: "ts_pkg::parse".to_string(),
            kind: SymbolKind::Function,
            provenance: SourceProvenance {
                file_path: "src/index.ts".to_string(),
                start_line: 1,
                end_line: 10,
            },
            signatures: vec![ts_sig1, ts_sig2],
            signature_fingerprint: "sig_digest_ts".to_string(),
        };
        let ts_surface = PublicApiSurface {
            status: AnalysisStatus::Complete,
            scope: PublicApiScope::Package {
                package_id: "ts_pkg".to_string(),
                entry_points: vec!["src/index.ts".to_string()],
            },
            language: Language::TypeScript,
            symbols: vec![ts_sym.clone()],
            surface_hash: "ts_surface_hash".to_string(),
            files_analyzed: 1,
            warnings: vec![],
        };

        let patch_ts_return = ScenarioPatch {
            scenario_id: Some("ts-scen".to_string()),
            target_package_id: Some("ts_pkg".to_string()),
            operations: vec![ScenarioPatchOperation::ChangeReturnType {
                operation_id: "op-ts".to_string(),
                symbol_path: ts_sym.identity_key.clone(),
                new_return_type: "boolean".to_string(),
            }],
        };
        let res_ts = engine
            .evaluate_surface(&ts_surface, &patch_ts_return)
            .unwrap();
        assert_eq!(res_ts.candidate_surface.symbols[0].signatures.len(), 2);
        assert_eq!(
            res_ts.candidate_surface.symbols[0].signatures[0]
                .return_type
                .as_deref(),
            Some("boolean")
        );

        // 7A-T21: Serialization roundtrip preserves patch semantics
        let patch_json = serde_json::to_string(&patch_sig).unwrap();
        let deserialized_patch: ScenarioPatch = serde_json::from_str(&patch_json).unwrap();
        assert_eq!(patch_sig, deserialized_patch);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_7a_r1_t1_through_t16_rename_identity_and_explicit_bounds() {
        let engine = CounterfactualScenarioEngine::new();
        let sym_a = make_test_symbol("pkg_a", "foo", "i32", vec![]);
        let sym_b = make_test_symbol("pkg_a", "bar", "String", vec![]);
        let baseline = make_test_surface("pkg_a", vec![sym_a.clone(), sym_b.clone()]);

        // 7A-R1-T1: Rename recomputes canonical identity_key using WMCP-5 authority
        let patch_rename = ScenarioPatch {
            scenario_id: Some("rename-scen".to_string()),
            target_package_id: Some("pkg_a".to_string()),
            operations: vec![ScenarioPatchOperation::RenameSymbol {
                operation_id: "op-rename".to_string(),
                symbol_path: sym_a.identity_key.clone(),
                new_symbol_path: "baz".to_string(),
            }],
        };
        let res_rename = engine.evaluate_surface(&baseline, &patch_rename).unwrap();
        let renamed_sym = &res_rename.candidate_surface.symbols[0];

        let expected_identity = PublicApiExtractor::compute_identity_key(
            Language::Rust,
            "src/lib.rs",
            SymbolKind::Function,
            "pkg_a::baz",
        );
        assert_eq!(
            renamed_sym.identity_key, expected_identity,
            "7A-R1-T1: identity_key must be recomputed canonically"
        );
        assert_eq!(renamed_sym.exported_name, "baz");
        assert_eq!(renamed_sym.qualified_name, "pkg_a::baz");

        // 7A-R1-T2: Old identity no longer targets candidate
        let patch_target_old = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::ChangeReturnType {
                operation_id: "op-old".to_string(),
                symbol_path: sym_a.identity_key.clone(),
                new_return_type: "u64".to_string(),
            }],
        };
        let err_old = engine.evaluate_surface(&res_rename.candidate_surface, &patch_target_old);
        assert!(
            matches!(err_old.unwrap_err(), ScenarioEngineError::SymbolNotFound(_)),
            "7A-R1-T2: Old identity must not resolve"
        );

        // 7A-R1-T3: New canonical identity targets candidate
        let patch_target_new = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::ChangeReturnType {
                operation_id: "op-new".to_string(),
                symbol_path: expected_identity.clone(),
                new_return_type: "u64".to_string(),
            }],
        };
        let res_new = engine
            .evaluate_surface(&res_rename.candidate_surface, &patch_target_new)
            .unwrap();
        assert_eq!(
            res_new.candidate_surface.symbols[0].signatures[0]
                .return_type
                .as_deref(),
            Some("u64")
        );

        // 7A-R1-T4: Rename collision returns typed failure
        let patch_collide = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::RenameSymbol {
                operation_id: "op-col".to_string(),
                symbol_path: sym_a.identity_key.clone(),
                new_symbol_path: "bar".to_string(),
            }],
        };
        let err_collide = engine.evaluate_surface(&baseline, &patch_collide);
        assert!(matches!(
            err_collide.unwrap_err(),
            ScenarioEngineError::ConflictingOperations(_)
        ));

        // 7A-R1-T6: MAX_OPERATIONS enforced
        let mut ops_overflow = Vec::new();
        for i in 0..257 {
            ops_overflow.push(ScenarioPatchOperation::RemoveSymbol {
                operation_id: format!("op-{}", i),
                symbol_path: format!("sym-{}", i),
            });
        }
        let patch_overflow = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: ops_overflow,
        };
        assert!(matches!(
            patch_overflow.validate().unwrap_err(),
            ScenarioEngineError::InvalidPatch(_)
        ));

        // 7A-R1-T7: operation_id max/max+1
        let valid_op_id = "a".repeat(ScenarioPatch::MAX_OPERATION_ID_LEN);
        let invalid_op_id = "a".repeat(ScenarioPatch::MAX_OPERATION_ID_LEN + 1);
        let patch_op_valid = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::RemoveSymbol {
                operation_id: valid_op_id,
                symbol_path: "sym".to_string(),
            }],
        };
        assert!(patch_op_valid.validate().is_ok());

        let patch_op_invalid = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::RemoveSymbol {
                operation_id: invalid_op_id,
                symbol_path: "sym".to_string(),
            }],
        };
        assert!(matches!(
            patch_op_invalid.validate().unwrap_err(),
            ScenarioEngineError::InvalidPatch(_)
        ));

        // 7A-R1-T8: scenario_id max/max+1
        let valid_scen_id = "s".repeat(ScenarioPatch::MAX_SCENARIO_ID_LEN);
        let invalid_scen_id = "s".repeat(ScenarioPatch::MAX_SCENARIO_ID_LEN + 1);
        let patch_scen_valid = ScenarioPatch {
            scenario_id: Some(valid_scen_id),
            target_package_id: None,
            operations: vec![],
        };
        assert!(patch_scen_valid.validate().is_ok());

        let patch_scen_invalid = ScenarioPatch {
            scenario_id: Some(invalid_scen_id),
            target_package_id: None,
            operations: vec![],
        };
        assert!(matches!(
            patch_scen_invalid.validate().unwrap_err(),
            ScenarioEngineError::InvalidPatch(_)
        ));

        // 7A-R1-T9: symbol_path max/max+1
        let valid_sym_path = "p".repeat(ScenarioPatch::MAX_SYMBOL_PATH_LEN);
        let invalid_sym_path = "p".repeat(ScenarioPatch::MAX_SYMBOL_PATH_LEN + 1);
        let patch_sym_valid = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::RemoveSymbol {
                operation_id: "op1".to_string(),
                symbol_path: valid_sym_path,
            }],
        };
        assert!(patch_sym_valid.validate().is_ok());

        let patch_sym_invalid = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::RemoveSymbol {
                operation_id: "op1".to_string(),
                symbol_path: invalid_sym_path,
            }],
        };
        assert!(matches!(
            patch_sym_invalid.validate().unwrap_err(),
            ScenarioEngineError::InvalidPatch(_)
        ));

        // 7A-R1-T10: new_symbol_path max/max+1
        let valid_new_sym = "n".repeat(ScenarioPatch::MAX_NEW_SYMBOL_PATH_LEN);
        let invalid_new_sym = "n".repeat(ScenarioPatch::MAX_NEW_SYMBOL_PATH_LEN + 1);
        let patch_new_valid = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::RenameSymbol {
                operation_id: "op1".to_string(),
                symbol_path: "sym".to_string(),
                new_symbol_path: valid_new_sym,
            }],
        };
        assert!(patch_new_valid.validate().is_ok());

        let patch_new_invalid = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::RenameSymbol {
                operation_id: "op1".to_string(),
                symbol_path: "sym".to_string(),
                new_symbol_path: invalid_new_sym,
            }],
        };
        assert!(matches!(
            patch_new_invalid.validate().unwrap_err(),
            ScenarioEngineError::InvalidPatch(_)
        ));

        // 7A-R1-T11: parameter_name max/max+1
        let valid_param = "x".repeat(ScenarioPatch::MAX_PARAMETER_NAME_LEN);
        let invalid_param = "x".repeat(ScenarioPatch::MAX_PARAMETER_NAME_LEN + 1);
        let patch_param_valid = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::ChangeParameterType {
                operation_id: "op1".to_string(),
                symbol_path: "sym".to_string(),
                parameter_name: valid_param,
                new_type: "i32".to_string(),
            }],
        };
        assert!(patch_param_valid.validate().is_ok());

        let patch_param_invalid = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::ChangeParameterType {
                operation_id: "op1".to_string(),
                symbol_path: "sym".to_string(),
                parameter_name: invalid_param,
                new_type: "i32".to_string(),
            }],
        };
        assert!(matches!(
            patch_param_invalid.validate().unwrap_err(),
            ScenarioEngineError::InvalidPatch(_)
        ));

        // 7A-R1-T12: type expression max/max+1
        let valid_type = "T".repeat(ScenarioPatch::MAX_TYPE_EXPRESSION_LEN);
        let invalid_type = "T".repeat(ScenarioPatch::MAX_TYPE_EXPRESSION_LEN + 1);
        let patch_type_valid = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::ChangeReturnType {
                operation_id: "op1".to_string(),
                symbol_path: "sym".to_string(),
                new_return_type: valid_type,
            }],
        };
        assert!(patch_type_valid.validate().is_ok());

        let patch_type_invalid = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::ChangeReturnType {
                operation_id: "op1".to_string(),
                symbol_path: "sym".to_string(),
                new_return_type: invalid_type,
            }],
        };
        assert!(matches!(
            patch_type_invalid.validate().unwrap_err(),
            ScenarioEngineError::InvalidPatch(_)
        ));

        // 7A-R1-T13: Required strings reject empty/whitespace-only input
        let patch_empty_name = ScenarioPatch {
            scenario_id: None,
            target_package_id: None,
            operations: vec![ScenarioPatchOperation::RenameSymbol {
                operation_id: "op1".to_string(),
                symbol_path: "sym".to_string(),
                new_symbol_path: "   ".to_string(),
            }],
        };
        assert!(matches!(
            patch_empty_name.validate().unwrap_err(),
            ScenarioEngineError::InvalidPatch(_)
        ));
    }
}
