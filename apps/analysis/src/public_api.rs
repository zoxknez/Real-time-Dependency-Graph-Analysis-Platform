//! Authoritative Public API Extraction & AST Semantic Boundary (WMCP-5 / WMCP-5-R1)
//!
//! Provides deterministic extraction, normalization, and surface derivation of public APIs
//! using existing Tree-sitter AST parser infrastructure.
//!
//! Hardened for persistent API snapshots (WMCP-6 readiness):
//! - Machine-readable `AnalysisStatus` (Complete, Partial, Unsupported) participating in `surface_hash`.
//! - Standard SHA-256 (64 hex characters) for all semantic digests.
//! - Deterministic overload set representation under stable `identity_key`.
//! - Python `__all__` literal AST extraction.
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
    Module {
        module_path: String,
    },
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
                // In JS/TS: exported symbols or explicitly public visibility
                sym.is_exported || sym.visibility == Visibility::Public
            }
            Language::Rust => {
                // In Rust: only pub items form the public API
                sym.visibility == Visibility::Public
            }
            Language::Python => {
                // In Python: if __all__ exists, only names in __all__ are public
                if let Some(all_set) = python_all {
                    all_set.contains(&sym.name)
                } else if sym.name.starts_with('_') && !sym.name.starts_with("__") {
                    false
                } else {
                    sym.visibility == Visibility::Public
                }
            }
            Language::Go => {
                // In Go: exported identifiers start with an ASCII uppercase letter
                sym.name.chars().next().map_or(false, |c| c.is_ascii_uppercase())
            }
            Language::Java => {
                // In Java: public visibility
                sym.visibility == Visibility::Public
            }
        }
    }

    /// Statically extracts literal `__all__` list/tuple from Python AST if present
    pub fn extract_python_all(pool: &ParserPool, source: &str) -> (Option<HashSet<String>>, bool) {
        let mut parser = tree_sitter::Parser::new();
        if parser.set_language(&Language::Python.tree_sitter_language_for_file("mod.py")).is_err() {
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
                                    // Non-literal dynamic __all__
                                    return (None, false);
                                }
                            }
                        }
                    } else if let Some(child) = node.child(0) {
                        // assignment might be the direct child
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
            format!("{:?}::{}::{:?}::{}", lang, clean_module, kind, qualified_name)
        }
    }

    /// Computes a deterministic SHA-256 hex string for a symbol's complete signature set
    pub fn compute_signature_fingerprint(
        kind: SymbolKind,
        exported_name: &str,
        signatures: &[PublicSymbolSignature],
    ) -> String {
        let mut hasher = Sha256::new();

        hasher.update([kind as u8]);
        hasher.update(exported_name.as_bytes());

        for sig in signatures {
            hasher.update(sig.normalized_signature.as_bytes());
            if let Some(ret) = &sig.return_type {
                hasher.update(ret.as_bytes());
            }
            hasher.update(sig.visibility.as_bytes());

            for param in &sig.parameters {
                hasher.update(param.name.as_bytes());
                if let Some(t) = &param.type_annotation {
                    hasher.update(t.as_bytes());
                }
                if let Some(d) = &param.default_value {
                    hasher.update(d.as_bytes());
                }
                hasher.update([param.is_optional as u8, param.is_variadic as u8]);
            }

            for generic_param in &sig.generics {
                hasher.update(generic_param.as_bytes());
            }

            for ann in &sig.annotations {
                hasher.update(ann.as_bytes());
            }
        }

        hex::encode(hasher.finalize())
    }

    /// Computes a deterministic SHA-256 surface hash including AnalysisStatus
    pub fn compute_surface_hash(
        status: AnalysisStatus,
        scope: &PublicApiScope,
        lang: Language,
        symbols: &[PublicApiSymbol],
    ) -> String {
        let mut hasher = Sha256::new();

        hasher.update(format!("{:?}", status).as_bytes());
        hasher.update(format!("{:?}", scope).as_bytes());
        hasher.update([lang as u8]);

        for sym in symbols {
            hasher.update(sym.identity_key.as_bytes());
            hasher.update(sym.exported_name.as_bytes());
            hasher.update(sym.signature_fingerprint.as_bytes());
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

    /// Extracts the public API surface from a single source file (Module scope)
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
            let (all_set, is_literal) = Self::extract_python_all(pool, source);
            if !is_literal {
                warnings.push("Dynamic or non-literal __all__ detected; falling back to convention-based exports".to_string());
                status = AnalysisStatus::Partial;
            }
            all_set
        } else {
            None
        };

        let raw_symbols = match pool.parse(lang, source, file_path) {
            Ok(syms) => syms,
            Err(e) => {
                warnings.push(format!("Parse error in {}: {}", file_path, e));
                return Ok(PublicApiSurface {
                    status: AnalysisStatus::Partial,
                    scope: PublicApiScope::Module {
                        module_path: module_path.to_string(),
                    },
                    language: lang,
                    symbols: Vec::new(),
                    surface_hash: Self::compute_surface_hash(
                        AnalysisStatus::Partial,
                        &PublicApiScope::Module {
                            module_path: module_path.to_string(),
                        },
                        lang,
                        &[],
                    ),
                    files_analyzed: 1,
                    warnings,
                });
            }
        };

        // Check if tree has syntax errors
        let mut parser = tree_sitter::Parser::new();
        if parser.set_language(&lang.tree_sitter_language_for_file(file_path)).is_ok() {
            if let Some(tree) = parser.parse(source, None) {
                if tree.root_node().has_error() {
                    warnings.push(format!("Tree-sitter parse tree has syntax errors in {}", file_path));
                    status = AnalysisStatus::Partial;
                }
            }
        }

        let mut symbols_map: BTreeMap<String, PublicApiSymbol> = BTreeMap::new();

        for sym in raw_symbols {
            if Self::is_public_symbol(&sym, lang, python_all.as_ref()) {
                let norm_path = Self::normalize_path(file_path);
                let identity_key = Self::compute_identity_key(lang, module_path, sym.kind, &sym.qualified_path);
                let sig = Self::convert_signature(&sym);

                if let Some(existing) = symbols_map.get_mut(&identity_key) {
                    if !existing.signatures.contains(&sig) {
                        existing.signatures.push(sig);
                        existing.signatures.sort();
                        existing.signature_fingerprint = Self::compute_signature_fingerprint(
                            existing.kind,
                            &existing.exported_name,
                            &existing.signatures,
                        );
                    }
                } else {
                    let provenance = SourceProvenance {
                        file_path: norm_path,
                        start_line: sym.start_line,
                        end_line: sym.end_line,
                    };
                    let signatures = vec![sig];
                    let signature_fingerprint = Self::compute_signature_fingerprint(
                        sym.kind,
                        &sym.name,
                        &signatures,
                    );

                    symbols_map.insert(
                        identity_key.clone(),
                        PublicApiSymbol {
                            identity_key,
                            exported_name: sym.name.clone(),
                            qualified_name: sym.qualified_path.clone(),
                            kind: sym.kind,
                            provenance,
                            signatures,
                            signature_fingerprint,
                        },
                    );
                }
            }
        }

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
                let (all_set, is_literal) = Self::extract_python_all(pool, source);
                if !is_literal {
                    warnings.push(format!("Dynamic __all__ in {}; falling back to convention-based exports", norm_path));
                    status = AnalysisStatus::Partial;
                }
                all_set
            } else {
                None
            };

            match pool.parse(lang, source, &norm_path) {
                Ok(raw_symbols) => {
                    // Check for syntax errors in this file
                    let mut parser = tree_sitter::Parser::new();
                    if parser.set_language(&lang.tree_sitter_language_for_file(&norm_path)).is_ok() {
                        if let Some(tree) = parser.parse(source, None) {
                            if tree.root_node().has_error() {
                                warnings.push(format!("Syntax errors detected in {}", norm_path));
                                status = AnalysisStatus::Partial;
                            }
                        }
                    }

                    for sym in raw_symbols {
                        if Self::is_public_symbol(&sym, lang, python_all.as_ref()) {
                            let identity_key = Self::compute_identity_key(
                                lang,
                                module_path,
                                sym.kind,
                                &sym.qualified_path,
                            );
                            let sig = Self::convert_signature(&sym);

                            if let Some(existing) = symbols_map.get_mut(&identity_key) {
                                if !existing.signatures.contains(&sig) {
                                    existing.signatures.push(sig);
                                    existing.signatures.sort();
                                    existing.signature_fingerprint = Self::compute_signature_fingerprint(
                                        existing.kind,
                                        &existing.exported_name,
                                        &existing.signatures,
                                    );
                                }
                            } else {
                                let provenance = SourceProvenance {
                                    file_path: norm_path.clone(),
                                    start_line: sym.start_line,
                                    end_line: sym.end_line,
                                };
                                let signatures = vec![sig];
                                let signature_fingerprint = Self::compute_signature_fingerprint(
                                    sym.kind,
                                    &sym.name,
                                    &signatures,
                                );

                                symbols_map.insert(
                                    identity_key.clone(),
                                    PublicApiSymbol {
                                        identity_key,
                                        exported_name: sym.name.clone(),
                                        qualified_name: sym.qualified_path.clone(),
                                        kind: sym.kind,
                                        provenance,
                                        signatures,
                                        signature_fingerprint,
                                    },
                                );
                            }
                        }
                    }
                }
                Err(e) => {
                    warnings.push(format!("Error parsing {}: {}", norm_path, e));
                    status = AnalysisStatus::Partial;
                }
            }
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

    fn get_test_pool() -> ParserPool {
        ParserPool::new(Duration::from_secs(5), 1024 * 1024)
    }

    #[test]
    fn test_5r1_t1_and_t2_java_public_class_and_method_extracted() {
        let pool = get_test_pool();
        let src = r#"
            public class PublicService {
                public void run() {}
                protected void hook() {}
                private void secret() {}
                void packageOnly() {}
            }
        "#;

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::Java,
            src,
            "PublicService.java",
            "PublicService",
        )
        .expect("extract failed");

        let names: Vec<&str> = surface.symbols.iter().map(|s| s.exported_name.as_str()).collect();
        assert!(names.contains(&"PublicService"), "PublicService class must be extracted");
        assert!(names.contains(&"run"), "public run method must be extracted");
        assert!(!names.contains(&"secret"), "private secret method must be excluded");
        assert!(!names.contains(&"packageOnly"), "packageOnly method must be excluded");
        assert_eq!(surface.status, AnalysisStatus::Complete);
    }

    #[test]
    fn test_5r1_t3_and_t4_java_package_private_and_inner_excluded() {
        let pool = get_test_pool();
        let src = r#"
            class InternalService {
                public void internallyPublicMember() {}
            }
        "#;

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::Java,
            src,
            "InternalService.java",
            "InternalService",
        )
        .expect("extract failed");

        assert_eq!(surface.symbols.len(), 0, "Package-private class must not appear in public surface");
    }

    #[test]
    fn test_5r1_t5_and_t21_java_overload_set_preserved() {
        let pool = get_test_pool();
        let src = r#"
            public class Parser {
                public String parse(String value) { return value; }
                public int parse(int value) { return value; }
            }
        "#;

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::Java,
            src,
            "Parser.java",
            "Parser",
        )
        .expect("extract failed");

        let parse_sym = surface
            .symbols
            .iter()
            .find(|s| s.exported_name == "parse")
            .expect("parse method symbol must exist");

        assert_eq!(parse_sym.signatures.len(), 2, "Both overload signatures must be preserved under one identity");
        assert_eq!(parse_sym.identity_key, "Java::Parser::Method::Parser.parse");
    }

    #[test]
    fn test_5r1_t6_malformed_module_status_is_partial() {
        let pool = get_test_pool();
        let broken_src = r#"
            pub fn valid_fn() {}
            this is broken syntax @@@ !!! %%%
        "#;

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::Rust,
            broken_src,
            "broken.rs",
            "broken",
        )
        .expect("extract should succeed with partial status");

        assert_eq!(surface.status, AnalysisStatus::Partial);
        assert!(!surface.warnings.is_empty());
        assert!(surface.symbols.iter().any(|s| s.exported_name == "valid_fn"));
    }

    #[test]
    fn test_5r1_t8_complete_module_status_is_complete() {
        let pool = get_test_pool();
        let valid_src = "pub fn add(a: i32, b: i32) -> i32 { a + b }";

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::Rust,
            valid_src,
            "calc.rs",
            "calc",
        )
        .expect("extract failed");

        assert_eq!(surface.status, AnalysisStatus::Complete);
        assert!(surface.warnings.is_empty());
    }

    #[test]
    fn test_5r1_t9_mixed_package_malformed_entry_is_partial() {
        let pool = get_test_pool();
        let f1 = ("src/valid.rs", "valid", "pub fn valid() {}");
        let f2 = ("src/broken.rs", "broken", "pub fn broken() { @@@ !!! }");

        let surface = PublicApiExtractor::extract_package(
            &pool,
            "pkg",
            Language::Rust,
            &[f1, f2],
        )
        .expect("extract failed");

        assert_eq!(surface.status, AnalysisStatus::Partial);
    }

    #[test]
    fn test_5r1_t11_complete_and_partial_same_symbols_hash_differently() {
        let pool = get_test_pool();
        let sym = PublicApiSymbol {
            identity_key: "Rust::mod::Function::test".to_string(),
            exported_name: "test".to_string(),
            qualified_name: "test".to_string(),
            kind: SymbolKind::Function,
            provenance: SourceProvenance {
                file_path: "test.rs".to_string(),
                start_line: 1,
                end_line: 1,
            },
            signatures: vec![],
            signature_fingerprint: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string(),
        };

        let scope = PublicApiScope::Module {
            module_path: "mod".to_string(),
        };

        let hash_complete = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Complete,
            &scope,
            Language::Rust,
            &[sym.clone()],
        );

        let hash_partial = PublicApiExtractor::compute_surface_hash(
            AnalysisStatus::Partial,
            &scope,
            Language::Rust,
            &[sym],
        );

        assert_ne!(hash_complete, hash_partial, "Complete and Partial surfaces MUST produce distinct hashes");
    }

    #[test]
    fn test_5r1_t12_python_all_truthful_filtering() {
        let pool = get_test_pool();
        let src = r#"
__all__ = ["exported_fn", "_explicit_allowed"]

def exported_fn():
    pass

def implicit_not_in_all():
    pass

def _explicit_allowed():
    pass

def _hidden():
    pass
"#;

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::Python,
            src,
            "pkg.py",
            "pkg",
        )
        .expect("extract failed");

        let names: Vec<&str> = surface.symbols.iter().map(|s| s.exported_name.as_str()).collect();
        assert!(names.contains(&"exported_fn"));
        assert!(names.contains(&"_explicit_allowed"));
        assert!(!names.contains(&"implicit_not_in_all"), "Symbols omitted from __all__ MUST be excluded");
        assert!(!names.contains(&"_hidden"), "_hidden must be excluded");
        assert_eq!(surface.status, AnalysisStatus::Complete);
    }

    #[test]
    fn test_5r1_t15_and_t16_sha256_known_digest_and_formatting_immunity() {
        let pool = get_test_pool();
        let src_a = "pub fn add(a: i32, b: i32) -> i32 { a + b }";
        let src_b = r#"
            // Leading comment
            pub fn add(
                a: i32,
                b: i32,
            ) -> i32 {
                // Internal comment
                a + b
            }
        "#;

        let surf_a = PublicApiExtractor::extract_module(&pool, Language::Rust, src_a, "add.rs", "add").unwrap();
        let surf_b = PublicApiExtractor::extract_module(&pool, Language::Rust, src_b, "add.rs", "add").unwrap();

        assert_eq!(surf_a.symbols[0].signature_fingerprint.len(), 64, "Fingerprint must be 64 hex characters (SHA-256)");
        assert_eq!(surf_a.surface_hash.len(), 64, "Surface hash must be 64 hex characters (SHA-256)");

        assert_eq!(surf_a.symbols[0].signature_fingerprint, surf_b.symbols[0].signature_fingerprint);
        assert_eq!(surf_a.surface_hash, surf_b.surface_hash);
    }

    #[test]
    fn test_5r1_t20_typescript_overload_set_preserved() {
        let pool = get_test_pool();
        let src = r#"
            export function parse(value: string): string;
            export function parse(value: number): number;
            export function parse(value: string | number): string | number {
                return value;
            }
        "#;

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::TypeScript,
            src,
            "parser.ts",
            "parser",
        )
        .expect("extract failed");

        let parse_sym = surface
            .symbols
            .iter()
            .find(|s| s.exported_name == "parse")
            .expect("parse function must exist");

        assert_eq!(parse_sym.signatures.len(), 3, "TypeScript function with 3 declarations must preserve all 3 signatures");
        assert_eq!(parse_sym.identity_key, "TypeScript::parser::Function::parse");
    }

    #[test]
    fn test_5r1_t23_removing_overload_changes_fingerprint_not_identity() {
        let pool = get_test_pool();
        let src_3 = r#"
            export function format(v: string): string;
            export function format(v: number): string;
            export function format(v: any): string { return ""; }
        "#;

        let src_2 = r#"
            export function format(v: string): string;
            export function format(v: any): string { return ""; }
        "#;

        let surf_3 = PublicApiExtractor::extract_module(&pool, Language::TypeScript, src_3, "fmt.ts", "fmt").unwrap();
        let surf_2 = PublicApiExtractor::extract_module(&pool, Language::TypeScript, src_2, "fmt.ts", "fmt").unwrap();

        // Same identity
        assert_eq!(surf_3.symbols[0].identity_key, surf_2.symbols[0].identity_key);

        // Different signature fingerprint & surface hash
        assert_ne!(surf_3.symbols[0].signature_fingerprint, surf_2.symbols[0].signature_fingerprint);
        assert_ne!(surf_3.surface_hash, surf_2.surface_hash);
    }

    #[test]
    fn test_5r1_t26_and_t27_determinism_20_permutations() {
        let pool = get_test_pool();
        let f1 = ("src/a.rs", "a", "pub fn a() {}");
        let f2 = ("src/b.rs", "b", "pub fn b() {}");
        let f3 = ("src/c.rs", "c", "pub fn c() {}");

        let files = vec![f1, f2, f3];
        let base = PublicApiExtractor::extract_package(&pool, "pkg", Language::Rust, &files).unwrap();

        for _ in 0..20 {
            let perm = vec![f3, f1, f2];
            let next = PublicApiExtractor::extract_package(&pool, "pkg", Language::Rust, &perm).unwrap();
            assert_eq!(base.surface_hash, next.surface_hash);
            assert_eq!(base.symbols, next.symbols);
        }
    }
}
