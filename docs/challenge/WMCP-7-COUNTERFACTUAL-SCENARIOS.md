# WMCP-7 - Counterfactual API Scenario Engine

## 1. Purpose & Scope

This document defines the deterministic, source-backed counterfactual API scenario engine (**WMCP-7 / WMCP-7A**):
- **Core Question**: Given one committed authoritative API snapshot and an explicit hypothetical API patch, what would the resulting public API surface be, and what semantic breaking changes would the existing breaking detector report?
- **Authority Grounding**:
  - Consumes authoritative committed `PublicApiSurface` instances from WMCP-6 `SnapshotRepository::get_by_id`.
  - Reuses WMCP-5 canonical SHA-256 surface hashing and symbol grouping authority.
  - Reuses the existing semantic `BreakingDetector` via the lossless `surface_to_snapshot` adapter.
- **Zero-Write Invariant**: Counterfactual evaluations are purely analytical and **never** write candidate surfaces to `SnapshotRepository` (0 snapshot blobs, 0 history records).
- **Explicit, Bounded Patch Operations**:
  - `REMOVE_SYMBOL`: Removes target public symbol by stable identity.
  - `RENAME_SYMBOL`: Renames exported and qualified name while updating signatures and fingerprints.
  - `CHANGE_RETURN_TYPE`: Updates return type on target symbol signatures.
  - `CHANGE_PARAMETER_TYPE`: Updates parameter type on target symbol signatures.
  - `ADD_REQUIRED_PARAMETER`: Adds a required parameter to target symbol signatures.
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
- **Starting HEAD**: `a8728a547b890b495e35a3e8d41bf70745592e6f` (WMCP-6 Closure)
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
        ├── 1. Clone Baseline & Apply Typed Operations (Immutable Baseline)
        ├── 2. Compute Candidate PublicApiSurface
        │        └── Compute Canonical Surface Hash (WMCP-5 SHA-256)
        ├── 3. Convert Baseline & Candidate to PublicApiSnapshot (surface_to_snapshot)
        ├── 4. Execute BreakingDetector::detect_breaking_changes
        └── 5. Deterministically Sort Breaking Findings (symbol_path, type, desc)
                  │
                  ▼
  [ CounterfactualScenarioResult ]
        (In-Memory Result, Zero Repository Writes)
```

---

## 4. Test & Verification Evidence

- **Rust Analysis Test Suite**: **48 / 48 PASS** (0 failed).
- **Workspace Cargo Suite**: **150 / 150 PASS** (0 failed).
- **Workspace Quality Check**: `cargo check --workspace --all-targets` -> **0 errors** (Exit 0).
- **Frontend Regression Suite**: `npm --prefix apps/frontend run build` -> **PASS** (Exit 0).
- **ASCII Scan**: 0 non-ASCII hyphens across all deliverable files.

---

## 5. Status

**WMCP-7A IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
