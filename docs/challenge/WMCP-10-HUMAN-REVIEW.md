# WMCP-10: Human Business Review & Critical Migration Paths

## 1. Overview & Architectural Boundaries

WMCP-10 introduces human business review annotations and deterministic critical path inspection to the War Room platform:
1. **Explicit Business Priority Classification (`set_scenario_priority`):** Assigns explicit business priority (`P0`..`P3`) with optional rationale notes to affected entities in upgrade simulation scenarios.
2. **Deterministic Scenario Exclusion (`set_scenario_exclusion`):** Configures entity exclusion flags (`excluded: boolean`) with mandatory justifications (1–240 chars) for out-of-scope services or legacy consumers.
3. **Deterministic Critical Path Inspection (`inspect_critical_paths`):** Computes canonical dependency paths from prioritized packages to the scenario target package, ordered strictly by business priority (`P0` -> `P3`), then shortest hop count, then lexical tie-breaking.

### Non-Negotiable Boundaries
- **Zero Fabricated Risk Scores:** Business priority is an explicit human/agent governance choice. The system **never** invents synthetic CVSS scores, probability metrics, or machine-learned priority assignments.
- **Critical Paths are Pure Topology:** A critical path demonstrates graph connectivity from a prioritized affected consumer down to the upgrade target. It does **not** imply that intermediate transit dependencies contain breaking changes.
- **Shared Application Authority:** Both Human UI and WebMCP Agent invoke identical application actions (`WarRoomActions.setScenarioPriority`, `WarRoomActions.setScenarioExclusion`, `WarRoomActions.inspectCriticalPaths`) enforcing equal security, authorization, and stale context checks.

---

## 2. Business Review Priority & Exclusion Model

### 2.1 Priority Tiers
| Tier | Semantics | Typical Use Case |
| :--- | :--- | :--- |
| `P0` | Urgent Blocker | Critical production revenue path or core service requiring immediate migration coordination. |
| `P1` | High Priority | Important upstream dependency with significant downstream consumers. |
| `P2` | Medium Priority | Standard service consumer capable of migrating within regular release cycles. |
| `P3` | Low / Informational | Auxiliary, internal tooling, or dev-only consumer with minimal runtime impact. |

### 2.2 Exclusion Rules
- Entities marked with `excluded: true` must provide a non-empty `reason` (1–240 characters).
- Exclusion does not delete graph nodes or break analysis records; it tags the entity in `state.review.items` with `excluded: true` and `exclusionReason`.
- In `inspect_critical_paths`, excluded entities are truthfully projected with `isExcluded: true`.

### 2.3 State Machine Transitions
- From `SIMULATION_READY`: Invocations emit `HUMAN_ANNOTATED`, transitioning the store into `HUMAN_REVIEW` and attaching `state.review`.
- From `HUMAN_REVIEW`: Invocations emit `ANNOTATION_CHANGED`, updating `state.review` items while preserving the `HUMAN_REVIEW` phase.

---

## 3. Critical Path Ordering & Output Budgeting

### 3.1 Deterministic Ordering Algorithm
Critical paths returned by `inspect_critical_paths` are sorted using a strict three-level comparator:
1. **Priority Rank Ascending:** `P0` (0) -> `P1` (1) -> `P2` (2) -> `P3` (3).
2. **Hop Count Ascending:** Shorter paths with fewer intermediate packages appear first.
3. **Lexical Tie-Breaking:** `sourceEntityId` ascending lexicographical comparison.

### 3.2 Result Bounding
- Default `maxPaths`: 5 (configurable between 1 and 10).
- Total identified paths are truthfully reported via `totalPaths`, with `returnedPaths` and `truncated: boolean`.
- All output envelopes strictly conform to the `<= 1500` characters WebMCP safety budget.

---

## 4. WebMCP Canonical Tool Matrix (Post WMCP-10)

| Tool Name | Authority | Classification | Binding Status | Schema Status |
| :--- | :--- | :--- | :--- | :--- |
| `search_packages` | `WarRoomActions.searchPackages` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `open_package_graph` | `WarRoomActions.openPackageGraph` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `summarize_graph` | `WarRoomState.graph` | `EXISTING_READ_MODEL` | `EXECUTABLE` | `FROZEN` |
| `calculate_blast_radius` | `WarRoomActions.calculateBlastRadius` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `trace_dependency_path` | `WarRoomActions.traceDependencyPath` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `focus_graph_nodes` | `WarRoomActions.focusGraphNodes` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `inspect_selected_package` | `WarRoomState.selection` / `WarRoomActions.inspectPackage` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `simulate_api_changes` | `WarRoomActions.createScenario -> recalculate` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `inspect_scenario` | `WarRoomState.scenario` | `EXISTING_READ_MODEL` | `EXECUTABLE` | `FROZEN` |
| `recalculate_scenario` | `WarRoomActions.recalculateScenario` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `inspect_migration_plan` | `WarRoomState.plan` | `EXISTING_READ_MODEL` | `EXECUTABLE` | `FROZEN` |
| **`set_scenario_priority`** | **`WarRoomActions.setScenarioPriority`** | **`EXISTING_ACTION`** | **`EXECUTABLE` (WMCP-10)** | **`FROZEN`** |
| **`set_scenario_exclusion`** | **`WarRoomActions.setScenarioExclusion`** | **`EXISTING_ACTION`** | **`EXECUTABLE` (WMCP-10)** | **`FROZEN`** |
| **`inspect_critical_paths`** | **`WarRoomActions.inspectCriticalPaths`** | **`EXISTING_ACTION`** | **`EXECUTABLE` (WMCP-10)** | **`FROZEN`** |
| `generate_migration_plan` | Migration Planning Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` (WMCP-11) | `FROZEN` |
| `focus_critical_path` | Critical Path Visual Focus Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` (WMCP-12) | `FROZEN` |

- **Total Canonical Tools:** 16
- **Executable Tools:** 14
- **Deferred Tools:** 2 (`generate_migration_plan`, `focus_critical_path`)
- **Schema Readiness:** 16 FROZEN, 0 PENDING_DOMAIN_CONTRACT
