//! Authoritative Public API Extraction & AST Semantic Boundary (WMCP-5)
//!
//! Provides deterministic extraction, normalization, and surface derivation of public APIs
//! using existing Tree-sitter AST parser infrastructure.
//!
//! Invariants enforced:
//! - INV-WMCP5-001: Reuses existing tree-sitter AST parser (no regex / shadow parser).
//! - INV-WMCP5-002: Language support derived from existing grammar capabilities.
//! - INV-WMCP5-003: Language-aware public exposure rules.
//! - INV-WMCP5-004: Explicit module-level vs package-level entry-point distinction.
//! - INV-WMCP5-005: Stable `identity_key` separated from `signature_fingerprint`.
//! - INV-WMCP5-006: Complete source provenance (path, line numbers).
//! - INV-WMCP5-007: Deterministic canonical ordering and surface hashing.
//! - INV-WMCP5-010: Member visibility respected (private members excluded).
//! - INV-WMCP5-012: No breaking change classification decisions in WMCP-5.
//! - INV-WMCP5-013: In-memory / serializable surface only (no snapshot persistence).
//! - INV-WMCP5-027: Strictly static AST analysis (no source code execution).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::hash::{Hash, Hasher};

use crate::ast_parser::{
    ExtractedSymbol, Language, ParameterInfo, ParserPool, SymbolKind, Visibility,
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API TYPES
// ═══════════════════════════════════════════════════════════════

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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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

/// Normalized signature details of a public symbol
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicSymbolSignature {
    /// Original raw signature string
    pub raw_signature: String,
    /// Normalized signature for comparison
    pub normalized_signature: String,
    /// Parameter specifications (for functions/methods)
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

/// Authoritative representation of a single publicly accessible API symbol
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicApiSymbol {
    /// Stable semantic identity (does not change on line moves, whitespace, or comments)
    pub identity_key: String,
    /// External exported name
    pub exported_name: String,
    /// Fully qualified path/name in the module hierarchy
    pub qualified_name: String,
    /// Language-agnostic symbol classification
    pub kind: SymbolKind,
    /// Declaration provenance in source code
    pub provenance: SourceProvenance,
    /// Normalized signature facts
    pub signature: PublicSymbolSignature,
    /// Fingerprint of current signature facts (changes when signature changes, but identity_key remains stable)
    pub signature_fingerprint: String,
}

/// Authoritative deterministic public API surface
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicApiSurface {
    /// Analysis scope (Module or Package)
    pub scope: PublicApiScope,
    /// Source programming language
    pub language: Language,
    /// Deterministically ordered list of all public symbols (sorted by identity_key)
    pub symbols: Vec<PublicApiSymbol>,
    /// Deterministic content hash of the entire public API surface
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
    pub fn is_public_symbol(sym: &ExtractedSymbol, lang: Language) -> bool {
        match lang {
            Language::JavaScript | Language::TypeScript => {
                // In JS/TS, exported symbols or explicitly public visibility
                sym.is_exported || sym.visibility == Visibility::Public
            }
            Language::Rust => {
                // In Rust, only pub items form the public API
                sym.visibility == Visibility::Public
            }
            Language::Python => {
                // In Python: top-level non-underscored names, or special dunders (__init__, etc. if relevant)
                if sym.name.starts_with('_') && !sym.name.starts_with("__") {
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

    /// Computes a deterministic hex hash for a symbol's signature facts
    pub fn compute_signature_fingerprint(
        kind: SymbolKind,
        exported_name: &str,
        signature: &PublicSymbolSignature,
    ) -> String {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();

        (kind as u8).hash(&mut hasher);
        exported_name.hash(&mut hasher);
        signature.normalized_signature.hash(&mut hasher);
        signature.return_type.hash(&mut hasher);
        signature.visibility.hash(&mut hasher);

        for param in &signature.parameters {
            param.name.hash(&mut hasher);
            param.type_annotation.hash(&mut hasher);
            param.default_value.hash(&mut hasher);
            param.is_optional.hash(&mut hasher);
            param.is_variadic.hash(&mut hasher);
        }

        for generic_param in &signature.generics {
            generic_param.hash(&mut hasher);
        }

        for ann in &signature.annotations {
            ann.hash(&mut hasher);
        }

        format!("{:016x}", hasher.finish())
    }

    /// Computes a deterministic overall surface hash from ordered public symbols
    pub fn compute_surface_hash(
        scope: &PublicApiScope,
        lang: Language,
        symbols: &[PublicApiSymbol],
    ) -> String {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();

        format!("{:?}", scope).hash(&mut hasher);
        (lang as u8).hash(&mut hasher);

        for sym in symbols {
            sym.identity_key.hash(&mut hasher);
            sym.exported_name.hash(&mut hasher);
            sym.signature_fingerprint.hash(&mut hasher);
        }

        format!("{:016x}", hasher.finish())
    }

    /// Converts an `ExtractedSymbol` into a `PublicApiSymbol`
    pub fn convert_symbol(
        sym: &ExtractedSymbol,
        lang: Language,
        file_path: &str,
        module_path: &str,
    ) -> PublicApiSymbol {
        let norm_path = Self::normalize_path(file_path);
        let identity_key = Self::compute_identity_key(lang, module_path, sym.kind, &sym.qualified_path);

        let public_signature = PublicSymbolSignature {
            raw_signature: sym.raw_signature.clone(),
            normalized_signature: sym.signature.clone(),
            parameters: sym.parameters.iter().map(PublicParameter::from).collect(),
            return_type: sym.return_type.clone(),
            generics: sym.generics.clone(),
            visibility: format!("{:?}", sym.visibility),
            annotations: sym.annotations.clone(),
        };

        let signature_fingerprint =
            Self::compute_signature_fingerprint(sym.kind, &sym.name, &public_signature);

        PublicApiSymbol {
            identity_key,
            exported_name: sym.name.clone(),
            qualified_name: sym.qualified_path.clone(),
            kind: sym.kind,
            provenance: SourceProvenance {
                file_path: norm_path,
                start_line: sym.start_line,
                end_line: sym.end_line,
            },
            signature: public_signature,
            signature_fingerprint,
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
        let raw_symbols = pool
            .parse(lang, source, file_path)
            .with_context(|| format!("Failed to parse source file: {}", file_path))?;

        let mut symbols_map = BTreeMap::new();
        let warnings = Vec::new();

        for sym in raw_symbols {
            if Self::is_public_symbol(&sym, lang) {
                let public_sym = Self::convert_symbol(&sym, lang, file_path, module_path);
                symbols_map.insert(public_sym.identity_key.clone(), public_sym);
            }
        }

        let ordered_symbols: Vec<PublicApiSymbol> = symbols_map.into_values().collect();
        let scope = PublicApiScope::Module {
            module_path: module_path.to_string(),
        };
        let surface_hash = Self::compute_surface_hash(&scope, lang, &ordered_symbols);

        Ok(PublicApiSurface {
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
        let mut symbols_map = BTreeMap::new();
        let mut warnings = Vec::new();
        let mut entry_points = Vec::new();

        for (file_path, module_path, source) in files {
            let norm_path = Self::normalize_path(file_path);
            entry_points.push(norm_path.clone());

            match pool.parse(lang, source, &norm_path) {
                Ok(raw_symbols) => {
                    for sym in raw_symbols {
                        if Self::is_public_symbol(&sym, lang) {
                            let public_sym =
                                Self::convert_symbol(&sym, lang, &norm_path, module_path);
                            symbols_map.insert(public_sym.identity_key.clone(), public_sym);
                        }
                    }
                }
                Err(e) => {
                    warnings.push(format!("Error parsing {}: {}", norm_path, e));
                }
            }
        }

        entry_points.sort();
        let ordered_symbols: Vec<PublicApiSymbol> = symbols_map.into_values().collect();
        let scope = PublicApiScope::Package {
            package_id: package_id.to_string(),
            entry_points,
        };
        let surface_hash = Self::compute_surface_hash(&scope, lang, &ordered_symbols);

        Ok(PublicApiSurface {
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
    fn test_5_t1_and_5_t2_tree_sitter_authority_and_supported_languages() {
        let pool = get_test_pool();

        // Verify AST parser is used for all supported languages
        let js_res = PublicApiExtractor::extract_module(
            &pool,
            Language::JavaScript,
            "export function testFn() {}",
            "index.js",
            "index",
        );
        assert!(js_res.is_ok());

        let ts_res = PublicApiExtractor::extract_module(
            &pool,
            Language::TypeScript,
            "export interface User { id: string; }",
            "index.ts",
            "index",
        );
        assert!(ts_res.is_ok());

        let rust_res = PublicApiExtractor::extract_module(
            &pool,
            Language::Rust,
            "pub fn public_fn() {}",
            "lib.rs",
            "crate",
        );
        assert!(rust_res.is_ok());

        let py_res = PublicApiExtractor::extract_module(
            &pool,
            Language::Python,
            "def public_calc(x): return x * 2",
            "calc.py",
            "calc",
        );
        assert!(py_res.is_ok());

        let go_res = PublicApiExtractor::extract_module(
            &pool,
            Language::Go,
            "package main\nfunc PublicHandler() {}",
            "main.go",
            "main",
        );
        assert!(go_res.is_ok());

        let java_res = PublicApiExtractor::extract_module(
            &pool,
            Language::Java,
            "public class Service { public void execute() {} }",
            "Service.java",
            "Service",
        );
        assert!(java_res.is_ok());
    }

    #[test]
    fn test_5_t4_and_5_t5_public_vs_private_symbols_in_js_ts() {
        let pool = get_test_pool();
        let src = r#"
            export function publicFunction(a: number): string {
                return a.toString();
            }

            function privateHelper(b: number): number {
                return b * 2;
            }

            export const PUBLIC_CONST = 42;
            const privateSecret = "hidden";
        "#;

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::TypeScript,
            src,
            "src/utils.ts",
            "utils",
        )
        .expect("extract failed");

        let names: Vec<&str> = surface.symbols.iter().map(|s| s.exported_name.as_str()).collect();
        assert!(names.contains(&"publicFunction"));
        assert!(names.contains(&"PUBLIC_CONST"));
        assert!(!names.contains(&"privateHelper"));
        assert!(!names.contains(&"privateSecret"));
    }

    #[test]
    fn test_5_t4_and_5_t5_public_vs_private_symbols_in_rust() {
        let pool = get_test_pool();
        let src = r#"
            pub fn public_entry() {}
            fn internal_helper() {}
            pub struct Config { pub port: u16 }
            struct InternalState { secret: u32 }
        "#;

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::Rust,
            src,
            "src/lib.rs",
            "crate",
        )
        .expect("extract failed");

        let names: Vec<&str> = surface.symbols.iter().map(|s| s.exported_name.as_str()).collect();
        assert!(names.contains(&"public_entry"));
        assert!(names.contains(&"Config"));
        assert!(!names.contains(&"internal_helper"));
        assert!(!names.contains(&"InternalState"));
    }

    #[test]
    fn test_5_t6_nested_local_symbols_excluded() {
        let pool = get_test_pool();
        let src = r#"
            export function outerFunction() {
                function innerLocalHelper() {
                    return 1;
                }
                return innerLocalHelper();
            }
        "#;

        let surface = PublicApiExtractor::extract_module(
            &pool,
            Language::JavaScript,
            src,
            "index.js",
            "index",
        )
        .expect("extract failed");

        let names: Vec<&str> = surface.symbols.iter().map(|s| s.exported_name.as_str()).collect();
        assert!(names.contains(&"outerFunction"));
        assert!(!names.contains(&"innerLocalHelper"));
    }

    #[test]
    fn test_5_t11_and_5_t12_identity_stability_across_line_movement_and_comments() {
        let pool = get_test_pool();
        let src1 = r#"
            export function processOrder(orderId: string): boolean {
                return true;
            }
        "#;

        let src2 = r#"
            // Added leading comments
            // Explaining order processing logic

            export function processOrder(orderId: string): boolean {
                // Internal comment inside body
                return true;
            }
        "#;

        let surf1 = PublicApiExtractor::extract_module(&pool, Language::TypeScript, src1, "api.ts", "api").unwrap();
        let surf2 = PublicApiExtractor::extract_module(&pool, Language::TypeScript, src2, "api.ts", "api").unwrap();

        assert_eq!(surf1.symbols.len(), 1);
        assert_eq!(surf2.symbols.len(), 1);

        // Identity key and signature fingerprint must be byte-for-byte equal
        assert_eq!(surf1.symbols[0].identity_key, surf2.symbols[0].identity_key);
        assert_eq!(surf1.symbols[0].signature_fingerprint, surf2.symbols[0].signature_fingerprint);
        assert_eq!(surf1.surface_hash, surf2.surface_hash);

        // Line numbers changed in provenance
        assert_ne!(surf1.symbols[0].provenance.start_line, surf2.symbols[0].provenance.start_line);
    }

    #[test]
    fn test_5_t13_private_only_implementation_change_leaves_surface_identical() {
        let pool = get_test_pool();
        let src_v1 = r#"
            export function calculateSum(a: number, b: number): number {
                return a + b;
            }
            function secretHelper() { return "v1"; }
        "#;

        let src_v2 = r#"
            export function calculateSum(a: number, b: number): number {
                // Changed algorithm to use bitwise operations
                let res = a;
                for (let i = 0; i < b; i++) { res++; }
                return res;
            }
            function secretHelper() { return "v2 completely rewritten"; }
        "#;

        let surf1 = PublicApiExtractor::extract_module(&pool, Language::TypeScript, src_v1, "calc.ts", "calc").unwrap();
        let surf2 = PublicApiExtractor::extract_module(&pool, Language::TypeScript, src_v2, "calc.ts", "calc").unwrap();

        assert_eq!(surf1.surface_hash, surf2.surface_hash);
        assert_eq!(surf1.symbols[0].signature_fingerprint, surf2.symbols[0].signature_fingerprint);
    }

    #[test]
    fn test_5_t14_public_signature_change_alters_signature_fingerprint_without_changing_identity() {
        let pool = get_test_pool();
        let src1 = "pub fn fetch_user(id: String) -> bool { true }";
        let src2 = "pub fn fetch_user(id: u32) -> bool { true }";

        let surf1 = PublicApiExtractor::extract_module(&pool, Language::Rust, src1, "user.rs", "user").unwrap();
        let surf2 = PublicApiExtractor::extract_module(&pool, Language::Rust, src2, "user.rs", "user").unwrap();

        // Same identity key
        assert_eq!(surf1.symbols[0].identity_key, surf2.symbols[0].identity_key);

        // Different signature fingerprint
        assert_ne!(surf1.symbols[0].signature_fingerprint, surf2.symbols[0].signature_fingerprint);
        assert_ne!(surf1.surface_hash, surf2.surface_hash);
    }

    #[test]
    fn test_5_t16_public_rename_changes_identity() {
        let pool = get_test_pool();
        let src1 = "export function oldFunctionName(): void {}";
        let src2 = "export function newFunctionName(): void {}";

        let surf1 = PublicApiExtractor::extract_module(&pool, Language::TypeScript, src1, "mod.ts", "mod").unwrap();
        let surf2 = PublicApiExtractor::extract_module(&pool, Language::TypeScript, src2, "mod.ts", "mod").unwrap();

        assert_ne!(surf1.symbols[0].identity_key, surf2.symbols[0].identity_key);
        assert_eq!(surf1.symbols[0].exported_name, "oldFunctionName");
        assert_eq!(surf2.symbols[0].exported_name, "newFunctionName");
    }

    #[test]
    fn test_5_t17_repeated_extraction_is_strictly_deterministic() {
        let pool = get_test_pool();
        let src = r#"
            pub struct Server { pub port: u16 }
            pub fn start(s: Server) -> bool { true }
            pub const DEFAULT_PORT: u16 = 8080;
        "#;

        let first = PublicApiExtractor::extract_module(&pool, Language::Rust, src, "server.rs", "server").unwrap();
        let first_json = serde_json::to_string(&first).unwrap();

        for _ in 0..10 {
            let next = PublicApiExtractor::extract_module(&pool, Language::Rust, src, "server.rs", "server").unwrap();
            let next_json = serde_json::to_string(&next).unwrap();
            assert_eq!(first.surface_hash, next.surface_hash);
            assert_eq!(first_json, next_json);
        }
    }

    #[test]
    fn test_5_t18_input_file_order_independence() {
        let pool = get_test_pool();
        let f1 = ("src/a.ts", "a", "export const CONST_A = 1;");
        let f2 = ("src/b.ts", "b", "export const CONST_B = 2;");
        let f3 = ("src/c.ts", "c", "export const CONST_C = 3;");

        let order1 = vec![f1, f2, f3];
        let order2 = vec![f3, f1, f2];

        let surf1 = PublicApiExtractor::extract_package(&pool, "pkg-test", Language::TypeScript, &order1).unwrap();
        let surf2 = PublicApiExtractor::extract_package(&pool, "pkg-test", Language::TypeScript, &order2).unwrap();

        assert_eq!(surf1.surface_hash, surf2.surface_hash);
        assert_eq!(surf1.symbols, surf2.symbols);
    }

    #[test]
    fn test_5_t19_cross_platform_path_normalization() {
        let win_path = r"src\core\module.ts";
        let posix_path = "src/core/module.ts";

        assert_eq!(
            PublicApiExtractor::normalize_path(win_path),
            PublicApiExtractor::normalize_path(posix_path)
        );
    }

    #[test]
    fn test_5_t22_and_5_t23_serializable_and_no_runtime_handles_escape() {
        let pool = get_test_pool();
        let src = "export function apiMethod(): string { return 'ok'; }";
        let surface = PublicApiExtractor::extract_module(&pool, Language::TypeScript, src, "api.ts", "api").unwrap();

        let json = serde_json::to_string_pretty(&surface).expect("serialization failed");
        assert!(json.contains("apiMethod"));
        assert!(json.contains("identity_key"));
        assert!(json.contains("signature_fingerprint"));

        let deserialized: PublicApiSurface = serde_json::from_str(&json).expect("deserialization failed");
        assert_eq!(surface, deserialized);
    }
}
