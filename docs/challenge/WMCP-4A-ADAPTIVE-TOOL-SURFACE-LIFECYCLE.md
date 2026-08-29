# WMCP-4A - Adaptive Tool Surface Contract & Registration Lifecycle Baseline

## 1. Purpose & Scope

This document defines the architectural contract, pure derivation models, and registration lifecycle reconciler for the **Adaptive WebMCP Tool Surface** (**WMCP-4A**).

WMCP-4A establishes the foundation for dynamically adapting exposed WebMCP tools based on canonical application state without destabilizing or replacing the closed WMCP-3 platform contracts and primitive bridges.

### Key Questions Resolved in WMCP-4A
- **State-Driven Surface**: Which WebMCP tools are eligible for agent invocation in each application phase (`BOOTSTRAP`, `IDLE`, `GRAPH_READY`, `NODE_SELECTED`, `SIMULATION_READY`, `HUMAN_REVIEW`, `PLAN_READY`).
- **Registration Ownership**: A single authoritative lifecycle owner (`WebMcpRegistrationOwner`) manages tool registrations via pinned upstream `AbortSignal` lifetime semantics.
- **In-Flight Registration Adoption**: In-flight (`PENDING`) registrations are tracked by the owner and adopted by newer reconciliation passes, preventing duplicate browser registration collisions and accidental teardowns (`INV-WMCP4-RACE-002`, `INV-WMCP4-RACE-003`).
- **Deterministic Identity**: Stable action identifiers (`WebMcpActionName`) ensure deterministic reconciliation across renders and state changes.
- **Idempotent Reconciliation**: `computeReconciliationPlan` diffs actual vs desired surfaces and performs zero additional platform calls on unchanged states.
- **Capability Loss Resilience**: When WebMCP capability disappears, all active and pending owned registrations are cleanly disposed while standard Human application workflows continue uninterrupted (`INV-WMCP4-CAP-001..003`).
- **Concurrency & Race Safety**: Registration lifecycle ownership belongs to the lifecycle owner rather than transient reconciliation passes.

---

