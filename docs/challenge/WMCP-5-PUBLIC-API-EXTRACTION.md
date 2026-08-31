# WMCP-5-R1 - Authoritative Public API Extraction & AST Semantic Boundary

## 1. Purpose & Scope

This document establishes the deterministic source-of-truth representation of package and module public APIs (**WMCP-5 / WMCP-5-R1**):
- **Authoritative AST Extraction**: Reuses existing Tree-sitter multi-language parser infrastructure in `apps/analysis/src/ast_parser.rs`.
- **AST Symbol vs. Public API Symbol**: Enforces strict language-aware public exposure rules to exclude private, local, and unexported declarations.
- **Machine-Readable Completeness Authority**: Explicit `AnalysisStatus` (`Complete`, `Partial`, `Unsupported`) that participates in `surface_hash` to prevent malformed/partial extractions from masquerading as complete snapshots.
- **Snapshot-Ready Hashing (SHA-256)**: Standard 64-character lowercase hexadecimal SHA-256 hashes for `signature_fingerprint` and `surface_hash`, replacing implementation-defined hashers.
- **Overload Set Normalization**: Preserves complete sets of public declarations / overloads in `PublicApiSymbol.signatures` under a stable external `identity_key` without data loss or key collision overwrite.
- **Python `__all__` Extraction**: Statically extracts literal `__all__` lists/tuples from Python AST; falls back with `AnalysisStatus::Partial` if dynamic.
- **Java Visibility Correction**: Correctly traverses child nodes of kind `"modifiers"` in Tree-sitter Java grammar to extract `public` and `protected` declarations.

### Non-Goals
- **No Snapshot Persistence**: Persistent filesystem/database snapshots belong to **WMCP-6**.
- **No Counterfactual / Breaking Decisions**: Breaking change detection and `simulate_api_changes` scenario evaluation belong to **WMCP-7**.
- **No SemVer / Version Compatibility Engine**: Version constraint resolution and ecosystem-specific SemVer/PEP 440 rules belong to **WMCP-8**.
- **No WebMCP Tool Activation**: `simulate_api_changes` remains `DEFERRED`.

---

## 2. Review Chronology & Upstream Reference

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **Starting HEAD**: `2ad5a3fe403cb9563cec9c344a1e96aa1a88704e`
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
| **Public API Extractor** | `apps/analysis/src/public_api.rs` | Canonical public API surface derivation, normalization, and stable identity management (WMCP-5/R1) | REAL | YES |

---

## 4. Supported Language Capability Matrix

| Language | Tree-sitter Grammar | Existing Symbol Extractor | Visibility & Export Semantics Authority | WMCP-5-R1 Support Status |
| :--- | :--- | :--- | :--- | :--- |
| **JavaScript** | `tree-sitter-javascript` | `extract_js_symbols` | `export_statement`, `module.exports`, `is_exported` | **SUPPORTED** |
| **TypeScript** | `tree-sitter-typescript` | `extract_js_symbols` | `export_statement`, `interface`, `type`, `function_signature` (overloads) | **SUPPORTED** |
| **Python** | `tree-sitter-python` | `extract_python_symbols` | Literal `__all__` list/tuple AST extraction; underscore convention fallback | **SUPPORTED** |
| **Rust** | `tree-sitter-rust` | `extract_rust_symbols` | `pub`, `pub(crate)`, `pub(super)`, `impl` items | **SUPPORTED** |
| **Go** | `tree-sitter-go` | `extract_go_symbols` | Uppercase identifier capitalization | **SUPPORTED** |
| **Java** | `tree-sitter-java` | `extract_java_symbols` | Child node `"modifiers"` traversal (`public`, `protected`, `private`) | **SUPPORTED** |

---

## 5. Machine-Readable Analysis Status Model (INV-WMCP5-004)

```rust
pub enum AnalysisStatus {
    Complete,
    Partial,
    Unsupported,
}
```

### Transition Rules
1. **`Complete`**: All files in scope were successfully parsed by supported Tree-sitter grammars with 0 syntax errors and complete export resolution.
2. **`Partial`**: Useful API facts recovered, but completeness cannot be guaranteed (e.g. Tree-sitter parse tree has syntax errors, dynamic `__all__` in Python, or mixed package where one entry point had errors).
3. **`Unsupported`**: Target language or file format is unsupported by the platform.

