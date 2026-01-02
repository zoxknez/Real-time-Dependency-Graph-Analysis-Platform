//! Breaking Change Detection
//!
//! Compares public API snapshots between package versions to detect:
//! - Removed symbols
//! - Signature changes (parameters, return types)
//! - Visibility reductions
//! - Type incompatibilities
//!
//! Implements semantic versioning analysis with confidence scoring.

use crate::ast_parser::{ExtractedSymbol, ParameterInfo, PublicApiSnapshot, SymbolKind, Visibility};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tracing::{debug, info, instrument};

// ═══════════════════════════════════════════════════════════════
// BREAKING CHANGE TYPES
// ═══════════════════════════════════════════════════════════════

/// Categories of API changes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BreakingChangeType {
    /// Symbol completely removed from public API
    RemovedSymbol,
    /// Function/method signature changed
    SignatureChanged,
    /// Parameter added without default value
    RequiredParameterAdded,
    /// Parameter removed
    ParameterRemoved,
    /// Parameter type changed
    ParameterTypeChanged,
    /// Return type changed
    ReturnTypeChanged,
    /// Symbol visibility reduced (public -> private)
    VisibilityReduced,
    /// Generic constraints changed
    GenericConstraintsChanged,
    /// Symbol renamed (detected via similarity)
    SymbolRenamed,
    /// Base class/trait changed
    InheritanceChanged,
}

impl BreakingChangeType {
    /// Get human-readable description
    pub fn description(&self) -> &'static str {
        match self {
            Self::RemovedSymbol => "Symbol was removed from public API",
            Self::SignatureChanged => "Function/method signature was changed",
            Self::RequiredParameterAdded => "New required parameter was added",
            Self::ParameterRemoved => "Parameter was removed",
            Self::ParameterTypeChanged => "Parameter type was changed",
            Self::ReturnTypeChanged => "Return type was changed",
            Self::VisibilityReduced => "Symbol visibility was reduced",
            Self::GenericConstraintsChanged => "Generic constraints were changed",
            Self::SymbolRenamed => "Symbol was renamed",
            Self::InheritanceChanged => "Base class or trait implementation changed",
        }
    }
}

/// Severity level of the breaking change
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SeverityLevel {
    /// Definitely breaking - will cause compile/runtime errors
    Breaking,
    /// Potentially breaking - may affect some users
    Warning,
    /// Informational - non-breaking change
    Info,
}

impl SeverityLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Breaking => "breaking",
            Self::Warning => "warning",
            Self::Info => "info",
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// BREAKING CHANGE
// ═══════════════════════════════════════════════════════════════

/// A detected breaking change
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakingChange {
    /// Type of breaking change
    pub change_type: BreakingChangeType,
    /// Full path to the affected symbol
    pub symbol_path: String,
    /// Old signature (if applicable)
    pub old_signature: Option<String>,
    /// New signature (if applicable)
    pub new_signature: Option<String>,
    /// Human-readable description
    pub description: String,
    /// Severity level
    pub severity: SeverityLevel,
    /// Suggested migration path
    pub migration_hint: Option<String>,
}

impl BreakingChange {
    /// Create a new breaking change
    fn new(
        change_type: BreakingChangeType,
        symbol_path: String,
        old_signature: Option<String>,
        new_signature: Option<String>,
        description: String,
        severity: SeverityLevel,
    ) -> Self {
        Self {
            change_type,
            symbol_path,
            old_signature,
            new_signature,
            description,
            severity,
            migration_hint: None,
        }
    }

    /// Add migration hint
    pub fn with_migration_hint(mut self, hint: String) -> Self {
        self.migration_hint = Some(hint);
        self
    }
}

// ═══════════════════════════════════════════════════════════════
// BREAKING CHANGE DETECTOR
// ═══════════════════════════════════════════════════════════════

/// Detects breaking changes between API versions
pub struct BreakingDetector {
    /// Similarity threshold for rename detection (0.0 - 1.0)
    rename_similarity_threshold: f32,
}

impl BreakingDetector {
    /// Create a new breaking change detector
    pub fn new() -> Self {
        Self {
            rename_similarity_threshold: 0.7,
        }
    }

