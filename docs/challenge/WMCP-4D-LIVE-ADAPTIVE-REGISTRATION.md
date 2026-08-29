# WMCP-4D - Live Adaptive Registration Lifecycle & React Composition Integration

## 1. Purpose & Scope

This document defines the live runtime orchestration and React provider integration that connects the previously closed layers of the WebMCP Challenge (**WMCP-4D**):
- **WMCP-4A**: Adaptive desired-surface derivation and single-owner registration lifecycle manager.
- **WMCP-4B**: Authoritative tool catalog distinguishing 7 EXECUTABLE (FROZEN schema) tools from 9 DEFERRED capabilities.
- **WMCP-4C**: Invocation-time logical surface admission, execution snapshot capture, and policy-specific context revision / stale completion guards.
- **WMCP-4D**: Live application composition binding canonical `WarRoomStatePort` transitions to dynamic browser `document.modelContext` registrations.

### Non-Goals
- Implementation of any of the 9 deferred capabilities (`calculate_blast_radius`, `simulate_api_changes`, etc.).
- Modification of closed domain, actions, state machine, or lifecycle contracts.

---

## 2. Review Chronology & Upstream Reference

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **WMCP-4A Closure HEAD**: `e527dd59963ef2b63184d6ed3d4e48b526e9e574`
- **WMCP-4B Closure HEAD**: `55898c865269494d84b3f89aae0f7c138a1da8e1`
- **WMCP-4C Closure HEAD**: `4e4229a8dfba4c8e3803c3ff2681714dc676a7d6`
- **Starting HEAD**: `4e4229a8dfba4c8e3803c3ff2681714dc676a7d6`
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Branch: `main`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491` (verified unchanged)

---

## 3. Pre-4D Composition Audit & Legacy Migration

### Pre-4D Runtime State
Prior to WMCP-4D, `WarRoomWebMcpBridge` (`apps/frontend/src/components/providers/war-room-webmcp-bridge.tsx`) mounted the static WMCP-3B primitive registration session (`createPrimitiveWebMcpRegistrationSession`) which unconditionally registered `search_packages` and `open_package_graph` upon exiting `BOOTSTRAP`.

### Migration to Single Adaptive Owner (INV-WMCP4D-003, INV-WMCP4D-004)
The static primitive registration session in `WarRoomWebMcpBridge` has been retired and replaced with `createLiveAdaptiveRegistrationSession`. Exactly one registration owner (`createWebMcpRegistrationOwner`) manages tool registrations for the mounted application provider. Primitive 3B contracts and tests remain preserved for historical parity, but duplicate runtime registration attempts are eliminated.

---

## 4. Logical vs. Registrable Tool Surface

WMCP-4D strictly distinguishes between logical intent and physical capability readiness:

1. **Logical Desired Surface** (`deriveDesiredToolSurface` from WMCP-4A):
   - Derives the canonical set of WebMCP tool names for the current phase, including future/deferred tools.
   - Remains the sole normative authority for phase-to-tool mapping (INV-WMCP4D-001).
2. **Registrable Tool Surface** (`deriveRegistrableToolSurface` in WMCP-4D):
   - Computes the intersection of the logical desired surface and the subset of the WMCP-4B catalog where `bindingStatus === "EXECUTABLE"` and `schemaStatus === "FROZEN"`.
   - Pure function with 0 side effects, 0 duplicate phase maps, and 0 factory invocations.
   - Deferred tools are filtered out before reaching `createAdaptiveToolDefinition`, ensuring 0 deferred factory exceptions (INV-WMCP4D-002).

### Current 7-Phase Registrable Tool Matrix

| Phase | Logical Desired Tools (4A) | Executable & Frozen Tools (4B) | Current Registrable Surface (4D) | Active Count |
| :--- | :--- | :--- | :--- | :--- |
| `BOOTSTRAP` | `[]` | N/A | `[]` | 0 |
| `IDLE` | `search_packages`, `open_package_graph` | `search_packages`, `open_package_graph` | `search_packages`, `open_package_graph` | 2 |
| `GRAPH_READY` | `summarize_graph`, `calculate_blast_radius`, `trace_dependency_path`, `focus_graph_nodes`, `open_package_graph` | `summarize_graph`, `trace_dependency_path`, `open_package_graph` | `summarize_graph`, `trace_dependency_path`, `open_package_graph` | 3 |
| `NODE_SELECTED` | `inspect_selected_package`, `calculate_blast_radius`, `trace_dependency_path`, `focus_graph_nodes` | `inspect_selected_package`, `trace_dependency_path` | `inspect_selected_package`, `trace_dependency_path` | 2 |
| `SIMULATION_READY` | `inspect_scenario`, `recalculate_scenario`, `set_scenario_priority`, `set_scenario_exclusion`, `simulate_api_changes`, `trace_dependency_path`, `focus_graph_nodes` | `inspect_scenario`, `trace_dependency_path` | `inspect_scenario`, `trace_dependency_path` | 2 |
| `HUMAN_REVIEW` | `generate_migration_plan`, `recalculate_scenario`, `set_scenario_priority`, `set_scenario_exclusion`, `inspect_critical_paths`, `focus_critical_path` | (All deferred) | `[]` | 0 |
| `PLAN_READY` | `inspect_migration_plan`, `generate_migration_plan`, `recalculate_scenario`, `inspect_critical_paths`, `focus_critical_path` | `inspect_migration_plan` | `inspect_migration_plan` | 1 |

---

## 5. Live Session Architecture & Lifecycle Rules

### Startup Ordering (INV-WMCP4D-006)
`LiveAdaptiveRegistrationSession.start()` subscribes to `WarRoomStatePort` before evaluating the initial state snapshot. Any concurrent state transition occurring between subscription and snapshot evaluation is safely handled by the single-owner reconciler.

### Retained Tools (INV-WMCP4D-008)
When state transitions between phases sharing a common tool (e.g. `GRAPH_READY` $\to$ `NODE_SELECTED` for `trace_dependency_path`), the active registration and its `AbortSignal` lifetime are retained without unregistering or re-registering.

### Removed Tools (INV-WMCP4D-009)
When a tool exits the registrable surface, its registration-lifetime `AbortController` is aborted, removing the tool from the physical platform.

### Rapid Overlapping Transitions (INV-WMCP4D-011)
When rapid transitions occur while browser `registerTool()` calls are in-flight (e.g. `IDLE` $\to$ `GRAPH_READY` $\to$ `NODE_SELECTED`), the hardened 4A lifecycle owner cancels stale in-flight promises and converges the physical surface to the latest valid registrable surface.

### Signal Separation & 4C Execution Safety (INV-WMCP4D-005, INV-WMCP4D-010, INV-WMCP4D-044)
Registration lifetime `AbortController` is strictly isolated from invocation execution `AbortSignal`. If physical unregistration experiences lag, WMCP-4C logical admission independently checks capability state at invocation start and immediately rejects retired definitions with `INVALID_STATE` (0 action calls).

### Progressive Enhancement & Foreign Tools (INV-WMCP4D-015, INV-WMCP4D-016)
When WebMCP is `UNAVAILABLE` or platform registration fails, the React application and human UI continue functioning without interruption. The adaptive lifecycle owner only manages its own registered tools and never touches foreign tools registered on `document.modelContext`.

### StrictMode & Disposal (INV-WMCP4D-012, INV-WMCP4D-013)
Each React effect run creates a fresh, isolated session and lifecycle owner. Provider unmount disposes the session, unsubscribes state listeners, and aborts owned active registrations.

---

## 6. Test Evidence & Quality Validation

- **Focused Live Registration Suite** (`e2e/war-room-webmcp-live-registration.spec.ts`): **29 / 29 PASS** (1.1s)
  - 4D-T1: Logical vs registrable surface distinction
  - 4D-T2..T8: Exact 7-phase registrable surfaces (including empty `HUMAN_REVIEW` and single-tool `PLAN_READY`)
  - 4D-T9: Zero deferred factory calls across all phase transitions
  - 4D-T10..T11: Startup ordering (from `BOOTSTRAP` to `IDLE` and pre-initialized `IDLE`)
  - 4D-T12: `trace_dependency_path` retained across `GRAPH_READY` $\to$ `NODE_SELECTED`
  - 4D-T13: Removed registrations aborted and unregistered
  - 4D-T14: Re-entered tools receive fresh registration lifetime
  - 4D-T15: Rapid in-flight registration transitions converge to latest surface
  - 4D-T16: `HUMAN_REVIEW` removes all active registrations cleanly
  - 4D-T17: Platform `UNAVAILABLE` produces 0 registrations
  - 4D-T18: Registration rejection progressive enhancement
  - 4D-T19..T20: Session disposal removes registrations and ignores post-disposal state changes
  - 4D-T21: StrictMode remount creates fresh valid session
  - 4D-T22: Foreign tool registrations preserved during adaptive cleanup
  - 4D-T23: Registration removal does not cancel admitted tolerant read
  - 4D-T24: Strict contextual read maintains `STALE_CONTEXT` across live transition
  - 4D-T25: Physical removal lag protected by 4C `INVALID_STATE` admission
  - 4D-T26: Agent `open_package_graph` triggers live `IDLE` $\to$ `GRAPH_READY` surface update
  - 4D-T27: Human package selection triggers live `GRAPH_READY` $\to$ `NODE_SELECTED` surface update
  - 4D-T28: Agent `inspect_selected_package` operates on human-selected package
  - 4D-T29: Single live ownership verified (exactly 1 registration attempt per primitive in `IDLE`)
  - 4D-T30: Zero deferred tools ever physically registered
- **Full Unit & Integration Regression Suite (9 specs, 275 tests)**: **275 / 275 PASS** (3.4s)
- **Browser E2E Regression Suite (3 specs, 21 tests)**: **21 / 21 PASS** (21.7s)
- **Total Automated Test Count**: **296 / 296 PASS**
- **TypeScript**: `npx tsc --noEmit` -> **0 errors** (Exit 0)
- **ESLint**: `npm run lint` -> **0 errors, 0 warnings** (Exit 0)
- **Next.js Production Build**: Compiled successfully in 5.4s (15/15 static pages, Exit 0)
- **ASCII Scan**: 0 non-ASCII hyphens (`U+2013 = 0`, `U+2014 = 0`) across all deliverable files

---

## 7. Acceptance Gates Matrix (4D-1 to 4D-58)

| Gate ID | Description | Status |
| :--- | :--- | :--- |
| **4D-1** | Starting HEAD exact `4e4229a8dfba4c8e3803c3ff2681714dc676a7d6` | **PASS** |
| **4D-2** | WMCP-4A remains unchanged | **PASS** |
| **4D-3** | WMCP-4B remains unchanged | **PASS** |
| **4D-4** | WMCP-4C remains unchanged | **PASS** |
| **4D-5** | Upstream pin unchanged (`41d12f057167ccf5954dbcf49d99502cb6c84491`) | **PASS** |
| **4D-6** | Current live composition independently reconstructed | **PASS** |
| **4D-7** | Legacy primitive runtime ownership explicitly audited | **PASS** |
| **4D-8** | Exactly one live adaptive registration owner per provider lifetime | **PASS** |
| **4D-9** | No simultaneous static primitive + adaptive ownership | **PASS** |
| **4D-10** | Logical desired surface comes only from 4A | **PASS** |
| **4D-11** | Registrable surface is logical desired intersect executable catalog | **PASS** |
| **4D-12** | No production duplicate phase map | **PASS** |
| **4D-13** | Deferred tools filtered before factory invocation | **PASS** |
| **4D-14** | No deferred factory exceptions in normal live reconciliation | **PASS** |
| **4D-15** | `BOOTSTRAP` surface exact (`[]`) | **PASS** |
| **4D-16** | `IDLE` surface exact (2 tools) | **PASS** |
| **4D-17** | `GRAPH_READY` surface exact (3 tools) | **PASS** |
| **4D-18** | `NODE_SELECTED` surface exact (2 tools) | **PASS** |
| **4D-19** | `SIMULATION_READY` surface exact (2 tools) | **PASS** |
| **4D-20** | `HUMAN_REVIEW` current registrable surface is exactly empty (`[]`) | **PASS** |
| **4D-21** | `PLAN_READY` current registrable surface exactly `inspect_migration_plan` | **PASS** |
| **4D-22** | State subscription installed safely relative to initial snapshot | **PASS** |
| **4D-23** | No canonical transition can be permanently missed during startup | **PASS** |
| **4D-24** | Existing 4A lifecycle owner performs reconciliation | **PASS** |
| **4D-25** | No second registration ownership engine added | **PASS** |
| **4D-26** | Retained tools do not churn | **PASS** |
| **4D-27** | Removed tool registration lifetime ends correctly | **PASS** |
| **4D-28** | Re-entered tool receives fresh lifetime registration | **PASS** |
| **4D-29** | Rapid overlapping transitions converge to latest registrable surface | **PASS** |
| **4D-30** | Stale pending registration cannot resurrect old tool | **PASS** |
| **4D-31** | Provider cleanup unsubscribes state listener | **PASS** |
| **4D-32** | Provider cleanup disposes registration owner | **PASS** |
| **4D-33** | Disposed session cannot reconcile again | **PASS** |
| **4D-34** | React Strict Mode / remount safe | **PASS** |
| **4D-35** | No browser API access during SSR render | **PASS** |
| **4D-36** | Platform availability uses existing adapter abstraction | **PASS** |
| **4D-37** | No unsupported platform availability subscription invented | **PASS** |
| **4D-38** | Platform unavailable leaves human UI functional | **PASS** |
| **4D-39** | Registration failure remains progressive enhancement | **PASS** |
| **4D-40** | Foreign tools remain untouched | **PASS** |
| **4D-41** | Registration lifetime remains separate from execution lifetime | **PASS** |
| **4D-42** | Admitted tolerant read survives registration removal per 4C | **PASS** |
| **4D-43** | Strict contextual read still uses 4C stale semantics | **PASS** |
| **4D-44** | Physical registration lag is protected by 4C admission | **PASS** |
| **4D-45** | Agent `open_package_graph` drives live `IDLE` $\to$ `GRAPH_READY` surface update | **PASS** |
| **4D-46** | Human package selection drives live `GRAPH_READY` $\to$ `NODE_SELECTED` update | **PASS** |
| **4D-47** | Agent `inspect_selected_package` consumes human-selected canonical context | **PASS** |
| **4D-48** | Primitive WMCP-3B contracts remain unchanged | **PASS** |
| **4D-49** | No future deterministic capability implemented | **PASS** |
| **4D-50** | No business algorithm duplicated | **PASS** |
| **4D-51** | No new public error taxonomy introduced | **PASS** |
| **4D-52** | Focused 4D tests PASS (29/29) | **PASS** |
| **4D-53** | Full relevant regression PASS (275/275) | **PASS** |
| **4D-54** | Browser E2E live registration PASS (21/21) | **PASS** |
| **4D-55** | TypeScript/lint/build PASS | **PASS** |
| **4D-56** | Documentation truthful | **PASS** |
| **4D-57** | Known user files untouched | **PASS** |
| **4D-58** | ASCII requirements PASS (0 non-ASCII dashes) | **PASS** |

---

## 8. Status

**WMCP-4D IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
