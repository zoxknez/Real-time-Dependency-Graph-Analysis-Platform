# WMCP-7B / WMCP-7B-R1 - Production War Room Counterfactual Integration

## 1. Purpose & Scope

This document defines the production integration of the **WMCP-7A Counterfactual API Scenario Engine** into the **War Room architecture (WMCP-7B / WMCP-7B-R1)**:
- **Single Authority Convergence**: Human UI and future WebMCP Agent callers converge through `WarRoomActions.recalculateScenario`, ensuring zero duplication of scenario analysis business logic.
- **Authoritative Committed Baseline Resolution (WMCP-7B-R1)**:
  - `snapshot_id`: Explicit committed WMCP-6 snapshot identifier. Resolved via `SnapshotRepository::get_by_id`. Validated against `envelope.subject == target_package_id` and `envelope.scope == PublicApiScope::Package`. Contradictory requests with mismatching `base_version` fail closed (`400 BAD_REQUEST`).
  - `base_version`: Exact WMCP-6 revision string for the target package's Package-scope snapshot. Never interpreted as a snapshot ID. Resolved by exact filtering: `subject == target_package_id`, `scope == PublicApiScope::Package`, `revision == base_version`. Requires exactly 1 match (0 matches $\to$ `404 NOT_FOUND`, >1 matches $\to$ `500 INTERNAL_ERROR`).
  - **Zero "latest" guessing**: Missing or uncommitted baseline snapshots fail closed (`404 NOT_FOUND` / `INVALID_INPUT`).
  - Storage root uses the exact WMCP-6 production contract: `ANALYSIS_SNAPSHOT_DIR` (`SnapshotRepository::open_from_env()`).
- **Production Execution Path**:
  - Executes `CounterfactualScenarioEngine::evaluate_committed_snapshot(...)`.
  - Evaluates purely in-memory with **zero speculative persistence** (0 snapshot blobs, 0 history records written).
- **Exact Patch Translation**:
  - Full bidirectional mapping for all 6 operations: `REMOVE_SYMBOL`, `RENAME_SYMBOL`, `CHANGE_RETURN_TYPE`, `CHANGE_PARAMETER_TYPE`, `ADD_REQUIRED_PARAMETER`, and `CHANGE_VISIBILITY`.
- **Response Bounds & Truncation Metadata (WMCP-7B-R1)**:
  - `MAX_BREAKING_CHANGES_RETURNED = 100` constant cap.
  - Exposes `total_breaking_changes`, `returned_breaking_changes`, and `breaking_changes_truncated` metadata.
  - Truncation preserves deterministic order from the counterfactual engine without re-sorting.
- **Proxy Cancellation Depth (WMCP-7B-R1)**:
  - Browser `AbortSignal` forwarded through Next.js proxy route (`signal: request.signal`) to upstream fetch.
  - Client state prevented from applying cancelled analysis (`CANCELLED`).
- **Truthful Downstream Impact**:
  - `affectedEntityIds` remains `[]` (truthful: no speculative or unproven downstream blast-radius claims).
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
                  │ (HTTP / API Transport with AbortSignal)
                  ▼
    [ Next.js Same-Origin Proxy ] (/api/analysis/scenarios/evaluate)
                  │ (Upstream fetch with signal forwarding)
                  ▼
   [ POST /analysis/scenarios/evaluate ]
                  │
                  ├── 1. Resolve Coordinate Authority from SnapshotRepository (ANALYSIS_SNAPSHOT_DIR)
                  │      - snapshot_id: get_by_id + subject binding + Package scope binding
                  │      - base_version: list_history + Package scope + exact revision binding
                  ├── 2. Validate Patch & String Bounds (MAX_OPERATIONS, etc.)
                  ├── 3. Execute CounterfactualScenarioEngine::evaluate_committed_snapshot
                  └── 4. Return Bounded EvaluateScenarioResponse (hashes, changed, total/returned counts, BreakingChangeDto[])
                  │
                  ▼
     [ WarRoomStatePort Transition ]
                  │
                  ▼
         ( SIMULATION_READY )
```

---

## 3. Test Depth & Verification Strategy

- **Backend Integration Tests** (`apps/api/src/handlers.rs`):
  - `7B-R1-T1`: Package vs Module with same revision string selects Package-scope snapshot.
  - `7B-R1-T2`: Foreign subject snapshot ID rejected.
  - `7B-R1-T3`: Foreign subject with same revision string cannot cross package boundary.
  - `7B-R1-T4`: snapshot_id + base_version mismatch fails closed.
  - `7B-R1-T5`: base_version is never interpreted as snapshot ID.
  - `7B-R1-T6`: Missing exact Package coordinate returns NOT_FOUND.
  - `7B-R1-T7..T10`: Response bounding below, at, and above cap (100) with deterministic finding order.
- **Frontend Playwright Tests** (`apps/frontend/e2e/war-room-scenario-integration.spec.ts`):
  - Unit and adapter integration tests using Playwright runner with in-memory `fetchMock` verifying exact mapping, state machine transitions, context revision races, and abort handling.

---

## 4. Status

**WMCP-7B-R1 IMPLEMENTED - PENDING FINAL NARROW VERIFICATION**
