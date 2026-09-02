# WMCP-7C: WebMCP Scenario Tool Exposure

## Executive Summary

Phase **WMCP-7C** safely exposes counterfactual scenario simulation to WebMCP AI agents by promoting exactly two tools—`simulate_api_changes` and `recalculate_scenario`—from `DEFERRED` to `EXECUTABLE` binding status. The remaining seven deferred tools remain strictly deferred, maintaining the total WebMCP vocabulary at exactly 16 tools.

Crucially, WebMCP never interacts directly with backend analysis endpoints (`/api/analysis/scenarios/evaluate`) or internal Rust engines (`CounterfactualScenarioEngine`). Instead, WebMCP acts strictly as an adapter converging through the exact same application port—`WarRoomActions`—used by the Human UI, passing `channel: "AGENT"`.

---

## 1. Authority and Vocabulary Matrix

The total tool vocabulary remains frozen at 16 canonical tools. In WMCP-7C, the authority matrix is updated as follows:

| Tool Name | Binding Status | Schema Status | Classification | Authority / Orchestration Target |
|:---|:---:|:---:|:---:|:---|
| `search_packages` | `EXECUTABLE` | `FROZEN` | `PRIMITIVE_TOOL` | `WarRoomActions.searchPackages` |
| `open_package_graph` | `EXECUTABLE` | `FROZEN` | `PRIMITIVE_TOOL` | `WarRoomActions.openPackageGraph` |
| `summarize_graph` | `EXECUTABLE` | `FROZEN` | `READ_MODEL` | `statePort.getState().graph` |
| `trace_dependency_path` | `EXECUTABLE` | `FROZEN` | `EXISTING_ACTION` | `WarRoomActions.traceDependencyPath` |
| `inspect_selected_package` | `EXECUTABLE` | `FROZEN` | `READ_MODEL` | `statePort.getState().selection` |
| **`simulate_api_changes`** | **`EXECUTABLE`** | **`FROZEN`** | **`EXISTING_ACTION`** | **`WarRoomActions.createScenario -> WarRoomActions.recalculateScenario`** |
| `inspect_scenario` | `EXECUTABLE` | `FROZEN` | `READ_MODEL` | `statePort.getState().scenario + analysis` |
| **`recalculate_scenario`** | **`EXECUTABLE`** | **`FROZEN`** | **`EXISTING_ACTION`** | **`WarRoomActions.recalculateScenario`** |
| `inspect_migration_plan` | `EXECUTABLE` | `FROZEN` | `READ_MODEL` | `statePort.getState().migrationPlan` |
| `calculate_blast_radius` | `DEFERRED` | `FROZEN` | `DEFERRED_ACTION` | WMCP-8 Candidate |
| `focus_graph_nodes` | `DEFERRED` | `PENDING_DOMAIN_CONTRACT` | `DEFERRED_ACTION` | WMCP-8 Candidate |
| `set_scenario_priority` | `DEFERRED` | `PENDING_DOMAIN_CONTRACT` | `DEFERRED_ACTION` | WMCP-8 Candidate |
| `set_scenario_exclusion` | `DEFERRED` | `PENDING_DOMAIN_CONTRACT` | `DEFERRED_ACTION` | WMCP-8 Candidate |
| `generate_migration_plan` | `DEFERRED` | `FROZEN` | `DEFERRED_ACTION` | WMCP-8 Candidate |
| `inspect_critical_paths` | `DEFERRED` | `FROZEN` | `DEFERRED_ACTION` | WMCP-8 Candidate |
| `focus_critical_path` | `DEFERRED` | `FROZEN` | `DEFERRED_ACTION` | WMCP-8 Candidate |

---

## 2. Tool Architecture & Invariants

### 2.1 Target Package Selection Authority
Agents cannot arbitrarily supply `targetPackageId` or `snapshotId` in tool payloads. Target package resolution is derived exclusively from the currently selected package in state:
- Source: `snapshot.state.selection.package.id`
- If no package is currently selected, the tool immediately fails closed with code `INVALID_STATE`.

### 2.2 Baseline Version Authority (F-7C-1 Correction)
The baseline version is a **REQUIRED** explicit WebMCP tool input:
- `baseVersion` must be explicitly provided in `simulate_api_changes` input (`minLength: 1, maxLength: 128`).
- `selectedPackage.version` is ecosystem/catalog metadata (from npm, crates.io, package.json, or dependency graph edges) and is **NOT** used as WMCP-6 snapshot revision authority.
- No heuristic fallback or speculative resolution (no latest guessing, semver-max, or network inspection) is permitted.
- Missing or empty `baseVersion` fails closed immediately with `INVALID_INPUT` during input validation before `WarRoomActions.createScenario` or any backend interaction can occur.

