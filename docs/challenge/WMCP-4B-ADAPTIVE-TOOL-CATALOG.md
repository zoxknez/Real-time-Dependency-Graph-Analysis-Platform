# WMCP-4B - Adaptive Tool Catalog, Schema Contract & Authority Binding Freeze

## 1. Purpose & Scope

This document defines the authoritative tool catalog, strict JSON input schemas, annotation contracts, and authority bindings for the complete canonical WebMCP tool vocabulary (**WMCP-4B**).

WMCP-4B freezes the tool interface and connects every tool to its authoritative underlying capability without duplicating deterministic domain calculations or pulling future-phase business logic forward into the WebMCP layer.

### Key Goals Achieved in WMCP-4B
- **Complete Canonical Vocabulary**: Authoritative catalog definitions for all 16 canonical WebMCP actions.
- **Authority Binding Matrix**: Explicit classification of every tool into `EXISTING_ACTION`, `EXISTING_READ_MODEL`, `EXISTING_UI_PROJECTION`, or `FUTURE_DETERMINISTIC_CAPABILITY`.
- **Strict JSON Schemas**: Strict JSON schemas with `additionalProperties: false`, bounded types, and strict rejection of security tokens or context revisions.
- **Fail-Closed Deferred Capabilities**: Tools awaiting future domain engines (AST analysis, Blast Radius math, scenario priority, critical path analysis) fail closed on definition instantiation without returning fake success or stubbed calculations.
- **Preservation of Closed Contracts**: Unchanged semantics for primitive tools (`search_packages`, `open_package_graph`) and zero modifications to closed WMCP-2 domain/application layers or WMCP-4A lifecycle owners.

---

