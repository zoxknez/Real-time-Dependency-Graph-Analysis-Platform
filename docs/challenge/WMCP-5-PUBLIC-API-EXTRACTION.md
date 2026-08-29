# WMCP-5 - Authoritative Public API Extraction & AST Semantic Boundary

## 1. Purpose & Scope

This document establishes the deterministic source-of-truth representation of package and module public APIs (**WMCP-5**):
- **Authoritative AST Extraction**: Reuses existing Tree-sitter multi-language parser infrastructure in `apps/analysis/src/ast_parser.rs`.
- **AST Symbol vs. Public API Symbol**: Enforces strict language-aware public exposure rules to exclude private, local, and unexported declarations.
- **Stable Identity Contract**: Explicitly separates semantic `identity_key` from signature facts and `signature_fingerprint` to enable deterministic diffing in future phases.
- **Normalized Canonical Representation**: Provides structured, cross-platform deterministic, and JSON-serializable `PublicApiSurface`.

### Non-Goals
- **No Snapshot Persistence**: Persistent filesystem/database snapshots belong to **WMCP-6**.
- **No Counterfactual / Breaking Decisions**: Breaking change detection and `simulate_api_changes` scenario evaluation belong to **WMCP-7**.
- **No SemVer / Version Compatibility Engine**: Version constraint resolution and ecosystem-specific SemVer/PEP 440 rules belong to **WMCP-8**.
- **No WebMCP Tool Activation**: `simulate_api_changes` remains `DEFERRED`.

---

