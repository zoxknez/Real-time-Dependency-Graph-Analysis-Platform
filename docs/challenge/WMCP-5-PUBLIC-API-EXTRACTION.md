# WMCP-5-R2 - Authoritative Public API Extraction & AST Semantic Boundary

## 1. Purpose & Scope

This document establishes the deterministic source-of-truth representation of package and module public APIs (**WMCP-5 / WMCP-5-R2**):
- **Authoritative AST Extraction**: Reuses existing Tree-sitter multi-language parser infrastructure in `apps/analysis/src/ast_parser.rs`.
- **AST Symbol vs. Public API Symbol**: Enforces strict language-aware public exposure rules to exclude private, local, and unexported declarations.
- **Machine-Readable Completeness Authority**: Explicit `AnalysisStatus` (`Complete`, `Partial`, `Unsupported`) that participates in `surface_hash` to prevent malformed/partial extractions from masquerading as complete snapshots.
- **Injective Canonical Hashing (SHA-256 V1)**: Standard 64-character lowercase hexadecimal SHA-256 hashes for `signature_fingerprint` and `surface_hash` using big-endian u64 length-prefixed encoding and explicit sequence element counts to eliminate byte framing collisions.
- **Canonical Domain Separation**: Explicit domain tags `wmcp-public-api-signature-v1` and `wmcp-public-api-surface-v1` isolating signature fingerprints from surface hashes.
- **TypeScript Overload Authority**: Preserves declared `function_signature` overload declarations in `signatures` while excluding the internal union implementation `function_declaration` signature. Normal non-overloaded functions retain their implementation declaration as the public signature.
- **Java Visibility & Overload Preservation**: Child node `"modifiers"` traversal for `public` / `protected` visibility; Java method overloads preserved as distinct public callable signatures.
- **Python `__all__` Extraction**: Statically extracts literal `__all__` lists/tuples from Python AST; falls back with `AnalysisStatus::Partial` if dynamic.

### Non-Goals
- **No Snapshot Persistence**: Persistent filesystem/database snapshots belong to **WMCP-6**.
- **No Counterfactual / Breaking Decisions**: Breaking change detection and `simulate_api_changes` scenario evaluation belong to **WMCP-7**.
- **No SemVer / Version Compatibility Engine**: Version constraint resolution and ecosystem-specific SemVer/PEP 440 rules belong to **WMCP-8**.
- **No WebMCP Tool Activation**: `simulate_api_changes` remains `DEFERRED`.

---