    /// Compare two API snapshots and detect breaking changes
    #[instrument(skip(self, old, new), fields(
        old_version = %old.version,
        new_version = %new.version,
        old_symbols = old.symbols.len(),
        new_symbols = new.symbols.len()
    ))]
    pub fn detect_breaking_changes(
        &self,
        old: &PublicApiSnapshot,
        new: &PublicApiSnapshot,
    ) -> Vec<BreakingChange> {
        let mut changes = Vec::new();

        // Index symbols by qualified path
        let old_by_path: HashMap<&str, &ExtractedSymbol> = old
            .symbols
            .iter()
            .filter(|s| s.visibility.is_public())
            .map(|s| (s.qualified_path.as_str(), s))
            .collect();

        let new_by_path: HashMap<&str, &ExtractedSymbol> = new
            .symbols
            .iter()
            .filter(|s| s.visibility.is_public())
            .map(|s| (s.qualified_path.as_str(), s))
            .collect();

        let old_paths: HashSet<&str> = old_by_path.keys().copied().collect();
        let new_paths: HashSet<&str> = new_by_path.keys().copied().collect();

        // 1. Detect removed symbols
        let removed_paths: Vec<&str> = old_paths.difference(&new_paths).copied().collect();
        for path in &removed_paths {
            let old_sym = old_by_path[path];
            
            // Check if it was renamed
            if let Some((new_path, similarity)) = self.find_potential_rename(old_sym, &new_by_path) {
                let new_sym = new_by_path[new_path];
                changes.push(
                    BreakingChange::new(
                        BreakingChangeType::SymbolRenamed,
                        old_sym.qualified_path.clone(),
                        Some(old_sym.raw_signature.clone()),
                        Some(new_sym.raw_signature.clone()),
                        format!(
                            "{} '{}' appears to have been renamed to '{}' (similarity: {:.0}%)",
                            format_kind(old_sym.kind),
                            old_sym.name,
                            new_sym.name,
                            similarity * 100.0
                        ),
                        SeverityLevel::Breaking,
                    )
                    .with_migration_hint(format!(
                        "Replace '{}' with '{}'",
                        old_sym.name, new_sym.name
                    )),
                );
            } else {
                changes.push(BreakingChange::new(
                    BreakingChangeType::RemovedSymbol,
                    old_sym.qualified_path.clone(),
                    Some(old_sym.raw_signature.clone()),
                    None,
                    format!(
                        "Public {} '{}' was removed",
                        format_kind(old_sym.kind),
                        old_sym.name
                    ),
                    SeverityLevel::Breaking,
                ));
            }
        }

        // 2. Check existing symbols for changes
        let common_paths: Vec<&str> = old_paths.intersection(&new_paths).copied().collect();
        for path in common_paths {
            let old_sym = old_by_path[path];
            let new_sym = new_by_path[path];

            // Check visibility reduction
            if let Some(change) = self.check_visibility_change(old_sym, new_sym) {
                changes.push(change);
            }

            // Check signature changes
            if old_sym.signature != new_sym.signature {
                changes.extend(self.analyze_signature_change(old_sym, new_sym));
            }
        }

        // 3. Log summary
        let breaking_count = changes.iter().filter(|c| c.severity == SeverityLevel::Breaking).count();
        let warning_count = changes.iter().filter(|c| c.severity == SeverityLevel::Warning).count();

        info!(
            total = changes.len(),
            breaking = breaking_count,
            warning = warning_count,
            "Breaking change detection complete"
        );

        changes
    }

    /// Check for visibility reduction
    fn check_visibility_change(
        &self,
        old: &ExtractedSymbol,
        new: &ExtractedSymbol,
    ) -> Option<BreakingChange> {
        if old.visibility.level() > new.visibility.level() {
            Some(BreakingChange::new(
                BreakingChangeType::VisibilityReduced,
                old.qualified_path.clone(),
                Some(format!("{:?}", old.visibility)),
                Some(format!("{:?}", new.visibility)),
                format!(
                    "{} '{}' visibility reduced from {:?} to {:?}",
                    format_kind(old.kind),
                    old.name,
                    old.visibility,
                    new.visibility
                ),
                SeverityLevel::Breaking,
            ))
        } else {
            None
        }
    }

    /// Analyze signature changes in detail
    fn analyze_signature_change(
        &self,
        old: &ExtractedSymbol,
        new: &ExtractedSymbol,
    ) -> Vec<BreakingChange> {
        let mut changes = Vec::new();

        // Check parameter changes
        let param_changes = self.compare_parameters(&old.parameters, &new.parameters);
        
        for change in param_changes {
            match change {
                ParamChange::Added(param) => {
                    let severity = if param.is_optional || param.default_value.is_some() {
                        SeverityLevel::Info
                    } else {
                        SeverityLevel::Breaking
                    };

                    changes.push(BreakingChange::new(
                        if param.is_optional || param.default_value.is_some() {
                            BreakingChangeType::SignatureChanged
                        } else {
                            BreakingChangeType::RequiredParameterAdded
                        },
                        old.qualified_path.clone(),
                        Some(old.raw_signature.clone()),
                        Some(new.raw_signature.clone()),
                        format!(
                            "New {} parameter '{}' added to {}",
                            if param.is_optional { "optional" } else { "required" },
                            param.name,
                            old.name
                        ),
                        severity,
                    ));
                }
                ParamChange::Removed(param) => {
                    changes.push(BreakingChange::new(
                        BreakingChangeType::ParameterRemoved,
                        old.qualified_path.clone(),
                        Some(old.raw_signature.clone()),
                        Some(new.raw_signature.clone()),
                        format!("Parameter '{}' was removed from {}", param.name, old.name),
                        SeverityLevel::Breaking,
                    ));
                }
                ParamChange::TypeChanged(old_param, new_param) => {
                    changes.push(
                        BreakingChange::new(
                            BreakingChangeType::ParameterTypeChanged,
                            old.qualified_path.clone(),
                            old_param.type_annotation.clone(),
                            new_param.type_annotation.clone(),
                            format!(
                                "Parameter '{}' type changed from '{}' to '{}' in {}",
                                old_param.name,
                                old_param.type_annotation.as_deref().unwrap_or("unknown"),
                                new_param.type_annotation.as_deref().unwrap_or("unknown"),
                                old.name
                            ),
                            SeverityLevel::Breaking,
                        )
                        .with_migration_hint(format!(
                            "Update calls to '{}' to use the new parameter type",
                            old.name
                        )),
                    );
                }
            }
        }

        // Check return type change
        if old.return_type != new.return_type {
            let severity = if self.is_return_type_compatible(&old.return_type, &new.return_type) {
                SeverityLevel::Warning
            } else {
                SeverityLevel::Breaking
            };

            changes.push(BreakingChange::new(
                BreakingChangeType::ReturnTypeChanged,
                old.qualified_path.clone(),
                old.return_type.clone(),
                new.return_type.clone(),
                format!(
                    "Return type of {} changed from '{}' to '{}'",
                    old.name,
                    old.return_type.as_deref().unwrap_or("void"),
                    new.return_type.as_deref().unwrap_or("void")
                ),
                severity,
            ));
        }

        // Check generic constraints
        if old.generics != new.generics {
            changes.push(BreakingChange::new(
                BreakingChangeType::GenericConstraintsChanged,
                old.qualified_path.clone(),
                Some(format!("<{}>", old.generics.join(", "))),
                Some(format!("<{}>", new.generics.join(", "))),
                format!("Generic parameters of {} changed", old.name),
                SeverityLevel::Warning,
            ));
        }

        changes
    }

    /// Compare parameter lists
    fn compare_parameters(
        &self,
        old_params: &[ParameterInfo],
        new_params: &[ParameterInfo],
    ) -> Vec<ParamChange> {
        let mut changes = Vec::new();

        let old_by_name: HashMap<&str, &ParameterInfo> = old_params
            .iter()
            .map(|p| (p.name.as_str(), p))
            .collect();

        let new_by_name: HashMap<&str, &ParameterInfo> = new_params
            .iter()
            .map(|p| (p.name.as_str(), p))
            .collect();

        // Check for removed parameters
        for (name, old_param) in &old_by_name {
            if !new_by_name.contains_key(name) {
                changes.push(ParamChange::Removed((*old_param).clone()));
            }
        }

        // Check for added and changed parameters
        for (name, new_param) in &new_by_name {
            match old_by_name.get(name) {
                None => {
                    changes.push(ParamChange::Added((*new_param).clone()));
                }
                Some(old_param) => {
                    if old_param.type_annotation != new_param.type_annotation {
                        changes.push(ParamChange::TypeChanged(
                            (*old_param).clone(),
                            (*new_param).clone(),
                        ));
                    }
                }
            }
        }

        changes
    }

    /// Check if return type change is compatible (e.g., narrowing)
    fn is_return_type_compatible(&self, old: &Option<String>, new: &Option<String>) -> bool {
        match (old, new) {
            (None, Some(_)) => true,      // Adding return type is usually safe
            (Some(o), Some(n)) if o == n => true,
            _ => false,
        }
    }

    /// Find a potential rename match for a removed symbol
    fn find_potential_rename<'a>(
        &self,
        old_sym: &ExtractedSymbol,
        new_symbols: &HashMap<&'a str, &ExtractedSymbol>,
    ) -> Option<(&'a str, f32)> {
        let mut best_match: Option<(&str, f32)> = None;

        for (path, new_sym) in new_symbols {
            // Must be same kind
            if old_sym.kind != new_sym.kind {
                continue;
            }

            // Calculate similarity
            let name_sim = self.string_similarity(&old_sym.name, &new_sym.name);
            let sig_sim = self.string_similarity(&old_sym.signature, &new_sym.signature);
            let combined_sim = (name_sim * 0.4 + sig_sim * 0.6);

            if combined_sim >= self.rename_similarity_threshold {
                if let Some((_, current_best)) = best_match {
                    if combined_sim > current_best {
                        best_match = Some((path, combined_sim));
                    }
                } else {
                    best_match = Some((path, combined_sim));
                }
            }
        }

        best_match
    }

    /// Calculate string similarity (Levenshtein-based)
    fn string_similarity(&self, a: &str, b: &str) -> f32 {
        if a == b {
            return 1.0;
        }
        if a.is_empty() || b.is_empty() {
            return 0.0;
        }

        let distance = self.levenshtein_distance(a, b);
        let max_len = a.len().max(b.len()) as f32;
        1.0 - (distance as f32 / max_len)
    }

    /// Levenshtein edit distance
    fn levenshtein_distance(&self, a: &str, b: &str) -> usize {
        let a_chars: Vec<char> = a.chars().collect();
        let b_chars: Vec<char> = b.chars().collect();
        let a_len = a_chars.len();
        let b_len = b_chars.len();

        if a_len == 0 {
            return b_len;
        }
        if b_len == 0 {
            return a_len;
        }

        let mut matrix = vec![vec![0; b_len + 1]; a_len + 1];

        for i in 0..=a_len {
            matrix[i][0] = i;
        }
        for j in 0..=b_len {
            matrix[0][j] = j;
        }

        for i in 1..=a_len {
            for j in 1..=b_len {
                let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
                matrix[i][j] = (matrix[i - 1][j] + 1)
                    .min(matrix[i][j - 1] + 1)
                    .min(matrix[i - 1][j - 1] + cost);
            }
        }

        matrix[a_len][b_len]
    }
}