## 2. Review Chronology & Upstream Reference

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **Starting HEAD**: `2d208c94612ffe1c920d08a0a74c66653c8ee965`
- **WMCP-4 Closure HEAD**: `2d208c94612ffe1c920d08a0a74c66653c8ee965`
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491` (verified unchanged)

---

## 3. Pre-Existing AST Authority Inventory

| Component | Path | Responsibility | Real/Stub | Used in Production? |
| :--- | :--- | :--- | :--- | :--- |
| **Tree-sitter Parser Pool** | `apps/analysis/src/ast_parser.rs` | Multi-language thread-local AST parser and symbol extractor | REAL | YES |
| **Grammar Bindings** | `Cargo.toml` (`tree-sitter-*`) | Native Tree-sitter grammar bindings for Rust, JS, TS, Python, Go, Java | REAL | YES |
| **Breaking Detector** | `apps/analysis/src/breaking_detector.rs` | Semantic breaking change detection between AST symbol snapshots | REAL | YES |
| **Public API Extractor** | `apps/analysis/src/public_api.rs` | Canonical public API surface derivation, normalization, and stable identity management (WMCP-5) | REAL | YES |

---

## 4. Supported Language Capability Matrix

| Language | Tree-sitter Grammar | Existing Symbol Extractor | Visibility & Export Semantics Authority | WMCP-5 Support Status |
| :--- | :--- | :--- | :--- | :--- |
| **JavaScript** | `tree-sitter-javascript` | `extract_js_symbols` | `export_statement`, `module.exports`, `is_exported` | **SUPPORTED** |
| **TypeScript** | `tree-sitter-typescript` | `extract_js_symbols` | `export_statement`, `type`, `interface`, `visibility_modifier` | **SUPPORTED** |
| **Python** | `tree-sitter-python` | `extract_python_symbols` | Non-underscored top-level definitions, dunders | **SUPPORTED** |
| **Rust** | `tree-sitter-rust` | `extract_rust_symbols` | `pub`, `pub(crate)`, `pub(super)`, `impl` items | **SUPPORTED** |
| **Go** | `tree-sitter-go` | `extract_go_symbols` | Uppercase identifier capitalization | **SUPPORTED** |
| **Java** | `tree-sitter-java` | `extract_java_symbols` | `public` / `protected` modifiers | **SUPPORTED** |

---

## 5. Public Exposure Rules by Language (INV-WMCP5-003)

- **JavaScript / TypeScript**:
  Only symbols flagged with `is_exported: true` (or explicit `Visibility::Public`) are admitted. Local variables, non-exported helper functions, and internal class declarations are strictly excluded.
- **Rust**:
  Only items with `Visibility::Public` (`pub fn`, `pub struct`, `pub enum`, `pub trait`, `pub const`, `pub type`) are admitted. Items marked `pub(crate)`, `pub(super)`, or `fn` without `pub` are excluded.
- **Python**:
  Excludes module-internal symbols starting with a single underscore `_` (unless special dunder conventions apply). Local inner functions are excluded.
- **Go**:
  Only identifiers starting with an ASCII uppercase letter (`is_ascii_uppercase()`) are exposed as public API. Lowercase package-private identifiers are excluded.
- **Java**:
  Only members and types with `Visibility::Public` are admitted as public API.

---

## 6. Public API Data Model & Identity Contract (INV-WMCP5-005)

### Stable Identity Key vs. Signature Fingerprint
To support robust diffing across versions in future phases (WMCP-6/7), the symbol model separates **identity** from **signature**:
1. `identity_key`:
   - Canonical format: `{Language}::{ModulePath}::{SymbolKind}::{QualifiedName}`.
   - Remains stable across line movements, formatting changes, comment edits, and signature type modifications.
2. `signature_fingerprint`:
   - Deterministic 16-character hex hash computed over the symbol kind, exported name, normalized signature, parameter types/defaults/optionality, return type, generics, and annotations.
   - Modifying parameter types or adding/removing parameters changes `signature_fingerprint` without altering `identity_key`.

---

## 7. Determinism & Normalization Guarantees (INV-WMCP5-007, INV-WMCP5-009)

- **Cross-Platform Path Normalization**: All file paths are converted to use forward slashes (`/`).
- **Canonical Ordering**: All extracted public symbols are indexed and sorted via `BTreeMap<String, PublicApiSymbol>` by `identity_key`.
- **Input Order Independence**: Analyzing source files in arbitrary order yields identical `PublicApiSurface` and identical `surface_hash`.
- **Pure Static Analysis**: 0 source code execution, 0 network calls, 0 dynamic evaluations.

---

## 8. Quality & Test Evidence

- **Rust Analysis Test Suite**: **44 / 44 PASS** (0 failed)
  - 5-T1 & 5-T2: Tree-sitter parser authority and language support verification (JS, TS, Rust, Python, Go, Java).
  - 5-T4 & 5-T5: Public vs. private symbol separation in JS/TS and Rust.
  - 5-T6: Nested local implementation symbols excluded.
  - 5-T11 & 5-T12: Identity stability across line movement and comments.
  - 5-T13: Private-only implementation changes leave public surface hash identical.
  - 5-T14: Public signature changes alter signature fingerprint without changing identity.
  - 5-T16: Public renames change public identity key.
  - 5-T17: 10 repeated extractions produce byte-for-byte identical JSON and surface hash.
  - 5-T18: Input file order independence.
  - 5-T19: Cross-platform path normalization.
  - 5-T22 & 5-T23: Clean JSON serializability without parser node handles.
- **Workspace Cargo Suite**: `cargo test --workspace` $\to$ **PASS** (Exit 0).
- **Frontend Regression Suite**: `playwright test` (9 specs, 275 tests) $\to$ **275 / 275 PASS** (Exit 0).
- **ASCII Scan**: 0 non-ASCII hyphens across all deliverable files.

---

## 9. Downstream Hand-Off Boundaries

- **WMCP-6**: Will consume `PublicApiSurface` to implement snapshot persistence and version-history storage.
- **WMCP-7**: Will consume version snapshots to detect breaking changes and power counterfactual scenarios.
- **WMCP-8**: Will consume breaking change facts to evaluate SemVer / PEP 440 compatibility constraints.

---

## 10. Status

**WMCP-5 IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