### Surface Hash Participation
`AnalysisStatus` is strictly included in the canonical `surface_hash` payload. A `Complete` surface and a `Partial` surface containing identical symbols produce distinct hashes.

---

## 6. Public API Data Model & Overload Normalization

```rust
pub struct PublicApiSymbol {
    pub identity_key: String,
    pub exported_name: String,
    pub qualified_name: String,
    pub kind: SymbolKind,
    pub provenance: SourceProvenance,
    pub signatures: Vec<PublicSymbolSignature>,
    pub signature_fingerprint: String,
}
```

### Overload Preservation
- Multiple public declarations with the same `identity_key` (such as TypeScript function overloads or Java method overloads) are collected into `signatures: Vec<PublicSymbolSignature>`.
- `signatures` is canonically sorted and deduplicated.
- `signature_fingerprint` is a 64-character SHA-256 hash derived from the full set of normalized signatures.
- Adding or removing an overload updates `signature_fingerprint` and `surface_hash` without altering the stable external `identity_key`.

---

## 7. Semantic Hash Payload Matrix

| Field | In `signature_fingerprint`? | In `surface_hash`? |
| :--- | :--- | :--- |
| `identity_key` | **NO** | **YES** |
| `exported_name` | **YES** | **YES** |
| `normalized_signature` | **YES** | **NO** (via fingerprint) |
| `signatures` (overload set) | **YES** | **NO** (via fingerprint) |
| `AnalysisStatus` | **NO** | **YES** |
| `PublicApiScope` | **NO** | **YES** |
| `Language` | **NO** | **YES** |
| `raw_signature` | **NO** | **NO** (Diagnostic only) |
| `file_path` | **NO** | **NO** (Provenance only) |
| `start_line` / `end_line` | **NO** | **NO** (Provenance only) |
| `warnings` | **NO** | **NO** (Diagnostic only) |

---

## 8. Quality & Test Evidence

- **Rust Analysis Test Suite**: **44 / 44 PASS** (0 failed)
  - `5R1-T1` & `5R1-T2`: Java public class and public method extracted (`AnalysisStatus::Complete`).
  - `5R1-T3` & `5R1-T4`: Java package-private classes and their members strictly excluded from public surface.
  - `5R1-T5` & `5R1-T21`: Java method overloads preserved in `signatures` without collision loss.
  - `5R1-T6`: Malformed source recovery emits `AnalysisStatus::Partial`.
  - `5R1-T8`: Clean source emits `AnalysisStatus::Complete`.
  - `5R1-T9`: Mixed package with malformed entry point emits `AnalysisStatus::Partial`.
  - `5R1-T11`: `Complete` and `Partial` surfaces with identical symbols produce distinct `surface_hash`.
  - `5R1-T12`: Python `__all__` literal list/tuple filtering strictly excludes omitted symbols.
  - `5R1-T15` & `5R1-T16`: SHA-256 64-character digests with formatting/comment immunity.
  - `5R1-T20`: TypeScript function overload declarations preserved in `signatures`.
  - `5R1-T23`: Removing an overload updates `signature_fingerprint` while leaving `identity_key` stable.
  - `5R1-T26` & `5R1-T27`: 20-permutation determinism verified.
- **Workspace Cargo Suite**: `cargo test --workspace` $\to$ **146 / 146 PASS** (Exit 0).
- **Workspace Quality Check**: `cargo check --workspace --all-targets` $\to$ **0 errors** (Exit 0).
- **Frontend Regression Suite**: `npm --prefix apps/frontend run build` $\to$ **PASS** (Exit 0).
- **ASCII Scan**: 0 non-ASCII hyphens across all deliverable files.

---

## 9. Downstream Hand-Off Boundaries

- **WMCP-6**: Will consume `PublicApiSurface` and `AnalysisStatus` to persist version-history snapshots.
- **WMCP-7**: Will consume version snapshots to detect breaking changes and power counterfactual scenarios.
- **WMCP-8**: Will consume breaking change facts to evaluate SemVer / PEP 440 compatibility constraints.

---

## 10. Status

**WMCP-5-R1 IMPLEMENTED - PENDING INDEPENDENT RE-VERIFICATION**