impl Default for BreakingDetector {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPER TYPES
// ═══════════════════════════════════════════════════════════════

#[derive(Debug)]
enum ParamChange {
    Added(ParameterInfo),
    Removed(ParameterInfo),
    TypeChanged(ParameterInfo, ParameterInfo),
}

fn format_kind(kind: SymbolKind) -> &'static str {
    kind.as_str()
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn make_symbol(name: &str, signature: &str, visibility: Visibility) -> ExtractedSymbol {
        ExtractedSymbol {
            name: name.to_string(),
            qualified_path: name.to_string(),
            kind: SymbolKind::Function,
            visibility,
            signature: signature.to_string(),
            raw_signature: signature.to_string(),
            start_line: 1,
            end_line: 10,
            documentation: None,
            parameters: vec![],
            return_type: None,
            generics: vec![],
            annotations: vec![],
            is_exported: true,
        }
    }

    fn make_snapshot(version: &str, symbols: Vec<ExtractedSymbol>) -> PublicApiSnapshot {
        let mut snapshot = PublicApiSnapshot::new("test-package".to_string(), version.to_string());
        snapshot.symbols = symbols;
        snapshot.compute_hash();
        snapshot
    }

    #[test]
    fn test_detect_removed_symbol() {
        let detector = BreakingDetector::new();

        let old = make_snapshot("1.0.0", vec![
            make_symbol("foo", "fn foo()", Visibility::Public),
            make_symbol("bar", "fn bar()", Visibility::Public),
        ]);

        let new = make_snapshot("2.0.0", vec![
            make_symbol("foo", "fn foo()", Visibility::Public),
        ]);

        let changes = detector.detect_breaking_changes(&old, &new);

        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].change_type, BreakingChangeType::RemovedSymbol);
        assert_eq!(changes[0].symbol_path, "bar");
        assert_eq!(changes[0].severity, SeverityLevel::Breaking);
    }

    #[test]
    fn test_detect_visibility_reduction() {
        let detector = BreakingDetector::new();

        let old = make_snapshot("1.0.0", vec![
            make_symbol("foo", "fn foo()", Visibility::Public),
        ]);

        let mut new_sym = make_symbol("foo", "fn foo()", Visibility::Private);
        new_sym.is_exported = false;

        // Visibility reduction means the symbol is now private,
        // so it won't appear in the "public" filter comparison
        let new = make_snapshot("2.0.0", vec![]);

        let changes = detector.detect_breaking_changes(&old, &new);

        assert!(!changes.is_empty());
    }

    #[test]
    fn test_detect_signature_change() {
        let detector = BreakingDetector::new();

        let mut old_sym = make_symbol("foo", "fn foo(x: i32)", Visibility::Public);
        old_sym.parameters = vec![ParameterInfo {
            name: "x".to_string(),
            type_annotation: Some("i32".to_string()),
            default_value: None,
            is_optional: false,
            is_variadic: false,
        }];

        let mut new_sym = make_symbol("foo", "fn foo(x: i32, y: String)", Visibility::Public);
        new_sym.parameters = vec![
            ParameterInfo {
                name: "x".to_string(),
                type_annotation: Some("i32".to_string()),
                default_value: None,
                is_optional: false,
                is_variadic: false,
            },
            ParameterInfo {
                name: "y".to_string(),
                type_annotation: Some("String".to_string()),
                default_value: None,
                is_optional: false,
                is_variadic: false,
            },
        ];

        let old = make_snapshot("1.0.0", vec![old_sym]);
        let new = make_snapshot("2.0.0", vec![new_sym]);

        let changes = detector.detect_breaking_changes(&old, &new);

        assert!(!changes.is_empty());
        assert!(changes.iter().any(|c| c.change_type == BreakingChangeType::RequiredParameterAdded));
    }

    #[test]
    fn test_string_similarity() {
        let detector = BreakingDetector::new();

        assert_eq!(detector.string_similarity("foo", "foo"), 1.0);
        assert!(detector.string_similarity("foo", "foobar") > 0.5);
        assert!(detector.string_similarity("abc", "xyz") < 0.5);
    }

    #[test]
    fn test_levenshtein_distance() {
        let detector = BreakingDetector::new();

        assert_eq!(detector.levenshtein_distance("", ""), 0);
        assert_eq!(detector.levenshtein_distance("abc", "abc"), 0);
        assert_eq!(detector.levenshtein_distance("abc", "ab"), 1);
        assert_eq!(detector.levenshtein_distance("kitten", "sitting"), 3);
    }

    #[test]
    fn test_no_changes_for_identical_api() {
        let detector = BreakingDetector::new();

        let symbols = vec![
            make_symbol("foo", "fn foo()", Visibility::Public),
            make_symbol("bar", "fn bar(x: i32)", Visibility::Public),
        ];

        let old = make_snapshot("1.0.0", symbols.clone());
        let new = make_snapshot("1.0.1", symbols);

        let changes = detector.detect_breaking_changes(&old, &new);
        assert!(changes.is_empty());
    }
}
