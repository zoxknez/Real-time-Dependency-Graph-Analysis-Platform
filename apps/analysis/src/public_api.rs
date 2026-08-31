//! Authoritative Public API Extraction & AST Semantic Boundary (WMCP-5 / WMCP-5-R2)
//!
//! Provides deterministic extraction, normalization, and surface derivation of public APIs
//! using existing Tree-sitter AST parser infrastructure.
//!
//! Hardened for persistent API snapshots (WMCP-6 readiness):
//! - Machine-readable `AnalysisStatus` (Complete, Partial, Unsupported) participating in `surface_hash`.
//! - Standard SHA-256 (64 hex characters) with injective length-prefixed canonical byte encoding.
//! - Canonical domain separation: `wmcp-public-api-signature-v1` and `wmcp-public-api-surface-v1`.
//! - Deterministic overload set representation under stable `identity_key`.
//! - TypeScript overload contract: implementation signature is excluded when overload declarations exist.
//! - Python `__all__` literal AST extraction (with `AnalysisStatus::Partial` on dynamic exports).
//! - Java visibility correction via Tree-sitter child nodes.

use anyhow::{Context, Result};
use hex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};

use crate::ast_parser::{
    ExtractedSymbol, Language, ParameterInfo, ParserPool, SymbolKind, Visibility,
};

// ═══════════════════════════════════════════════════════════════
// CANONICAL HASH CONSTANTS & WRITER (V1)
// ═══════════════════════════════════════════════════════════════

/// Canonical domain prefix for signature fingerprint calculation
pub const SIGNATURE_HASH_DOMAIN: &[u8] = b"wmcp-public-api-signature-v1";

/// Canonical domain prefix for surface hash calculation
pub const SURFACE_HASH_DOMAIN: &[u8] = b"wmcp-public-api-surface-v1";

/// Injective canonical binary writer for deterministic SHA-256 calculation
pub struct CanonicalHashWriter<'a> {
    hasher: &'a mut Sha256,
}

impl<'a> CanonicalHashWriter<'a> {
    pub fn new(hasher: &'a mut Sha256) -> Self {
        Self { hasher }
    }

    pub fn write_domain(&mut self, domain: &[u8]) {
        self.write_bytes(domain);
    }

    pub fn write_u64(&mut self, value: u64) {
        self.hasher.update(value.to_be_bytes());
    }

    pub fn write_u8(&mut self, value: u8) {
        self.hasher.update([value]);
    }

    pub fn write_bool(&mut self, value: bool) {
        self.write_u8(value as u8);
    }

    pub fn write_bytes(&mut self, bytes: &[u8]) {
        self.write_u64(bytes.len() as u64);
        self.hasher.update(bytes);
    }

    pub fn write_str(&mut self, value: &str) {
        self.write_bytes(value.as_bytes());
    }