## 2. Review Starting State & Upstream Pin

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **Starting HEAD**: `e527dd59963ef2b63184d6ed3d4e48b526e9e574`
- **Starting Parent**: `75e7db9d81d78ff5a4e0565e113417ceb0658721`
- **WMCP-4A Closure HEAD**: `e527dd59963ef2b63184d6ed3d4e48b526e9e574`
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Branch: `main`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491`

---

## 3. Canonical WebMCP Tool Vocabulary

The canonical WebMCP surface consists of exactly 16 tools:

1. `search_packages`
2. `open_package_graph`
3. `summarize_graph`
4. `calculate_blast_radius`
5. `trace_dependency_path`
6. `focus_graph_nodes`
7. `inspect_selected_package`
8. `simulate_api_changes`
9. `inspect_scenario`
10. `set_scenario_priority`
11. `set_scenario_exclusion`
12. `recalculate_scenario`
13. `generate_migration_plan`
14. `inspect_critical_paths`
15. `inspect_migration_plan`
16. `focus_critical_path`

---

## 4. Complete Authority Binding Matrix

| Tool Name | Phase(s) | Authority | Classification | Binding Status | Future Dependency (if Deferred) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `search_packages` | `IDLE` | `WarRoomActions.searchPackages` | `EXISTING_ACTION` | `EXECUTABLE` | N/A |
| `open_package_graph` | `IDLE`, `GRAPH_READY` | `WarRoomActions.openPackageGraph` | `EXISTING_ACTION` | `EXECUTABLE` | N/A |
| `summarize_graph` | `GRAPH_READY` | `WarRoomState.graph` | `EXISTING_READ_MODEL` | `EXECUTABLE` | N/A |
| `calculate_blast_radius` | `GRAPH_READY`, `NODE_SELECTED`, `SIMULATION_READY` | Version-Aware Blast Radius Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | WMCP-8 (Version-Aware Blast Radius Engine) |
| `trace_dependency_path` | `GRAPH_READY`, `NODE_SELECTED`, `SIMULATION_READY` | `WarRoomActions.traceDependencyPath` | `EXISTING_ACTION` | `EXECUTABLE` | N/A |
| `focus_graph_nodes` | `GRAPH_READY`, `NODE_SELECTED`, `SIMULATION_READY` | `WarRoomVisualFocusPort.focusNodes` | `EXISTING_UI_PROJECTION` | `EXECUTABLE` | N/A |
| `inspect_selected_package` | `NODE_SELECTED` | `WarRoomActions.inspectPackage` | `EXISTING_ACTION` | `EXECUTABLE` | N/A (context-bound to `selection.package.id`) |
| `simulate_api_changes` | `NODE_SELECTED` | AST Breaking Change Analyzer | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | WMCP-5 / WMCP-6 (AST Extraction & Change Engine) |
| `inspect_scenario` | `SIMULATION_READY` | `WarRoomState.scenario` | `EXISTING_READ_MODEL` | `EXECUTABLE` | N/A |
| `set_scenario_priority` | `SIMULATION_READY`, `HUMAN_REVIEW` | Scenario Business Priority Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | WMCP-7 / WMCP-10 (Scenario Priority Engine) |
| `set_scenario_exclusion` | `SIMULATION_READY` | Scenario Exclusion Rules Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | WMCP-7 (Scenario Exclusion Engine) |
| `recalculate_scenario` | `HUMAN_REVIEW`, `PLAN_READY` | `WarRoomActions.recalculateScenario` | `EXISTING_ACTION` | `EXECUTABLE` | N/A |
| `generate_migration_plan` | `HUMAN_REVIEW` | `WarRoomActions.generateMigrationPlan` | `EXISTING_ACTION` | `EXECUTABLE` | N/A |
| `inspect_critical_paths` | `HUMAN_REVIEW` | Critical Path Analysis Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | WMCP-10 (Human Business Review Expansion) |
| `inspect_migration_plan` | `PLAN_READY` | `WarRoomState.plan` | `EXISTING_READ_MODEL` | `EXECUTABLE` | N/A |
| `focus_critical_path` | `PLAN_READY` | Critical Path Visual Focus Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | WMCP-12 (Unified Critical Path Visual Focus) |

---

## 5. Input Schema & Annotations Contract

All schemas strictly enforce:
- `type: "object"`
- `additionalProperties: false`
- Explicit property bounds (string lengths, integer ranges, array limits)
- Zero security/credential properties (`token`, `jwt`, `tenantId`, `securityContext`, `contextRevision` rejected during validation)

| Tool Name | Input Properties | Required Fields | ReadOnlyHint | UntrustedContentHint |
| :--- | :--- | :--- | :--- | :--- |
| `search_packages` | `query` (string 1..120), `ecosystem` (enum), `limit` (int 1..8) | `["query"]` | `true` | `true` |
| `open_package_graph` | `rootPackageId` (string 1..256), `depth` (int 1..4) | `["rootPackageId"]` | `false` | `true` |
| `summarize_graph` | `{}` | `[]` | `true` | `true` |
| `calculate_blast_radius` | `packageId` (string 1..256), `targetVersion` (string 1..128) | `[]` | `true` | `true` |
| `trace_dependency_path` | `sourcePackageId` (string 1..256), `targetPackageId` (string 1..256), `maxDepth` (int 1..6) | `["sourcePackageId", "targetPackageId"]` | `true` | `true` |
| `focus_graph_nodes` | `nodeIds` (array of strings 1..50, item 1..256) | `["nodeIds"]` | `true` | `true` |
| `inspect_selected_package` | `{}` | `[]` | `true` | `true` |
| `simulate_api_changes` | `packageId` (string 1..256), `proposedVersion` (string 1..128) | `["proposedVersion"]` | `false` | `true` |
| `inspect_scenario` | `{}` | `[]` | `true` | `true` |
| `set_scenario_priority` | `priority` (enum: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) | `["priority"]` | `false` | `true` |
| `set_scenario_exclusion` | `packageId` (string 1..256), `excluded` (boolean) | `["packageId", "excluded"]` | `false` | `true` |
| `recalculate_scenario` | `{}` | `[]` | `false` | `true` |
| `generate_migration_plan` | `{}` | `[]` | `false` | `true` |
| `inspect_critical_paths` | `{}` | `[]` | `true` | `true` |
| `inspect_migration_plan` | `{}` | `[]` | `true` | `true` |
| `focus_critical_path` | `pathIndex` (int 0..10) | `[]` | `true` | `true` |

---

## 6. Output & Error Envelope Conventions

- **Character Budget**: All executable tools produce output envelopes strictly respecting the <= 1500 character budget (`MAX_TOTAL_OUTPUT_CHARS`).
- **Canonical Error Codes**: Tool execution failures return standardized domain error codes (`INVALID_INPUT`, `INVALID_STATE`, `STALE_CONTEXT`, `NOT_FOUND`, `UNAVAILABLE`, `CANCELLED`, `INTERNAL_ERROR`).
- **Sanitized Errors**: Error messages are trimmed to <= 240 characters without leaking raw stack traces, internal paths, or backend exceptions.

---

## 7. Architectural Boundary & Non-Duplication Evidence

- WebMCP bridge code acts strictly as an adapter boundary between AI agents and application services.
- WebMCP modules contain **zero** independent implementations of:
  - AST parsing / Babel / Acorn / TypeScript compiler AST traversal
  - SemVer or PEP 440 mathematical constraint evaluation
  - Blast Radius graph calculations
  - Scenario conflict resolution rules
  - Migration plan synthesis
  - Authorization / tenant security logic

---

## 8. Quality & Regression Test Suite

- **New WMCP-4B Test Suite** (`apps/frontend/e2e/war-room-webmcp-adaptive-tools.spec.ts`): **12 / 12 PASS**
- **Unit & Integration Regression (225 tests)**: **225 / 225 PASS**
  - `war-room-webmcp-adaptive-tools.spec.ts`: 12 / 12 PASS
  - `war-room-webmcp-lifecycle.spec.ts`: 22 / 22 PASS
  - `war-room-webmcp-registration.spec.ts`: 40 / 40 PASS
  - `war-room-webmcp-platform.spec.ts`: 42 / 42 PASS
  - `war-room-domain.spec.ts`: 28 / 28 PASS
  - `war-room-actions.spec.ts`: 51 / 51 PASS
  - `war-room-integration.spec.ts`: 30 / 30 PASS
- **Browser E2E Regression (20 tests)**: **20 / 20 PASS**
  - `war-room-webmcp-agent-ui.spec.ts`: 7 / 7 PASS
  - `war-room-human-ui.spec.ts`: 5 / 5 PASS
  - `homepage.spec.ts`: 8 / 8 PASS
- **Total Automated Test Suite**: **245 / 245 PASS**
- **TypeScript**: 0 errors (`npx tsc --noEmit`)
- **ESLint**: 0 errors, 0 warnings (`npm run lint`)
- **Next.js Production Build**: Exit 0 in 5.6s (15/15 static routes compiled)
- **npm audit**: 0 vulnerabilities
- **ASCII Scan**: 0 non-ASCII hyphens (U+2013 count = 0, U+2014 count = 0)

---

## 9. File Scope Classification

### Added Production Modules
- `apps/frontend/src/lib/webmcp/bridge/adaptive-catalog.ts`: Static catalog definitions, schemas, annotations, and authority binding classifications.
- `apps/frontend/src/lib/webmcp/bridge/adaptive-validation.ts`: Strict input validators for adaptive tools.
- `apps/frontend/src/lib/webmcp/bridge/adaptive-tools.ts`: Executable platform tool definition factory for all 10 executable tools, failing closed for 6 deferred capabilities.

### Modified Production Modules
- `apps/frontend/src/lib/webmcp/bridge/index.ts`: Re-exports adaptive catalog, validation, and tool modules.

### Added Test Suite
- `apps/frontend/e2e/war-room-webmcp-adaptive-tools.spec.ts`: 12 comprehensive unit and factory tests.

### Challenge Documentation
- `docs/challenge/WMCP-4B-ADAPTIVE-TOOL-CATALOG.md`: This authoritative contract document.

---

## 10. Deferred Work to Later Phases

- **WMCP-4C**: Execution-time stale-context (`STALE_CONTEXT`) revision audit and execution wrapper hardening across all adaptive tools.
- **WMCP-4D**: Live lifecycle composition connecting `WebMcpRegistrationOwner` to active application state transitions.
- **WMCP-5 / WMCP-6**: AST extraction and breaking change change engine (authority for `simulate_api_changes`).
- **WMCP-7**: Scenario priority and exclusion engine (authority for `set_scenario_priority`, `set_scenario_exclusion`).
- **WMCP-8**: Version-aware Blast Radius engine (authority for `calculate_blast_radius`).
- **WMCP-10**: Human business review expansion and bottleneck analysis (authority for `inspect_critical_paths`).
- **WMCP-12**: Unified critical path visual graph focus (authority for `focus_critical_path`).

---

## 11. Acceptance Gates Matrix (4B-1 to 4B-25)

| Gate ID | Requirement Description | Status |
| :--- | :--- | :--- |
| **4B-1** | Starting HEAD exact `e527dd59963ef2b63184d6ed3d4e48b526e9e574` | **PASS** |
| **4B-2** | WMCP-4A lifecycle implementation unchanged | **PASS** |
| **4B-3** | Upstream pin unchanged (`41d12f057167ccf5954dbcf49d99502cb6c84491`) | **PASS** |
| **4B-4** | Every canonical WebMCP tool has exactly one catalog entry (16/16) | **PASS** |
| **4B-5** | Every tool has a source-backed authority classification | **PASS** |
| **4B-6** | No tool mapped to unrelated action merely to make it executable | **PASS** |
| **4B-7** | Every tool has a bounded, deterministic input schema | **PASS** |
| **4B-8** | Security input exclusion strictly enforced | **PASS** |
| **4B-9** | Primitive tool contracts (`search_packages`, `open_package_graph`) preserved | **PASS** |
| **4B-10** | Action-backed executable tools invoke `WarRoomActions` | **PASS** |
| **4B-11** | Zero new deterministic domain algorithms in WebMCP layer | **PASS** |
| **4B-12** | Deferred capabilities explicitly classified and cannot fake execution | **PASS** |
| **4B-13** | Deferred definitions cannot be instantiated or registered live | **PASS** |
| **4B-14** | Executable tool outputs formatted within <= 1500 character budget | **PASS** |
| **4B-15** | Canonical error taxonomy preserved | **PASS** |
| **4B-16** | Execution signal separation preserved | **PASS** |
| **4B-17** | Catalog completeness compile/test guard enforced | **PASS** |
| **4B-18** | All new 4B tests PASS (12/12) | **PASS** |
| **4B-19** | Full regression suite PASS (245/245 total) | **PASS** |
| **4B-20** | TypeScript, ESLint, Next.js build PASS | **PASS** |
| **4B-21** | Scope exact and narrow | **PASS** |
| **4B-22** | Zero silent modifications to closed domain/action/platform/lifecycle layers | **PASS** |
| **4B-23** | Forensic documentation accurately distinguishes executable from deferred | **PASS** |
| **4B-24** | Untracked user files (`AGENTS.md`, `CLAUDE.md`) untouched and uncommitted | **PASS** |
| **4B-25** | Zero U+2013 and zero U+2014 in 4B-controlled files | **PASS** |

---

## 12. Final Status

**IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