## 2. Review Starting State & Upstream Pin

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **Starting HEAD for WMCP-4A Initial**: `cc070929613c9d7dbc57974f8c49aeaaf50bd996`
- **Starting HEAD for WMCP-4A-R2**: `75e7db9d81d78ff5a4e0565e113417ceb0658721`
- **Closed Dependencies**:
  - `WMCP-3A` (Platform Contract & Type Boundary) `PASS - CLOSED` at `993fb4b10dbb1a060424494a1adad081020f782a`
  - `WMCP-3B` (Primitive Registration Bridge) `PASS - CLOSED` at `565c7a80a30eaf1fc5296921d0be32e8a5acebc3`
  - `WMCP-3R` (Foundation Final Review) `PASS - CLOSED` at `cc070929613c9d7dbc57974f8c49aeaaf50bd996`
  - Complete `WMCP-3` (WebMCP Foundation Track) `PASS - CLOSED` at `cc070929613c9d7dbc57974f8c49aeaaf50bd996`
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Branch: `main`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491`

---

## 3. Pinned-Upstream Lifecycle Audit

Against pinned upstream SHA `41d12f057167ccf5954dbcf49d99502cb6c84491` (`index.bs`):

| Question | Pinned Upstream Specification Answer | Exact Evidence from `index.bs` |
| :--- | :--- | :--- |
| **ModelContext Location** | Readonly attribute on `Document` | `[SecureContext, SameObject] readonly attribute ModelContext modelContext;` |
| **registerTool Signature** | `registerTool(Tool tool, optional ModelContextRegisterToolOptions options = {})` | `Promise<undefined> registerTool(Tool tool, optional ModelContextRegisterToolOptions options = {});` |
| **Registration Options** | `dictionary ModelContextRegisterToolOptions { AbortSignal signal; sequence<DOMString> exposedTo; };` | Supports `signal` for unregister lifetime and `exposedTo` for frame visibility. |
| **Lifecycle / Unregister Mechanism** | Aborting `ModelContextRegisterToolOptions.signal` removes the tool from `ModelContext` | There is NO `unregisterTool(name)` or `updateTool()`. Unregistering is performed exclusively via the registration's `AbortSignal`. |
| **AbortSignal Behavior** | Two distinct signals: (1) Registration lifetime signal in options, (2) Execution signal in callback options | Registration signal removes tool from context; callback execution signal cancels in-flight invocation. |
| **Duplicate Name Behavior** | Rejects registration with `InvalidStateError` if tool name already exists | `If map contains a tool with name, reject with InvalidStateError.` |
| **Registration Failure Behavior** | Returns rejected Promise with standard DOMException (`InvalidStateError`, `AbortError`, etc.) | Async Promise rejection. |
| **Permission / Security** | Requires `SecureContext`; optional origin filtering via `exposedTo` | `[SecureContext]` enforced on interface. |
| **Tool-Change Notification** | `ontoolchange` attribute on `ModelContext` (`EventTarget`) | `attribute EventHandler ontoolchange;` fired on tool registration/removal. |

---

## 4. Preservation of WMCP-3 Closed Contracts

WMCP-4A builds directly upon WMCP-3 without modifying closed foundation contracts:
- **Capability Detection Boundary**: `WebMcpPlatformAdapter` and `apps/frontend/src/lib/webmcp/platform/` preserved untouched.
- **Ambient Browser Types**: `apps/frontend/src/types/webmcp.d.ts` preserved untouched.
- **Primitive Tools & Bridges**: `apps/frontend/src/lib/webmcp/bridge/` preserved untouched.
- **Application Action Signatures**: `WarRoomActions.searchPackages(invocation, request)` and `openPackageGraph(invocation, request)` preserved untouched.
- **Security Boundary**: Trusted identity resolution via `WarRoomSecurityContextPort` preserved untouched.
- **Output Budget**: Hard <= 1500 character budget preserved untouched.
- **Progressive Enhancement**: Unaffected Human UI and non-WebMCP browser workflows preserved untouched.

---

## 5. WMCP-4A-R1 Independent Review & Finding (WMCP4A-RACE-001)

- **Reviewed HEAD**: `75e7db9d81d78ff5a4e0565e113417ceb0658721`
- **Verdict**: `FAIL`
- **Finding ID**: `WMCP4A-RACE-001` (Severity: `HIGH`)
- **Failing Invariant**: `INV-WMCP4-RACE-002`
- **Defect Description**:
  The initial WMCP-4A owner tracked registrations solely in `activeRegistrations` after `await platform.registerTool(...)` resolved. When Pass 1 initiated `registerTool('A')` and the Promise remained pending, Pass 2 (also requesting `A`) saw `activeRegistrations` empty, issued a concurrent `platform.registerTool('A')` call, and failed with `InvalidStateError`. Subsequently, when Pass 1's Promise settled, Pass 1 detected that it had been superseded by Pass 2 and aborted `A`, resulting in `A` being completely lost from both the browser and the active registry despite Pass 2 requiring `A`.
- **R2 Corrective Strategy**:
  Introduce explicit `pendingRegistrations` ownership in `WebMcpRegistrationOwner`. When a newer reconciliation pass desires tool `T` that is currently in flight, the owner adopts the pending registration flight, enforces single-flight registration, and checks settlement conditions against authoritative latest desired intent.

---

## 6. WMCP-4 Adaptive Capability & Registration Architecture

```
+-------------------------------------------------------------------------+
|                  Application Capability State (Zustand)                 |
|                                                                         |
|  { phase, webMcpAvailability, contextRevision, selectedPackageId, ... } |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|             Pure Desired Tool Surface Derivation (surface.ts)           |
|                                                                         |
|  deriveDesiredToolSurface(state):                                       |
|    - BOOTSTRAP       -> []                                              |
|    - IDLE            -> [search_packages, open_package_graph]           |
|    - GRAPH_READY     -> [summarize_graph, calculate_blast_radius,       |
|                          trace_dependency_path, focus_graph_nodes,      |
|                          open_package_graph]                            |
|    - NODE_SELECTED   -> [inspect_selected_package, ...]                 |
|    - SIMULATION_READY-> [inspect_scenario, ...]                         |
|    - HUMAN_REVIEW    -> [recalculate_scenario, ...]                     |
|    - PLAN_READY      -> [inspect_migration_plan, ...]                   |
|    - UNAVAILABLE     -> []                                              |
+------------------------------------+------------------------------------+
                                     | WebMcpDesiredSurface
                                     v