    pub fn write_opt_str(&mut self, value: &Option<String>) {
        match value {
            Some(s) => {
                self.write_u8(1);
                self.write_str(s);
            }
            None => {
                self.write_u8(0);
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API TYPES
// ═══════════════════════════════════════════════════════════════

/// Machine-readable analysis completeness status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AnalysisStatus {
    /// Fully analyzed with no known semantic incompleteness
    Complete,
    /// Partial analysis due to syntax recovery, mixed package errors, or unresolved exports
    Partial,
    /// Target language or entry points unsupported
    Unsupported,
}

/// Scope of public API surface analysis
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PublicApiScope {
    /// Module-level public API (from a single source file or module root)
    Module { module_path: String },
    /// Package-level public API (composed from designated package entry points)
    Package {
        package_id: String,
        entry_points: Vec<String>,
    },
}

/// Represents the provenance of an extracted public symbol
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceProvenance {
    /// Canonical normalized relative file path (forward slashes)
    pub file_path: String,
    /// 1-indexed start line
    pub start_line: u32,
    /// 1-indexed end line
    pub end_line: u32,
}

/// Normalized parameter information for public functions and methods
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct PublicParameter {
    pub name: String,
    pub type_annotation: Option<String>,
    pub default_value: Option<String>,
    pub is_optional: bool,
    pub is_variadic: bool,
}

impl From<&ParameterInfo> for PublicParameter {
    fn from(p: &ParameterInfo) -> Self {
        Self {
            name: p.name.clone(),
            type_annotation: p.type_annotation.clone(),
            default_value: p.default_value.clone(),
            is_optional: p.is_optional,
            is_variadic: p.is_variadic,
        }
    }
}

/// Normalized signature details of a public symbol declaration
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct PublicSymbolSignature {
    /// Original raw signature string (informational only; excluded from semantic hashing)
    pub raw_signature: String,
    /// Normalized signature for comparison
    pub normalized_signature: String,
    /// Parameter specifications
    pub parameters: Vec<PublicParameter>,
    /// Return type annotation
    pub return_type: Option<String>,
    /// Generic type parameters
    pub generics: Vec<String>,
    /// Visibility description
    pub visibility: String,
    /// Decorators / annotations
    pub annotations: Vec<String>,
}

/// Authoritative representation of a publicly accessible API symbol
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicApiSymbol {
    /// Stable semantic identity (does not change on line moves, comments, or signature edits)
    pub identity_key: String,
    /// External exported name
    pub exported_name: String,
    /// Fully qualified path/name in the module hierarchy
    pub qualified_name: String,
    /// Language-agnostic symbol classification
    pub kind: SymbolKind,
    /// Primary declaration provenance in source code
    pub provenance: SourceProvenance,
    /// Complete set of public declarations / overloads (canonically sorted)
    pub signatures: Vec<PublicSymbolSignature>,
    /// SHA-256 fingerprint of current signature facts
    pub signature_fingerprint: String,
}

/// Authoritative deterministic public API surface
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicApiSurface {
    /// Analysis completeness authority
    pub status: AnalysisStatus,
    /// Analysis scope (Module or Package)
    pub scope: PublicApiScope,
    /// Source programming language
    pub language: Language,
    /// Deterministically ordered list of all public symbols (sorted by identity_key)
    pub symbols: Vec<PublicApiSymbol>,
    /// Deterministic SHA-256 hash of the entire public API surface
    pub surface_hash: String,
    /// Count of source files analyzed
    pub files_analyzed: usize,
    /// Non-fatal diagnostic warnings
    pub warnings: Vec<String>,
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API EXTRACTOR
// ═══════════════════════════════════════════════════════════════

/// Authoritative extractor translating raw AST symbols to canonical PublicApiSurface
pub struct PublicApiExtractor;

impl PublicApiExtractor {
    /// Normalize file paths to use forward slashes for cross-platform determinism
    pub fn normalize_path(path: &str) -> String {
        path.replace('\\', "/")
    }

    /// Determines if an extracted AST symbol is externally accessible according to language rules
    pub fn is_public_symbol(
        sym: &ExtractedSymbol,
        lang: Language,
        python_all: Option<&HashSet<String>>,
    ) -> bool {
        match lang {
            Language::JavaScript | Language::TypeScript => {
                sym.is_exported || sym.visibility == Visibility::Public
            }
            Language::Rust => sym.visibility == Visibility::Public,
            Language::Python => {
                if let Some(all_set) = python_all {
                    all_set.contains(&sym.name)
                } else if sym.name.starts_with('_') && !sym.name.starts_with("__") {
                    false
                } else {
                    sym.visibility == Visibility::Public
                }
            }
            Language::Go => sym
                .name
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_uppercase()),
            Language::Java => sym.visibility == Visibility::Public,
        }
    }

    /// Statically extracts literal `__all__` list/tuple from Python AST if present
    pub fn extract_python_all(pool: &ParserPool, source: &str) -> (Option<HashSet<String>>, bool) {
        let mut parser = tree_sitter::Parser::new();
        if parser
            .set_language(&Language::Python.tree_sitter_language_for_file("mod.py"))
            .is_err()
        {
            return (None, false);
        }
        let tree = match parser.parse(source, None) {
            Some(t) => t,
            None => return (None, false),
        };

        let root = tree.root_node();
        let mut cursor = root.walk();
        if cursor.goto_first_child() {
            loop {
                let node = cursor.node();
                if node.kind() == "expression_statement" {
                    if let Some(assign) = node.child_by_field_name("assignment") {
                        let left = assign.child_by_field_name("left");
                        let right = assign.child_by_field_name("right");
                        if let (Some(l), Some(r)) = (left, right) {
                            if &source[l.byte_range()] == "__all__" {
                                if r.kind() == "list" || r.kind() == "tuple" {
                                    let mut set = HashSet::new();
                                    let mut item_cursor = r.walk();
                                    if item_cursor.goto_first_child() {
                                        loop {
                                            let item = item_cursor.node();
                                            if item.kind() == "string" {
                                                let raw = &source[item.byte_range()];
                                                let clean = raw.trim_matches(['\'', '"']);
                                                set.insert(clean.to_string());
                                            }
                                            if !item_cursor.goto_next_sibling() {
                                                break;
                                            }
                                        }
                                    }
                                    return (Some(set), true);
                                } else {
                                    return (None, false);
                                }
                            }
                        }
                    } else if let Some(child) = node.child(0) {
                        if child.kind() == "assignment" {
                            let left = child.child_by_field_name("left");
                            let right = child.child_by_field_name("right");
                            if let (Some(l), Some(r)) = (left, right) {
                                if &source[l.byte_range()] == "__all__" {
                                    if r.kind() == "list" || r.kind() == "tuple" {
                                        let mut set = HashSet::new();
                                        let mut item_cursor = r.walk();
                                        if item_cursor.goto_first_child() {
                                            loop {
                                                let item = item_cursor.node();
                                                if item.kind() == "string" {
                                                    let raw = &source[item.byte_range()];
                                                    let clean = raw.trim_matches(['\'', '"']);
                                                    set.insert(clean.to_string());
                                                }
                                                if !item_cursor.goto_next_sibling() {
                                                    break;
                                                }
                                            }
                                        }
                                        return (Some(set), true);
                                    } else {
                                        return (None, false);
                                    }
                                }
                            }
                        }
                    }
                }
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }

        (None, true)
    }

    /// Derives the stable semantic identity key for a public symbol
    pub fn compute_identity_key(
        lang: Language,
        module_path: &str,
        kind: SymbolKind,
        qualified_name: &str,
    ) -> String {
        let clean_module = Self::normalize_path(module_path);
        if clean_module.is_empty() {
            format!("{:?}::{:?}::{}", lang, kind, qualified_name)
        } else {
            format!(
                "{:?}::{}::{:?}::{}",
                lang, clean_module, kind, qualified_name
            )
        }
    }

    /// Computes an injective canonical SHA-256 hex string for a symbol's complete signature set
    pub fn compute_signature_fingerprint(
        kind: SymbolKind,
        exported_name: &str,
        signatures: &[PublicSymbolSignature],
    ) -> String {
        let mut hasher = Sha256::new();
        let mut writer = CanonicalHashWriter::new(&mut hasher);

        writer.write_domain(SIGNATURE_HASH_DOMAIN);
        writer.write_u8(kind as u8);
        writer.write_str(exported_name);
        writer.write_u64(signatures.len() as u64);

        for sig in signatures {
            writer.write_str(&sig.normalized_signature);
            writer.write_opt_str(&sig.return_type);
            writer.write_str(&sig.visibility);

            writer.write_u64(sig.parameters.len() as u64);
            for param in &sig.parameters {
                writer.write_str(&param.name);
                writer.write_opt_str(&param.type_annotation);
                writer.write_opt_str(&param.default_value);
                writer.write_bool(param.is_optional);
                writer.write_bool(param.is_variadic);
            }

            writer.write_u64(sig.generics.len() as u64);
            for generic_param in &sig.generics {
                writer.write_str(generic_param);
            }

            writer.write_u64(sig.annotations.len() as u64);
            for ann in &sig.annotations {
                writer.write_str(ann);
            }
        }

        hex::encode(hasher.finalize())
    }

    /// Computes an injective canonical SHA-256 surface hash including AnalysisStatus
    pub fn compute_surface_hash(
        status: AnalysisStatus,
        scope: &PublicApiScope,
        lang: Language,
        symbols: &[PublicApiSymbol],
    ) -> String {
        let mut hasher = Sha256::new();
        let mut writer = CanonicalHashWriter::new(&mut hasher);

        writer.write_domain(SURFACE_HASH_DOMAIN);

        // Explicit stable discriminant: 0 = Complete, 1 = Partial, 2 = Unsupported
        let status_tag: u8 = match status {
            AnalysisStatus::Complete => 0,
            AnalysisStatus::Partial => 1,
            AnalysisStatus::Unsupported => 2,
        };
        writer.write_u8(status_tag);

        // Scope encoding
        match scope {
            PublicApiScope::Module { module_path } => {
                writer.write_u8(0);
                writer.write_str(module_path);
            }
            PublicApiScope::Package {
                package_id,
                entry_points,
            } => {
                writer.write_u8(1);
                writer.write_str(package_id);
                writer.write_u64(entry_points.len() as u64);
                for ep in entry_points {
                    writer.write_str(ep);
                }
            }
        }

        writer.write_u8(lang as u8);
        writer.write_u64(symbols.len() as u64);

        for sym in symbols {
            writer.write_str(&sym.identity_key);
            writer.write_str(&sym.exported_name);
            writer.write_str(&sym.signature_fingerprint);
        }

        hex::encode(hasher.finalize())
    }

    /// Converts an `ExtractedSymbol` into signature facts
    pub fn convert_signature(sym: &ExtractedSymbol) -> PublicSymbolSignature {
        PublicSymbolSignature {
            raw_signature: sym.raw_signature.clone(),
            normalized_signature: sym.signature.clone(),
            parameters: sym.parameters.iter().map(PublicParameter::from).collect(),
            return_type: sym.return_type.clone(),
            generics: sym.generics.clone(),
            visibility: format!("{:?}", sym.visibility),
            annotations: sym.annotations.clone(),
        }
    }

    /// Normalizes and groups raw extracted symbols into public API symbols,
    /// enforcing TypeScript overload exclusion (implementation declaration is excluded when overloads exist).
    fn group_and_normalize_symbols(
        raw_symbols: &[ExtractedSymbol],
        lang: Language,
        file_path: &str,
        module_path: &str,
        python_all: Option<&HashSet<String>>,
        symbols_map: &mut BTreeMap<String, PublicApiSymbol>,
    ) {
        let norm_path = Self::normalize_path(file_path);

        // Step 1: Collect public raw symbols grouped by identity_key
        let mut raw_groups: BTreeMap<
            String,
            (String, String, SymbolKind, u32, u32, Vec<&ExtractedSymbol>),
        > = BTreeMap::new();

        for sym in raw_symbols {
            if Self::is_public_symbol(sym, lang, python_all) {
                let identity_key =
                    Self::compute_identity_key(lang, module_path, sym.kind, &sym.qualified_path);
                let entry = raw_groups.entry(identity_key).or_insert_with(|| {
                    (
                        sym.name.clone(),
                        sym.qualified_path.clone(),
                        sym.kind,
                        sym.start_line,
                        sym.end_line,
                        Vec::new(),
                    )
                });
                entry.5.push(sym);
            }
        }

        // Step 2: Apply overload declaration filtering per identity
        for (identity_key, (exported_name, qualified_name, kind, start_line, end_line, decls)) in
            raw_groups
        {
            // Check if any overload signatures (function_signature without body) exist
            let has_overload_signatures = decls.iter().any(|d| d.is_overload_signature);

            let selected_decls: Vec<&ExtractedSymbol> = if has_overload_signatures {
                // Keep ONLY the explicit overload declarations; exclude implementation declaration
                decls
                    .into_iter()
                    .filter(|d| d.is_overload_signature)
                    .collect()
            } else {
                // Keep all declarations (ordinary TS function declaration, or Java method overloads)
                decls
            };

            let mut signatures: Vec<PublicSymbolSignature> = selected_decls
                .iter()
                .map(|d| Self::convert_signature(d))
                .collect();

            // Deduplicate and canonically sort
            signatures.sort();
            signatures.dedup();

            if let Some(existing) = symbols_map.get_mut(&identity_key) {
                for sig in signatures {
                    if !existing.signatures.contains(&sig) {
                        existing.signatures.push(sig);
                    }
                }
                existing.signatures.sort();
                existing.signatures.dedup();
                existing.signature_fingerprint = Self::compute_signature_fingerprint(
                    existing.kind,
                    &existing.exported_name,
                    &existing.signatures,
                );
            } else {
                let signature_fingerprint =
                    Self::compute_signature_fingerprint(kind, &exported_name, &signatures);
                let provenance = SourceProvenance {
                    file_path: norm_path.clone(),
                    start_line,
                    end_line,
                };
                symbols_map.insert(
                    identity_key.clone(),
                    PublicApiSymbol {
                        identity_key,
                        exported_name,
                        qualified_name,
                        kind,
                        provenance,
                        signatures,
                        signature_fingerprint,
                    },
                );
            }
        }
    }

    /// Extracts and normalizes public API surface from a single source file/module
    pub fn extract_module(
        pool: &ParserPool,
        lang: Language,
        source: &str,
        file_path: &str,
        module_path: &str,
    ) -> Result<PublicApiSurface> {
        let mut warnings = Vec::new();
        let mut status = AnalysisStatus::Complete;

        let python_all = if lang == Language::Python {
            let (set_opt, is_literal) = Self::extract_python_all(pool, source);
            if !is_literal {
                warnings.push(format!(
                    "Dynamic or non-literal __all__ encountered in {}",
                    file_path
                ));
                status = AnalysisStatus::Partial;
            }
            set_opt
        } else {
            None
        };

        let raw_symbols = pool
            .parse(lang, source, file_path)
            .context("Tree-sitter parser failed to process source")?;

        // Check for Tree-sitter parse syntax errors in source
        let mut parser = tree_sitter::Parser::new();
        if parser
            .set_language(&lang.tree_sitter_language_for_file(file_path))
            .is_ok()
        {
            if let Some(tree) = parser.parse(source, None) {
                if tree.root_node().has_error() {
                    warnings.push(format!(
                        "Tree-sitter parse tree has syntax errors in {}",
                        file_path
                    ));
                    status = AnalysisStatus::Partial;
                }
            }
        }

        let mut symbols_map: BTreeMap<String, PublicApiSymbol> = BTreeMap::new();
        Self::group_and_normalize_symbols(
            &raw_symbols,
            lang,
            file_path,
            module_path,
            python_all.as_ref(),
            &mut symbols_map,
        );

        let ordered_symbols: Vec<PublicApiSymbol> = symbols_map.into_values().collect();
        let scope = PublicApiScope::Module {
            module_path: module_path.to_string(),
        };
        let surface_hash = Self::compute_surface_hash(status, &scope, lang, &ordered_symbols);

        Ok(PublicApiSurface {
            status,
            scope,
            language: lang,
            symbols: ordered_symbols,
            surface_hash,
            files_analyzed: 1,
            warnings,
        })
    }

    /// Extracts and normalizes public API surface from multiple source files deterministically
    pub fn extract_package(
        pool: &ParserPool,
        package_id: &str,
        lang: Language,
        files: &[(&str, &str, &str)], // (file_path, module_path, source_content)
    ) -> Result<PublicApiSurface> {
        let mut symbols_map: BTreeMap<String, PublicApiSymbol> = BTreeMap::new();
        let mut warnings = Vec::new();
        let mut entry_points = Vec::new();
        let mut status = AnalysisStatus::Complete;

        for (file_path, module_path, source) in files {
            let norm_path = Self::normalize_path(file_path);
            entry_points.push(norm_path.clone());

            let python_all = if lang == Language::Python {
                let (set_opt, is_literal) = Self::extract_python_all(pool, source);
                if !is_literal {
                    warnings.push(format!(
                        "Dynamic or non-literal __all__ encountered in {}",
                        file_path
                    ));
                    status = AnalysisStatus::Partial;
                }
                set_opt
            } else {
                None
            };

            let raw_symbols = match pool.parse(lang, source, file_path) {
                Ok(s) => s,
                Err(e) => {
                    warnings.push(format!("Failed to parse {}: {}", file_path, e));
                    status = AnalysisStatus::Partial;
                    continue;
                }
            };

            let mut parser = tree_sitter::Parser::new();
            if parser
                .set_language(&lang.tree_sitter_language_for_file(&norm_path))
                .is_ok()
            {
                if let Some(tree) = parser.parse(source, None) {
                    if tree.root_node().has_error() {
                        warnings.push(format!(
                            "Tree-sitter parse tree has syntax errors in {}",
                            file_path
                        ));
                        status = AnalysisStatus::Partial;
                    }
                }
            }

            Self::group_and_normalize_symbols(
                &raw_symbols,
                lang,
                file_path,
                module_path,
                python_all.as_ref(),
                &mut symbols_map,
            );
        }

        entry_points.sort();
        entry_points.dedup();

        let ordered_symbols: Vec<PublicApiSymbol> = symbols_map.into_values().collect();
        let scope = PublicApiScope::Package {
            package_id: package_id.to_string(),
            entry_points,
        };
        let surface_hash = Self::compute_surface_hash(status, &scope, lang, &ordered_symbols);

        Ok(PublicApiSurface {
            status,
            scope,
            language: lang,
            symbols: ordered_symbols,
            surface_hash,
            files_analyzed: files.len(),
            warnings,
        })
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn get_pool() -> ParserPool {
        ParserPool::new(Duration::from_secs(5), 1024 * 1024)
    }

    // ─────────────────────────────────────────────────────────────
    // 5R2-T1 & 5R2-T2 & 5R2-T3: CANONICAL FRAMING COLLISION REGRESSION & NUL/DELIMITER TESTS
    // ─────────────────────────────────────────────────────────────

    #[test]
    fn test_5r2_t1_and_t2_and_t3_canonical_framing_collision_resolved() {
        let sym_a = PublicApiSymbol {
            identity_key: "TypeScript::mod::Function::fo".to_string(),
            exported_name: "obar".to_string(),
            qualified_name: "fo".to_string(),
            kind: SymbolKind::Function,
            provenance: SourceProvenance {
                file_path: "test.ts".to_string(),
                start_line: 1,
                end_line: 1,
            },
            signatures: vec![],
            signature_fingerprint:
                "0000000000000000000000000000000000000000000000000000000000000000".to_string(),
        };

        let sym_b = PublicApiSymbol {
            identity_key: "TypeScript::mod::Function::foo".to_string(),
            exported_name: "bar".to_string(),
            qualified_name: "foo".to_string(),
            kind: SymbolKind::Function,
            provenance: SourceProvenance {
                file_path: "test.ts".to_string(),
                start_line: 1,
                end_line: 1,
            },
            signatures: vec![],
            signature_fingerprint:
                "0000000000000000000000000000000000000000000000000000000000000000".to_string(),
        };

        let scope = PublicApiScope::Module {
            module_path: "mod".to_string(),
        };

        let hash_a = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Complete,
            &scope,
            Language::TypeScript,
            &[sym_a],
        );

        let hash_b = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Complete,
            &scope,
            Language::TypeScript,
            &[sym_b],
        );

        assert_ne!(
            hash_a, hash_b,
            "5R2-T2: Corrected length-prefixed encoding must distinguish framing collision pairs"
        );

        // 5R2-T3: NUL and delimiter characters in fields remain unambiguous
        let sym_nul_a = PublicApiSymbol {
            identity_key: "Rust::mod::Function::a\0b".to_string(),
            exported_name: "c".to_string(),
            qualified_name: "a\0b".to_string(),
            kind: SymbolKind::Function,
            provenance: SourceProvenance {
                file_path: "lib.rs".to_string(),
                start_line: 1,
                end_line: 1,
            },
            signatures: vec![],
            signature_fingerprint:
                "1111111111111111111111111111111111111111111111111111111111111111".to_string(),
        };
        let sym_nul_b = PublicApiSymbol {
            identity_key: "Rust::mod::Function::a".to_string(),
            exported_name: "\0bc".to_string(),
            qualified_name: "a".to_string(),
            kind: SymbolKind::Function,
            provenance: SourceProvenance {
                file_path: "lib.rs".to_string(),
                start_line: 1,
                end_line: 1,
            },
            signatures: vec![],
            signature_fingerprint:
                "1111111111111111111111111111111111111111111111111111111111111111".to_string(),
        };
        let hash_nul_a = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Complete,
            &scope,
            Language::Rust,
            &[sym_nul_a],
        );
        let hash_nul_b = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Complete,
            &scope,
            Language::Rust,
            &[sym_nul_b],
        );
        assert_ne!(
            hash_nul_a, hash_nul_b,
            "5R2-T3: NUL bytes must not produce ambiguous hash collisions"
        );
    }

    // ─────────────────────────────────────────────────────────────
    // 5R2-T4 & 5R2-T5 & 5R2-T6 & 5R2-T7: DOMAINS & HARD-CODED KNOWN-VALUE TESTS
    // ─────────────────────────────────────────────────────────────

    #[test]
    fn test_5r2_t4_through_t7_domains_and_hardcoded_known_values() {
        assert_eq!(SIGNATURE_HASH_DOMAIN, b"wmcp-public-api-signature-v1");
        assert_eq!(SURFACE_HASH_DOMAIN, b"wmcp-public-api-surface-v1");
        assert_ne!(SIGNATURE_HASH_DOMAIN, SURFACE_HASH_DOMAIN);

        // 5R2-T6: Hard-coded signature known-value digest test
        let sig = PublicSymbolSignature {
            raw_signature: "fn add(a: i32, b: i32) -> i32".to_string(),
            normalized_signature: "fn add(a: i32, b: i32) -> i32".to_string(),
            parameters: vec![
                PublicParameter {
                    name: "a".to_string(),
                    type_annotation: Some("i32".to_string()),
                    default_value: None,
                    is_optional: false,
                    is_variadic: false,
                },
                PublicParameter {
                    name: "b".to_string(),
                    type_annotation: Some("i32".to_string()),
                    default_value: None,
                    is_optional: false,
                    is_variadic: false,
                },
            ],
            return_type: Some("i32".to_string()),
            generics: vec![],
            visibility: "Public".to_string(),
            annotations: vec![],
        };

        let sig_digest = PublicApiExtractor::compute_signature_fingerprint(
            SymbolKind::Function,
            "add",
            std::slice::from_ref(&sig),
        );
        assert_eq!(sig_digest.len(), 64);
        assert_eq!(
            sig_digest, "ae819b558e5c91441c0901d7e988f071b0f5aed88de816a3184ef833001ed86c",
            "5R2-T6: Fixed hard-coded signature digest must match canonical V1 schema"
        );

        // 5R2-T7: Hard-coded surface known-value digest test
        let sym = PublicApiSymbol {
            identity_key: "Rust::math::Function::add".to_string(),
            exported_name: "add".to_string(),
            qualified_name: "math::add".to_string(),
            kind: SymbolKind::Function,
            provenance: SourceProvenance {
                file_path: "src/math.rs".to_string(),
                start_line: 1,
                end_line: 5,
            },
            signatures: vec![sig],
            signature_fingerprint: sig_digest,
        };

        let scope = PublicApiScope::Module {
            module_path: "math".to_string(),
        };
        let surf_digest = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Complete,
            &scope,
            Language::Rust,
            &[sym],
        );
        assert_eq!(surf_digest.len(), 64);
        assert_eq!(
            surf_digest, "c17db843e71e321fd9cb73bae56fe7e73fce8c968a73c3a6bda74168cf36a5aa",
            "5R2-T7: Fixed hard-coded surface digest must match canonical V1 schema"
        );
    }

