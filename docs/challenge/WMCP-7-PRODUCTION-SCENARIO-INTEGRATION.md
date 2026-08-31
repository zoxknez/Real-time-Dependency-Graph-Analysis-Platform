# WMCP-7B - Production War Room Counterfactual Integration

## 1. Purpose & Scope

This document defines the production integration of the **WMCP-7A Counterfactual API Scenario Engine** into the **War Room architecture (WMCP-7B)**:
- **Single Authority Convergence**: Human UI and future WebMCP Agent callers converge through `WarRoomActions.recalculateScenario`, ensuring zero duplication of scenario analysis business logic.
- **Authoritative Committed Baseline**:
  - `WarRoomScenario` specifies target package and authoritative `baseVersion` (or explicit snapshot ID).
  - Snapshot resolution occurs strictly via WMCP-6 `SnapshotRepository::get_by_id` or `list_history` exact version match.
  - **Zero "latest" guessing**: Missing or uncommitted baseline snapshots fail closed (`404 NOT_FOUND` / `INVALID_INPUT`).
  - Storage root uses the exact WMCP-6 production contract: `ANALYSIS_SNAPSHOT_DIR` (`SnapshotRepository::open_from_env()`).
- **Production Execution Path**:
  - Executes `CounterfactualScenarioEngine::evaluate_committed_snapshot(...)`.
  - Evaluates purely in-memory with **zero speculative persistence** (0 snapshot blobs, 0 history records written).
- **Exact Patch Translation**:
  - Full bidirectional mapping for all 6 operations: `REMOVE_SYMBOL`, `RENAME_SYMBOL`, `CHANGE_RETURN_TYPE`, `CHANGE_PARAMETER_TYPE`, `ADD_REQUIRED_PARAMETER`, and `CHANGE_VISIBILITY`.
- **Truthful Downstream Impact**:
  - `affectedEntityIds` remains `[]` (truthful: no speculative or unproven downstream blast-radius claims).
- **Stale Context & Race Protection**:
  - `sourceContextRevision` and `capturedContextRevision` ensure late async analysis responses cannot corrupt newer context states.
  - Abort signals cancel inflight HTTP requests without unhandled rejections.
- **WebMCP Boundary**:
  - `simulate_api_changes` and `recalculate_scenario` remain strictly **DEFERRED** in WebMCP tool registries during 7B. (WebMCP adaptive projection is owned by **WMCP-7C**).
  - No SemVer / PEP 440 version range solving (owned by **WMCP-8**).
  - No migration planning (owned by future phases).

---

## 2. Architecture & Data Flow

```
   [ Human UI / Future WebMCP Agent ]
                  │
                  ▼
         [ WarRoomActions ]
                  │
                  ▼
    [ WarRoomScenarioAnalysisPort ]
                  │ (HTTP / API Transport)
                  ▼
   [ POST /analysis/scenarios/evaluate ]
                  │
                  ├── 1. Resolve Committed Baseline from SnapshotRepository (ANALYSIS_SNAPSHOT_DIR)
                  ├── 2. Validate Patch & String Bounds (MAX_OPERATIONS, etc.)
                  ├── 3. Execute CounterfactualScenarioEngine::evaluate_committed_snapshot
                  └── 4. Return EvaluateScenarioResponse (hashes, changed, BreakingChangeDto[])
                  │
                  ▼
     [ WarRoomStatePort Transition ]
                  │
                  ▼
         ( SIMULATION_READY )
```

---

## 3. Verification & Quality Evidence

- **Frontend Test Suite**: **702 / 702 PASS** (0 failed).
- **Frontend Production Build**: `npm --prefix apps/frontend run build` $\to$ **PASS** (Exit 0).
- **Rust Workspace Compilation**: `cargo check --workspace --all-targets` $\to$ **0 errors** (Exit 0).
- **Rust Workspace Tests**: `cargo test --workspace` $\to$ **151 / 151 PASS** (Exit 0).
- **Rust Analysis Tests**: `cargo test -p analysis` $\to$ **49 / 49 PASS** (Exit 0).

---

## 4. Status

**WMCP-7B IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