+-------------------------------------------------------------------------+
|        Authoritative Registration Lifecycle Owner (lifecycle-owner.ts)  |
|                                                                         |
|  Tracks:                                                                |
|    - activeRegistrations: Map<WebMcpActionName, Entry>                  |
|    - pendingRegistrations: Map<WebMcpActionName, PendingEntry>          |
|    - latestDesiredSurface: WebMcpDesiredSurface                         |
|                                                                         |
|  Reconciliation Lifecycle:                                              |
|    1. Update latestDesiredSurface                                       |
|    2. If UNAVAILABLE -> abort active and pending, clear both maps       |
|    3. Abort un-desired active registrations (ACTIVE -> REMOVED)         |
|    4. Abort un-desired pending registrations (PENDING -> ABORT)         |
|    5. For each desired tool T:                                          |
|         - if ACTIVE -> retain                                           |
|         - if PENDING -> adopt existing flight (INV-WMCP4-RACE-002/003)  |
|         - if ABSENT -> initiate single flight (ABSENT -> PENDING)       |
|    6. On settlement: promote to ACTIVE only if still in latest desired  |
+-------------------------------------------------------------------------+
```

---

## 7. Registration Ownership & Invariants

- **Single Owner (`INV-WMCP4-OWN-001`)**: Exactly one authoritative lifecycle owner (`WebMcpRegistrationOwner`) manages tool registrations for the application runtime.
- **Decoupled Consumers (`INV-WMCP4-OWN-002`)**: Components declare desired capability state; they do not directly invoke raw browser `registerTool()`.
- **Duplicate Prevention (`INV-WMCP4-OWN-003`)**: Unmount, remount, route transitions, and re-initializations cannot accumulate duplicate registrations.
- **In-Flight Registration Adoption (`INV-WMCP4-RACE-002`)**: If a registration for tool `T` is in flight and the newest desired surface requires `T`, the owner adopts the pending flight without duplicate platform calls or accidental aborts.
- **Single Registration Flight (`INV-WMCP4-RACE-003`)**: The lifecycle owner never issues concurrent duplicate `platform.registerTool()` calls for the same tool name.

---

## 8. Registration Identity & Lifetime Invariants

- **Deterministic Identity (`INV-WMCP4-ID-001`)**: Tool identities are exact strings (`WebMcpActionName`) drawn from the locked state-to-tools specification.
- **State Invariance (`INV-WMCP4-ID-002`)**: Changing unrelated application state does not alter tool registration identity.
- **Obsolete Tool Teardown (`INV-WMCP4-LIFE-001`)**: When a tool leaves the desired surface, its dedicated `AbortController.abort()` signal is triggered.
- **Zero Redundant Operations (`INV-WMCP4-LIFE-002`)**: Unchanged tools in the desired set are retained without re-registration.
- **Idempotent Disposal (`INV-WMCP4-LIFE-003`)**: `dispose()` terminates all active owned tool registrations and marks the owner disposed.
- **Isolated Lifecycles (`INV-WMCP4-LIFE-004`)**: Disposing one tool registration does not unregister or corrupt other active tools.
- **Complete Owner Disposal (`INV-WMCP4-LIFE-005`)**: `dispose()` aborts both active and pending registrations, leaving 0 active registrations and 0 pending ownership.

---

## 9. Capability Loss Resilience (INV-WMCP4-CAP-001..003)

- **Non-Fatal Capability Loss (`INV-WMCP4-CAP-001`)**: Loss of WebMCP capability cannot break the underlying Human application.
- **Active Teardown on Loss (`INV-WMCP4-CAP-002`)**: When `platform.isAvailable()` returns `false`, active registrations are immediately aborted.
- **Pending Cancellation on Loss (`INV-WMCP4-CAP-003`)**: Capability loss immediately aborts all pending registrations, preventing late Promise settlement from resurrecting tools.

---

## 10. Concurrency & Reconciliation Race Safety

- **Asynchronous Stale Pass Protection (`INV-WMCP4-RACE-001`)**: Completed registrations from superseded passes do not resurrect obsolete tools.
- **In-Flight Adoption (`INV-WMCP4-RACE-002`)**: In-flight registrations requested by newer passes are adopted and promoted to active.
- **Single Flight (`INV-WMCP4-RACE-003`)**: One registration flight per tool name prevents browser duplicate registration errors.

---

## 11. Invariant Matrix

| Invariant ID | Title | Status in WMCP-4A-R2 | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **INV-WMCP4-OWN-001** | Single Authoritative Lifecycle Owner | **PASS** | `createWebMcpRegistrationOwner` maintains unified active/pending maps |
| **INV-WMCP4-OWN-002** | Decoupled Surface Consumption | **PASS** | Consumers pass `WebMcpDesiredSurface` to reconciler |
| **INV-WMCP4-OWN-003** | Remount Duplicate Immunity | **PASS** | Tests 10 and 14 in lifecycle spec |
| **INV-WMCP4-ID-001** | Deterministic Registration Identity | **PASS** | Stable `WebMcpActionName` enum strings |
| **INV-WMCP4-ID-002** | Unrelated State Invariance | **PASS** | Test 3 in lifecycle spec |
| **INV-WMCP4-LIFE-001** | Obsolete Tool Removal | **PASS** | Test 11, Test R2-3 in lifecycle spec |
| **INV-WMCP4-LIFE-002** | Zero Redundant Re-Registration | **PASS** | Test 10 in lifecycle spec |
| **INV-WMCP4-LIFE-003** | Idempotent Disposal | **PASS** | Test 14 in lifecycle spec |
| **INV-WMCP4-LIFE-004** | Isolated Tool Lifecycles | **PASS** | Test 11, Test R2-2 in lifecycle spec |
| **INV-WMCP4-LIFE-005** | Complete Owner Disposal | **PASS** | Test 14, Test R2-5 in lifecycle spec |
| **INV-WMCP4-CAP-001** | Non-Breaking Capability Loss | **PASS** | Test 13 in lifecycle spec |
| **INV-WMCP4-CAP-002** | Complete Teardown on Loss | **PASS** | Test 13 in lifecycle spec |
| **INV-WMCP4-CAP-003** | Capability Loss Cancels Pending Registrations | **PASS** | Test R2-4 in lifecycle spec |
| **INV-WMCP4-RACE-001** | Asynchronous Reconciliation Race Safety | **PASS** | Test 15, Test R2-7 in lifecycle spec |
| **INV-WMCP4-RACE-002** | In-Flight Registration Adoption | **PASS** | Test R2-1, Test R2-2 in lifecycle spec |
| **INV-WMCP4-RACE-003** | Single Platform Registration Flight | **PASS** | Test R2-1 in lifecycle spec |
| **INV-WMCP4-CTX-001** | Context Revision Tracking Foundation | **PASS** | Structural revision tracking established |

---

## 12. Quality Suite & Execution Evidence

- **WMCP-4A Lifecycle Suite** (`apps/frontend/e2e/war-room-webmcp-lifecycle.spec.ts`): **22 / 22 PASS** (including 7 adversarial tests R2-1..R2-7)
- **Pre-Existing Regression Suites**:
  - `war-room-webmcp-registration.spec.ts`: 40 / 40 PASS
  - `war-room-webmcp-platform.spec.ts`: 42 / 42 PASS
  - `war-room-webmcp-agent-ui.spec.ts`: 7 / 7 PASS
  - `war-room-domain.spec.ts`: 28 / 28 PASS
  - `war-room-actions.spec.ts`: 51 / 51 PASS
  - `war-room-integration.spec.ts`: 30 / 30 PASS
  - `war-room-human-ui.spec.ts`: 5 / 5 PASS
  - `homepage.spec.ts`: 8 / 8 PASS
- **Total Automated Tests**: **233 / 233 PASS**
- **TypeScript**: 0 errors (`npx tsc --noEmit`)
- **ESLint**: 0 errors, 0 warnings (`npm run lint`)
- **Next.js Production Build**: Exit 0, 15/15 static pages successfully compiled in 5.4s
- **npm audit**: 0 vulnerabilities

---

## 13. File Scope Classification

### Modified Production Modules
- `apps/frontend/src/lib/webmcp/lifecycle/lifecycle-owner.ts`: In-flight registration tracking, adoption, single-flight discipline, and settlement validation.

### Modified Test Suite
- `apps/frontend/e2e/war-room-webmcp-lifecycle.spec.ts`: 22 comprehensive tests (including 7 adversarial race tests R2-1 through R2-7).

### Challenge Documentation
- `docs/challenge/WMCP-4A-ADAPTIVE-TOOL-SURFACE-LIFECYCLE.md`: Authoritative contract and corrective record.

---

## 14. Deferred Work to Later WMCP-4 Sub-Phases

The following items remain out of scope for WMCP-4A and are deferred:
- **WMCP-4B**: Dynamic tool definition implementations for post-`IDLE` phases (`summarize_graph`, `calculate_blast_radius`, `trace_dependency_path`, `focus_graph_nodes`, `inspect_selected_package`, `simulate_api_changes`, `inspect_scenario`, `set_scenario_priority`, `generate_migration_plan`, `inspect_critical_paths`, `inspect_migration_plan`, `focus_critical_path`).
- **WMCP-4C**: Full context-bound execution wrapper enforcing invocation-time revision capture and stale-context early rejection for all new phase tools.
- **WMCP-4D**: Integration of `WebMcpRegistrationOwner` into `WarRoomWebMcpBridge` reacting dynamically to live `WarRoomState` transitions.
- **WMCP-4R**: Final holistic review and regression audit for the complete WMCP-4 phase.

---

## 15. Acceptance Gates Matrix (4A-R2-1 to 4A-R2-24)

| Gate ID | Requirement Description | Status |
| :--- | :--- | :--- |
| **4A-R2-1** | Starting HEAD exact `75e7db9d81d78ff5a4e0565e113417ceb0658721` | **PASS** |
| **4A-R2-2** | R1 defect reproduced and understood | **PASS** |
| **4A-R2-3** | Explicit pending ownership implemented | **PASS** |
| **4A-R2-4** | Single platform registration flight per tool name enforced | **PASS** |
| **4A-R2-5** | Pending registration adoption by newer reconciliation passes implemented | **PASS** |
| **4A-R2-6** | No stale-owner abort for registrations still desired by latest surface | **PASS** |
| **4A-R2-7** | Pending registration aborted when newest desired surface excludes it | **PASS** |
| **4A-R2-8** | Capability loss aborts active and pending registrations | **PASS** |
| **4A-R2-9** | Owner disposal aborts active and pending registrations | **PASS** |
| **4A-R2-10** | Late Promise settlement cannot resurrect cancelled, obsolete, unavailable, or disposed registration | **PASS** |
| **4A-R2-11** | Failed pending registration leaves no poison state and can be retried | **PASS** |
| **4A-R2-12** | Race B (accepted pending same-tool) PASS | **PASS** |
| **4A-R2-13** | Race C (multi-tool partial completion) PASS | **PASS** |
| **4A-R2-14** | Race D (accepted pending capability loss) PASS | **PASS** |
| **4A-R2-15** | Race E (accepted pending owner disposal) PASS | **PASS** |
| **4A-R2-16** | Original Race A pre-registration delay safety preserved | **PASS** |
| **4A-R2-17** | All previously passing WMCP-4A invariants preserved | **PASS** |
| **4A-R2-18** | All relevant automated regression tests PASS (233/233) | **PASS** |
| **4A-R2-19** | TypeScript, ESLint, Next.js build PASS | **PASS** |
| **4A-R2-20** | Upstream pin remains exact `41d12f057167ccf5954dbcf49d99502cb6c84491` | **PASS** |
| **4A-R2-21** | Only allowed R2 files modified | **PASS** |
| **4A-R2-22** | Forensic chronology truthfully recorded | **PASS** |
| **4A-R2-23** | Pre-existing untracked IDE/user files unchanged and excluded | **PASS** |
| **4A-R2-24** | Zero U+2013 and zero U+2014 characters in modified R2 files | **PASS** |

---

## 16. Final Status

**IMPLEMENTED - PENDING INDEPENDENT RE-VERIFICATION**