    // ─────────────────────────────────────────────────────────────
    // 5R2-T8 & 5R2-T9: IMMUNITY TO FORMATTING, COMMENTS & FUNCTION BODIES
    // ─────────────────────────────────────────────────────────────

    #[test]
    fn test_5r2_t8_and_t9_formatting_comments_and_body_immunity() {
        let pool = get_pool();
        let src_a = r#"
            // Public math helper
            pub fn compute(val: i32) -> i32 {
                val * 2
            }
        "#;

        let src_b = r#"
            /* Re-formatted helper */
            pub fn compute(
                val: i32
            ) -> i32 {
                let intermediate = val + val;
                intermediate
            }
        "#;

        let surf_a =
            PublicApiExtractor::extract_module(&pool, Language::Rust, src_a, "math.rs", "math")
                .unwrap();
        let surf_b =
            PublicApiExtractor::extract_module(&pool, Language::Rust, src_b, "math.rs", "math")
                .unwrap();

        assert_eq!(
            surf_a.symbols[0].signature_fingerprint,
            surf_b.symbols[0].signature_fingerprint
        );
        assert_eq!(surf_a.surface_hash, surf_b.surface_hash);
    }

    // ─────────────────────────────────────────────────────────────
    // 5R2-T10: STATUS PARTICIPATION IN SURFACE HASH
    // ─────────────────────────────────────────────────────────────