## 2. Review Chronology & Upstream Reference

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **Starting HEAD**: `b85c7d8bf2a7e988e41e4064978c4700b5f6c52b`
- **Original WMCP-5 Initial Implementation**: `2ad5a3fe403cb9563cec9c344a1e96aa1a88704e` (RV: FAIL)
- **WMCP-5-R1 Hardening**: `b85c7d8bf2a7e988e41e4064978c4700b5f6c52b` (RV: FAIL - Framing collision & TS implementation signature leakage)
- **WMCP-4 Closure HEAD**: `2d208c94612ffe1c920d08a0a74c66653c8ee965`
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491` (verified unchanged)

---

## 3. Supported Language Capability Matrix

| Language | Tree-sitter Grammar | Existing Symbol Extractor | Visibility & Export Semantics Authority | WMCP-5-R2 Support Status |
| :--- | :--- | :--- | :--- | :--- |
| **JavaScript** | `tree-sitter-javascript` | `extract_js_symbols` | `export_statement`, `module.exports`, `is_exported` | **SUPPORTED** |
| **TypeScript** | `tree-sitter-typescript` | `extract_js_symbols` | `export_statement`, `interface`, `type`, `function_signature` (overloads) | **SUPPORTED** |
| **Python** | `tree-sitter-python` | `extract_python_symbols` | Literal `__all__` list/tuple AST extraction; underscore convention fallback | **SUPPORTED** |
| **Rust** | `tree-sitter-rust` | `extract_rust_symbols` | `pub`, `pub(crate)`, `pub(super)`, `impl` items | **SUPPORTED** |
| **Go** | `tree-sitter-go` | `extract_go_symbols` | Uppercase identifier capitalization | **SUPPORTED** |
| **Java** | `tree-sitter-java` | `extract_java_symbols` | Child node `"modifiers"` traversal (`public`, `protected`, `private`) | **SUPPORTED** |

---

## 4. Canonical Hash V1 Schema & Domain Separation

### Binary Encoding Rules
1. **Domain Prefix**: Pre-hash stream begins with big-endian u64 length followed by domain bytes:
   - Signature domain: `wmcp-public-api-signature-v1`
   - Surface domain: `wmcp-public-api-surface-v1`
2. **Variable-Length Fields**: Every string or byte slice is encoded with a big-endian `u64` byte length prefix before its raw UTF-8 bytes.
3. **Sequences & Lists**: Every collection is encoded with a big-endian `u64` element count before each individually framed element.
4. **Enum Discriminants**: Enums are encoded as explicit stable `u8` bytes without relying on `format!("{:?}")`:
   - `AnalysisStatus`: `0` = `Complete`, `1` = `Partial`, `2` = `Unsupported`.
   - `PublicApiScope`: `0` = `Module`, `1` = `Package`.

---

## 5. TypeScript Overload Contract

```typescript
export function parse(value: string): string;
export function parse(value: number): number;
export function parse(value: string | number): string | number {
    return value;
}
```

- **Overload Declarations**: `(value: string): string` and `(value: number): number` (`is_overload_signature == true`).
- **Implementation Declaration**: `(value: string | number): string | number` (`is_overload_signature == false`).
- **Public API Contract**: When overload declarations exist, `PublicApiSymbol.signatures` stores **only** the 2 declared overload signatures. The union implementation declaration is strictly excluded.
- **Ordinary Functions**: When no overload declarations exist, the exported function declaration is retained as the single public signature.
- **Implementation Refactoring Immunity**: Modifying the internal implementation body or implementation signature type while keeping public overload declarations unchanged leaves `signature_fingerprint` and `surface_hash` 100% identical.

---

## 6. Semantic Hash Payload Matrix

| Field | In `signature_fingerprint`? | In `surface_hash`? |
| :--- | :--- | :--- |
| `SIGNATURE_HASH_DOMAIN` | **YES** | **NO** |
| `SURFACE_HASH_DOMAIN` | **NO** | **YES** |
| `identity_key` | **NO** | **YES** (Length-prefixed) |
| `exported_name` | **YES** (Length-prefixed) | **YES** (Length-prefixed) |
| `normalized_signature` | **YES** (Length-prefixed) | **NO** (via fingerprint) |
| `signatures` (overload set) | **YES** (Count + Elements) | **NO** (via fingerprint) |
| `AnalysisStatus` | **NO** | **YES** (u8 Tag) |
| `PublicApiScope` | **NO** | **YES** (u8 Tag + Fields) |
| `Language` | **NO** | **YES** (u8 Tag) |
| `raw_signature` | **NO** | **NO** (Diagnostic only) |
| `file_path` | **NO** | **NO** (Provenance only) |
| `start_line` / `end_line` | **NO** | **NO** (Provenance only) |
| `warnings` | **NO** | **NO** (Diagnostic only) |

---

## 7. Hard-Coded Known-Value Verification

- **Signature Known-Value Test**:
  - Fixture: `fn add(a: i32, b: i32) -> i32`
  - Digest: `ae819b558e5c91441c0901d7e988f071b0f5aed88de816a3184ef833001ed86c`
- **Surface Known-Value Test**:
  - Fixture: Module `math` with `Rust::math::Function::add`
  - Digest: `c17db843e71e321fd9cb73bae56fe7e73fce8c968a73c3a6bda74168cf36a5aa`

---

## 8. Test & Verification Evidence

- **Rust Analysis Test Suite**: **41 / 41 PASS** (0 failed).
- **Workspace Cargo Suite**: **143 / 143 PASS** (0 failed).
- **Workspace Quality Check**: `cargo check --workspace --all-targets` $\to$ **0 errors** (Exit 0).
- **Frontend Regression Suite**: `npm --prefix apps/frontend run build` $\to$ **PASS** (Exit 0).
- **ASCII Scan**: 0 non-ASCII hyphens across all deliverable files.

---

## 9. Status

**WMCP-5-R2 IMPLEMENTED - PENDING FINAL INDEPENDENT RE-VERIFICATION**