### 2.3 Strict Schema & Operation Discrimination
`simulate_api_changes` enforces `additionalProperties: false` and strictly typed discriminated unions across all six supported operation kinds:
1. `REMOVE_SYMBOL`: `{ kind: "REMOVE_SYMBOL", symbolPath: string }`
2. `RENAME_SYMBOL`: `{ kind: "RENAME_SYMBOL", symbolPath: string, newSymbolPath: string }`
3. `CHANGE_RETURN_TYPE`: `{ kind: "CHANGE_RETURN_TYPE", symbolPath: string, newReturnType: string }`
4. `CHANGE_PARAMETER_TYPE`: `{ kind: "CHANGE_PARAMETER_TYPE", symbolPath: string, parameterName: string, newType: string }`
5. `ADD_REQUIRED_PARAMETER`: `{ kind: "ADD_REQUIRED_PARAMETER", symbolPath: string, parameterName: string, parameterType: string }`
6. `CHANGE_VISIBILITY`: `{ kind: "CHANGE_VISIBILITY", symbolPath: string, newVisibility: ScenarioVisibility }`
   Valid visibility values: `["public", "private", "protected", "internal", "crate", "super"]`.

Operations count is bounded to $1 \le N \le 32$. `required: ["baseVersion", "operations"]`.

### 2.4 Two-Action Orchestration & Context Revision Handoff
`simulate_api_changes` orchestrates two canonical actions sequentially:
1. `actions.createScenario({ channel: "AGENT", capturedContextRevision: snapshot.contextRevision, signal }, { scenario })`
2. On success, extracts `createRes.contextRevision` (which advanced the state revision).
3. Invokes `actions.recalculateScenario({ channel: "AGENT", capturedContextRevision: createRes.contextRevision, signal })`.
4. If recalculation fails, no silent rollback or `resetScenario` is triggered; the failure is returned directly to the agent.

### 2.5 Single-Action Adapter: recalculate_scenario
`recalculate_scenario` is a thin one-action adapter:
- Invokes `actions.recalculateScenario({ channel: "AGENT", capturedContextRevision: snapshot.contextRevision, signal })`.
- Fails closed if no active scenario is present (`INVALID_STATE`).

### 2.6 Signal Isolation: Registration Lifecycle vs. Execution Signal (7C-T25 / F-7C-2)
Crucial separation between signals is maintained and proven:
- `registrationLifetimeSignal`: Provided by WebMCP adaptive surface reconciliation to track when a tool is unmounted/unregistered from the platform when leaving a phase.
- `executionSignal`: Provided during a specific tool call execution context (`execContext.signal`).
- When `simulate_api_changes` executes and creates a scenario, the War Room state transitions to `SIMULATION_READY`. The reconciler unregisters `simulate_api_changes` from the platform, aborting its registration lifetime signal.
- In test `7C-T25`, direct assertions prove:
  - `expect(capturedRegistrationSignal.aborted).toBe(true)`
  - `expect(executionAbortController.signal.aborted).toBe(false)`
  - The in-flight execution completes successfully because it relies solely on `executionSignal`.

### 2.7 Budgeted Output Formatting & Surrogate-Safe Truncation (F-7C-3)
Output is strictly bounded to $\le 1500$ UTF-16 code units (target $\le 1400$ chars):
- Baseline and candidate surface hashes are truncated with prefixing (`abc12345...`).
- Findings are displayed up to a maximum of 5 items.
- Error messages are truncated with code-point safety using `sliceUtf16Safe`, preventing non-BMP surrogate pairs from being split into lone surrogates across truncation boundaries.
- Server-side truncation (`serverTruncated`) and WebMCP output truncation (`outputTruncated`) are tracked separately and truthfully.

### 2.8 Read Model Projection: inspect_scenario
`inspect_scenario` inspects the active scenario and projects analysis summaries if analysis is present:
- Does not invoke any mutating or recalculating action.
- Returns `hasAnalysis: false` truthfully if recalculation has not been run.

---

## 3. Verification & Compliance Evidence

### Automated Test Suites
- **`apps/frontend/e2e/war-room-webmcp-scenario-tools.spec.ts`**: 52 tests passing across browser profiles covering `7C-T1` through `7C-T50` and `7C-R1-T1` through `7C-R1-T13`.
- **`apps/frontend/e2e/war-room-webmcp-adaptive-tools.spec.ts`**: Updated and passing with 9 executable and 7 deferred tools.
- **`apps/frontend/e2e/war-room-webmcp-execution-guard.spec.ts`**: Updated and passing with action commit policies for new tools.
- **`apps/frontend/e2e/war-room-webmcp-live-registration.spec.ts`**: 58 tests passing verifying live registration transitions and reconciliation.
- **Full Frontend E2E Suite**: 744+ tests passing (0 failures).
- **Frontend Production Build**: `next build --webpack` completed cleanly with zero TypeScript errors.
- **Workspace Rust Suite**: `cargo test --workspace` passed (100% ok).
- **Cargo Clippy**: `cargo clippy --workspace --all-targets -- -D warnings` passed with 0 warnings.
- **Cargo Fmt**: `cargo fmt --all -- --check` passed with 0 formatting discrepancies.
