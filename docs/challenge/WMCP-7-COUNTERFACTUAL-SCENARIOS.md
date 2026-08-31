# WMCP-7 - Counterfactual API Scenario Engine

## 1. Purpose & Scope

This document defines the deterministic, source-backed counterfactual API scenario engine (**WMCP-7 / WMCP-7A / WMCP-7A-R1**):
- **Core Question**: Given one committed authoritative API snapshot and an explicit hypothetical API patch, what would the resulting public API surface be, and what semantic breaking changes would the existing breaking detector report?
- **Authority Grounding**:
  - Consumes authoritative committed `PublicApiSurface` instances from WMCP-6 `SnapshotRepository::get_by_id`.
  - Reuses WMCP-5 canonical SHA-256 surface hashing, signature fingerprinting, and symbol identity authority (`PublicApiExtractor::compute_identity_key`).
  - Reuses the existing semantic `BreakingDetector` via the lossless `surface_to_snapshot` adapter.
- **Zero-Write Invariant**: Counterfactual evaluations are purely analytical and **never** write candidate surfaces to `SnapshotRepository` (0 snapshot blobs, 0 history records).
- **Canonical Rename Identity & Collision Safety**:
  - `RENAME_SYMBOL` updates `exported_name`, `qualified_name`, signature strings, signature fingerprints, and recomputes the canonical `identity_key` using WMCP-5 authority (`PublicApiExtractor::compute_identity_key`).
  - Renaming a symbol to a colliding identity, qualified name, or exported name is rejected before surface assembly with `ScenarioEngineError::ConflictingOperations`.
- **Explicit Domain Input Bounds**:
  - `MAX_OPERATIONS`: 256 operations per patch
  - `MAX_OPERATION_ID_LEN`: 128 bytes
  - `MAX_SCENARIO_ID_LEN`: 128 bytes
  - `MAX_SYMBOL_PATH_LEN`: 512 bytes
  - `MAX_NEW_SYMBOL_PATH_LEN`: 512 bytes
  - `MAX_PARAMETER_NAME_LEN`: 128 bytes
  - `MAX_TYPE_EXPRESSION_LEN`: 512 bytes
  - Empty or whitespace-only required string fields are rejected with `ScenarioEngineError::InvalidPatch`.
- **Explicit, Bounded Patch Operations**:
  - `REMOVE_SYMBOL`: Removes target public symbol by stable identity.
  - `RENAME_SYMBOL`: Renames exported and qualified name while updating signatures, fingerprints, and canonical `identity_key`.
  - `CHANGE_RETURN_TYPE`: Updates return type across declared public signatures for target symbol.
  - `CHANGE_PARAMETER_TYPE`: Updates parameter type across matching declared signatures for target symbol.
  - `ADD_REQUIRED_PARAMETER`: Adds a required parameter across declared public signatures for target symbol.
  - `CHANGE_VISIBILITY`: Reduces visibility from public to non-public (removing it from public API surface).
- **Determinism**: Identical baseline + patch yields bit-for-bit identical candidate surface hash, symbols, and deterministically sorted breaking findings across 100+ iterations.
- **Strict Boundaries**:
  - **No SemVer / PEP 440 Version Range Compatibility**: Version ordering and dependency constraint solving belong to **WMCP-8**.
  - **No Graph Reachability Conflation**: Topological dependency graph reachability is not mislabeled as confirmed compatibility breakage.
  - **No Migration Planning**: Automated migration step generation belongs to future phases.
  - **WebMCP Tool State**: `simulate_api_changes` remains `DEFERRED` during WMCP-7A.

---

## 2. Review Chronology & Upstream Reference

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **Starting HEAD**: `cadfcd4eddfac1142f53c217073f001e885ba835`
- **Parent HEAD**: `a8728a547b890b495e35a3e8d41bf70745592e6f` (WMCP-6 Closure)
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491` (verified unchanged)

---

## 3. Architecture & Data Flow

```
[ Committed Baseline Snapshot (V1) ]
                  │
                  ▼
      [ ScenarioPatch Operations ]
                  │
                  ▼
[ CounterfactualScenarioEngine::evaluate_surface ]
        │
        ├── 1. Validate Input Bounds & Check Conflicting Operations
        ├── 2. Clone Baseline & Apply Typed Operations (Immutable Baseline)
        │        └── Recompute Canonical identity_key on Rename (WMCP-5)
        │        └── Validate Rename Non-Collision
        ├── 3. Compute Candidate PublicApiSurface
        │        └── Compute Canonical Surface Hash (WMCP-5 SHA-256)
        ├── 4. Convert Baseline & Candidate to PublicApiSnapshot (surface_to_snapshot)
        ├── 5. Execute BreakingDetector::detect_breaking_changes
        └── 6. Deterministically Sort Breaking Findings (symbol_path, type, desc)
                  │
                  ▼
  [ CounterfactualScenarioResult ]
        (In-Memory Result, Zero Repository Writes)
```

---

## 4. Test & Verification Evidence

- **Rust Analysis Test Suite**: **49 / 49 PASS** (0 failed).
- **Workspace Cargo Suite**: **151 / 151 PASS** (0 failed).
- **Workspace Quality Check**: `cargo check --workspace --all-targets` -> **0 errors** (Exit 0).
- **Frontend Regression Suite**: `npm --prefix apps/frontend run build` -> **PASS** (Exit 0).
- **ASCII Scan**: 0 non-ASCII hyphens across all deliverable files.

---

## 5. Status

**WMCP-7A-R1 IMPLEMENTED - PENDING FINAL NARROW VERIFICATION**