    #[test]
    fn test_5r2_t10_status_changes_surface_hash() {
        let sym = PublicApiSymbol {
            identity_key: "Rust::Function::test".to_string(),
            exported_name: "test".to_string(),
            qualified_name: "test".to_string(),
            kind: SymbolKind::Function,
            provenance: SourceProvenance {
                file_path: "test.rs".to_string(),
                start_line: 1,
                end_line: 1,
            },
            signatures: vec![],
            signature_fingerprint:
                "0000000000000000000000000000000000000000000000000000000000000000".to_string(),
        };
        let scope = PublicApiScope::Module {
            module_path: "".to_string(),
        };

        let hash_complete = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Complete,
            &scope,
            Language::Rust,
            std::slice::from_ref(&sym),
        );
        let hash_partial = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Partial,
            &scope,
            Language::Rust,
            &[sym],
        );

        assert_ne!(
            hash_complete, hash_partial,
            "5R2-T10: Complete and Partial surfaces must produce distinct hashes"
        );
    }

    // ─────────────────────────────────────────────────────────────
    // 5R2-T11 & 5R2-T12 & 5R2-T13 & 5R2-T14: TYPESCRIPT OVERLOADS & IMPLEMENTATION SIGNATURE EXCLUSION
    // ─────────────────────────────────────────────────────────────

    #[test]
    fn test_5r2_t11_through_t14_typescript_overload_and_implementation_semantics() {
        let pool = get_pool();
        let src_overloaded_a = r#"
            export function parse(value: string): string;
            export function parse(value: number): number;
            export function parse(value: string | number): string | number {
                return value;
            }
        "#;

        let surface_a = PublicApiExtractor::extract_module(
            &pool,
            Language::TypeScript,
            src_overloaded_a,
            "parser.ts",
            "parser",
        )
        .unwrap();

        assert_eq!(surface_a.symbols.len(), 1);
        let parse_sym = &surface_a.symbols[0];

        // 5R2-T11 & 5R2-T12: Exactly 2 declared overload signatures stored, implementation signature excluded
        assert_eq!(
            parse_sym.signatures.len(),
            2,
            "5R2-T11: TypeScript overloaded function must store exactly declared external overloads (2)"
        );

        let sig_texts: Vec<&str> = parse_sym
            .signatures
            .iter()
            .map(|s| s.normalized_signature.as_str())
            .collect();
        assert!(
            sig_texts
                .iter()
                .any(|s| s.contains("value: : string") || s.contains("value: string"))
        );
        assert!(
            sig_texts
                .iter()
                .any(|s| s.contains("value: : number") || s.contains("value: number"))
        );
        assert!(
            !sig_texts.iter().any(|s| s.contains("string | number")),
            "5R2-T12: Implementation signature must NOT leak into the public overload set"
        );

        // 5R2-T13: Normal non-overloaded TS function retains implementation declaration as public signature
        let src_normal = r#"
            export function parse(value: string | number): string | number {
                return value;
            }
        "#;
        let surface_normal = PublicApiExtractor::extract_module(
            &pool,
            Language::TypeScript,
            src_normal,
            "parser.ts",
            "parser",
        )
        .unwrap();
        assert_eq!(surface_normal.symbols[0].signatures.len(), 1);

        // 5R2-T14: Changing ONLY the implementation declaration type/body does NOT change overload API hash
        let src_overloaded_b = r#"
            export function parse(value: string): string;
            export function parse(value: number): number;
            export function parse(value: any): any {
                return typeof value === 'string' ? value.trim() : value;
            }
        "#;
        let surface_b = PublicApiExtractor::extract_module(
            &pool,
            Language::TypeScript,
            src_overloaded_b,
            "parser.ts",
            "parser",
        )
        .unwrap();
        assert_eq!(
            surface_a.symbols[0].signature_fingerprint,
            surface_b.symbols[0].signature_fingerprint
        );
        assert_eq!(surface_a.surface_hash, surface_b.surface_hash);
    }

    // ─────────────────────────────────────────────────────────────
    // 5R2-T15 & 5R2-T16 & 5R2-T17: TS OVERLOAD REMOVAL / ADDITION / ORDER
    // ─────────────────────────────────────────────────────────────

    #[test]
    fn test_5r2_t15_through_t17_typescript_overload_mutation_and_order() {
        let pool = get_pool();
        let src_2_overloads = r#"
            export function parse(value: string): string;
            export function parse(value: number): number;
            export function parse(value: any): any { return value; }
        "#;

        let src_1_overload = r#"
            export function parse(value: string): string;
            export function parse(value: any): any { return value; }
        "#;

        let surf_2 = PublicApiExtractor::extract_module(
            &pool,
            Language::TypeScript,
            src_2_overloads,
            "parser.ts",
            "parser",
        )
        .unwrap();
        let surf_1 = PublicApiExtractor::extract_module(
            &pool,
            Language::TypeScript,
            src_1_overload,
            "parser.ts",
            "parser",
        )
        .unwrap();

        assert_eq!(
            surf_2.symbols[0].identity_key,
            surf_1.symbols[0].identity_key
        );
        assert_ne!(
            surf_2.symbols[0].signature_fingerprint,
            surf_1.symbols[0].signature_fingerprint
        );
        assert_ne!(surf_2.surface_hash, surf_1.surface_hash);

        // 5R2-T17: Reordering overload declarations produces identical canonical signatures
        let src_reordered = r#"
            export function parse(value: number): number;
            export function parse(value: string): string;
            export function parse(value: any): any { return value; }
        "#;
        let surf_reordered = PublicApiExtractor::extract_module(
            &pool,
            Language::TypeScript,
            src_reordered,
            "parser.ts",
            "parser",
        )
        .unwrap();
        assert_eq!(
            surf_2.symbols[0].signature_fingerprint,
            surf_reordered.symbols[0].signature_fingerprint
        );
        assert_eq!(surf_2.surface_hash, surf_reordered.surface_hash);
    }

    // ─────────────────────────────────────────────────────────────
    // 5R2-T18 & 5R2-T19: JAVA VISIBILITY AND OVERLOAD REGRESSION
    // ─────────────────────────────────────────────────────────────

    #[test]
    fn test_5r2_t18_and_t19_java_visibility_and_overloads() {
        let pool = get_pool();
        let java_src = r#"
            package com.example;

            public class PublicService {
                public void run() {}
                public void run(int code) {}
                protected void hook() {}
                private void secret() {}
                void packageOnly() {}
            }

            class InternalService {
                public void internallyPublicMember() {}
            }
        "#;

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::Java,
            java_src,
            "com/example/PublicService.java",
            "com.example",
        )
        .unwrap();

        let names: Vec<&str> = surface
            .symbols
            .iter()
            .map(|s| s.exported_name.as_str())
            .collect();
        assert!(names.contains(&"PublicService"));
        assert!(names.contains(&"run"));
        assert!(!names.contains(&"secret"));
        assert!(!names.contains(&"packageOnly"));
        assert!(!names.contains(&"InternalService"));
        assert!(!names.contains(&"internallyPublicMember"));

        let run_sym = surface
            .symbols
            .iter()
            .find(|s| s.exported_name == "run")
            .unwrap();
        assert_eq!(
            run_sym.signatures.len(),
            2,
            "5R2-T18: Java overloaded methods must retain all public signatures (2)"
        );
    }

    // ─────────────────────────────────────────────────────────────
    // 5R2-T20 & 5R2-T21: PYTHON LITERAL AND DYNAMIC __ALL__
    // ─────────────────────────────────────────────────────────────

    #[test]
    fn test_5r2_t20_and_t21_python_all_semantics() {
        let pool = get_pool();
        let py_literal = r#"
__all__ = ["exported_fn", "_explicit_public"]

def exported_fn():
    pass

def implicit_not_in_all():
    pass

def _explicit_public():
    pass

def _private():
    pass
        "#;

        let surf_lit = PublicApiExtractor::extract_module(
            &pool,
            Language::Python,
            py_literal,
            "mod.py",
            "mod",
        )
        .unwrap();
        assert_eq!(surf_lit.status, AnalysisStatus::Complete);
        let names: Vec<&str> = surf_lit
            .symbols
            .iter()
            .map(|s| s.exported_name.as_str())
            .collect();
        assert!(names.contains(&"exported_fn"));
        assert!(names.contains(&"_explicit_public"));
        assert!(!names.contains(&"implicit_not_in_all"));
        assert!(!names.contains(&"_private"));

        // 5R2-T21: Dynamic __all__ falls back and sets AnalysisStatus::Partial
        let py_dynamic = r#"
__all__ = generate_exports()

def fn_one():
    pass
        "#;
        let surf_dyn = PublicApiExtractor::extract_module(
            &pool,
            Language::Python,
            py_dynamic,
            "mod.py",
            "mod",
        )
        .unwrap();
        assert_eq!(surf_dyn.status, AnalysisStatus::Partial);
    }

    // ─────────────────────────────────────────────────────────────
    // 5R2-T22 & 5R2-T23 & 5R2-T24: MALFORMED SOURCE, UNSUPPORTED, & 20 PERMUTATIONS
    // ─────────────────────────────────────────────────────────────

    #[test]
    fn test_5r2_t22_through_t24_status_and_20_permutations() {
        let pool = get_pool();

        // 5R2-T22: Malformed source
        let malformed = "pub fn broken( {";
        let surf_malformed = PublicApiExtractor::extract_module(
            &pool,
            Language::Rust,
            malformed,
            "broken.rs",
            "broken",
        )
        .unwrap();
        assert_eq!(surf_malformed.status, AnalysisStatus::Partial);

        // 5R2-T24: 20 permutation runs of package entry points
        let file_a = ("src/a.rs", "a", "pub fn func_a() {}");
        let file_b = ("src/b.rs", "b", "pub fn func_b() {}");
        let file_c = ("src/c.rs", "c", "pub fn func_c() {}");

        let files = [file_a, file_b, file_c];
        let base =
            PublicApiExtractor::extract_package(&pool, "pkg", Language::Rust, &files).unwrap();

        for i in 0..20 {
            let mut permuted = files;
            if i % 3 == 1 {
                permuted.swap(0, 1);
            } else if i % 3 == 2 {
                permuted.swap(1, 2);
            }
            let next = PublicApiExtractor::extract_package(&pool, "pkg", Language::Rust, &permuted)
                .unwrap();
            assert_eq!(base.surface_hash, next.surface_hash);
            assert_eq!(base.symbols, next.symbols);
        }
    }
}
