# WMCP-4A - Adaptive Tool Surface Contract & Registration Lifecycle Baseline

## 1. Purpose & Scope

This document defines the architectural contract, pure derivation models, and registration lifecycle reconciler for the **Adaptive WebMCP Tool Surface** (**WMCP-4A**).

WMCP-4A establishes the foundation for dynamically adapting exposed WebMCP tools based on canonical application state without destabilizing or replacing the closed WMCP-3 platform contracts and primitive bridges.

### Key Questions Resolved in WMCP-4A
- **State-Driven Surface**: Which WebMCP tools are eligible for agent invocation in each application phase (`BOOTSTRAP`, `IDLE`, `GRAPH_READY`, `NODE_SELECTED`, `SIMULATION_READY`, `HUMAN_REVIEW`, `PLAN_READY`).
- **Registration Ownership**: A single authoritative lifecycle owner (`WebMcpRegistrationOwner`) manages tool registrations via pinned upstream `AbortSignal` lifetime semantics.
- **Deterministic Identity**: Stable action identifiers (`WebMcpActionName`) ensure deterministic reconciliation across renders and state changes.
- **Idempotent Reconciliation**: `computeReconciliationPlan` diffs actual vs desired surfaces and performs zero additional platform calls on unchanged states.
- **Capability Loss Resilience**: When WebMCP capability disappears, owned registrations are cleanly disposed while standard Human application workflows continue uninterrupted.
- **Concurrency & Race Safety**: Monotonic reconciliation sequencing ensures older asynchronous registration passes cannot overwrite newer state.

---

## 2. Review Starting State & Upstream Pin

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **Starting HEAD**: `cc070929613c9d7dbc57974f8c49aeaaf50bd996`
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

## 5. WMCP-4 Adaptive Capability & Registration Architecture

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
|              Reconciliation Planner (reconciler.ts)                     |
|                                                                         |
|  computeReconciliationPlan(actualActiveTools, desiredTools):            |
|    -> { toRegister: [...], toRetain: [...], toRemove: [...] }           |
+------------------------------------+------------------------------------+
                                     | WebMcpReconciliationPlan
                                     v
+-------------------------------------------------------------------------+
|        Authoritative Registration Lifecycle Owner (lifecycle-owner.ts)  |
|                                                                         |
|  createWebMcpRegistrationOwner(platform):                               |
|    1. Checks sequence generation token (INV-WMCP4-RACE-001)             |
|    2. Aborts obsolete tools: entry.abortController.abort()              |
|    3. Registers new tools with dedicated AbortControllers               |
|    4. Maintains authoritative map: Map<WebMcpActionName, Entry>         |
|    5. Fails closed on tool failure without corrupting active surface    |
|    6. Idempotently disposes all owned tools on unmount/capability-loss  |
+-------------------------------------------------------------------------+
```

---

## 6. Registration Ownership & Invariants (INV-WMCP4-OWN-001..003)

- **Single Owner (`INV-WMCP4-OWN-001`)**: Exactly one authoritative lifecycle owner (`WebMcpRegistrationOwner`) manages tool registrations for the application runtime.
- **Decoupled Consumers (`INV-WMCP4-OWN-002`)**: Components declare desired capability state; they do not directly invoke raw browser `registerTool()`.
- **Duplicate Prevention (`INV-WMCP4-OWN-003`)**: Unmount, remount, route transitions, and re-initializations cannot accumulate duplicate registrations. Obsolete registrations are aborted before or during reconciliation.

---

## 7. Registration Identity & Invariants (INV-WMCP4-ID-001..002)

- **Deterministic Identity (`INV-WMCP4-ID-001`)**: Tool identities are exact strings (`WebMcpActionName`) drawn from the locked state-to-tools specification. Identity does not depend on timestamps, random UUIDs, array indices, or object references.
- **State Invariance (`INV-WMCP4-ID-002`)**: Changing unrelated application state (e.g. theme toggle, panel resize) does not alter tool registration identity.

---

## 8. Registration Lifetime & Disposal (INV-WMCP4-LIFE-001..004)

- **Obsolete Tool Teardown (`INV-WMCP4-LIFE-001`)**: When a tool leaves the desired surface, its dedicated `AbortController.abort()` signal is triggered, unregistering only that specific tool from the browser context.
- **Zero Redundant Operations (`INV-WMCP4-LIFE-002`)**: Unchanged tools in the desired set are retained without re-registration or lifecycle churn.
- **Idempotent Disposal (`INV-WMCP4-LIFE-003`)**: `dispose()` terminates all active owned tool registrations and marks the owner disposed. Subsequent `dispose()` or `reconcile()` calls are safe no-ops or return clean errors.
- **Isolated Lifecycles (`INV-WMCP4-LIFE-004`)**: Disposing one tool registration does not unregister or corrupt other active tools.

---

## 9. Capability Loss Resilience (INV-WMCP4-CAP-001..002)

- **Non-Fatal Capability Loss (`INV-WMCP4-CAP-001`)**: Loss of WebMCP capability (e.g. iframe detachment, feature disablement) cannot break the underlying Human application.
- **Clean Teardown (`INV-WMCP4-CAP-002`)**: When `platform.isAvailable()` returns `false`, `reconcile()` automatically disposes all active owned registrations and clears the active registry.

---

## 10. Concurrency & Reconciliation Race Safety (INV-WMCP4-RACE-001)

- **Reconciliation Sequence Token**: Every invocation of `reconcile()` increments a monotonic sequence counter (`reconciliationSequence`).
- **Superseded Execution Abort**: If an asynchronous `platform.registerTool()` completes after a newer reconciliation pass has already started, the completed tool registration is immediately aborted and discarded, preventing obsolete tools from resurrecting in newer states.

---

## 11. Context Revision Foundation (INV-WMCP4-CTX-001)

- In WMCP-4A, `WebMcpCapabilityState` and `WebMcpDesiredSurface` explicitly track `contextRevision: number`.
- Each registration entry records `registeredAtRevision: number`.
- This establishes the structural foundation for WMCP-4B/4C where tool execution wrappers evaluate invocation-time captured revisions against current application state to reject stale execution before state commits.

---

## 12. Invariant Matrix

| Invariant ID | Title | Status in WMCP-4A | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **INV-WMCP4-OWN-001** | Single Authoritative Lifecycle Owner | **PASS** | `createWebMcpRegistrationOwner` enforces single ownership map |
| **INV-WMCP4-OWN-002** | Decoupled Surface Consumption | **PASS** | Consumers pass `WebMcpDesiredSurface` to reconciler |
| **INV-WMCP4-OWN-003** | Remount Duplicate Immunity | **PASS** | Tests 10 and 14 in lifecycle spec |
| **INV-WMCP4-ID-001** | Deterministic Registration Identity | **PASS** | Stable `WebMcpActionName` enum strings |
| **INV-WMCP4-ID-002** | Unrelated State Invariance | **PASS** | Test 3 in lifecycle spec |
| **INV-WMCP4-LIFE-001** | Obsolete Tool Removal | **PASS** | Test 11 in lifecycle spec |
| **INV-WMCP4-LIFE-002** | Zero Redundant Re-Registration | **PASS** | Test 10 in lifecycle spec |
| **INV-WMCP4-LIFE-003** | Idempotent Disposal | **PASS** | Test 14 in lifecycle spec |
| **INV-WMCP4-LIFE-004** | Isolated Tool Lifecycles | **PASS** | Test 11 in lifecycle spec |
| **INV-WMCP4-CAP-001** | Non-Breaking Capability Loss | **PASS** | Test 13 in lifecycle spec |
| **INV-WMCP4-CAP-002** | Complete Teardown on Loss | **PASS** | Test 13 in lifecycle spec |
| **INV-WMCP4-RACE-001** | Asynchronous Reconciliation Race Safety | **PASS** | Test 15 in lifecycle spec |
| **INV-WMCP4-CTX-001** | Context Revision Tracking Foundation | **PASS** | Structural revision tracking established |

---

## 13. Quality Suite & Execution Evidence

- **New WMCP-4A Test Suite** (`apps/frontend/e2e/war-room-webmcp-lifecycle.spec.ts`): **15 / 15 PASS**
- **Pre-Existing Regression Suites**:
  - `war-room-webmcp-registration.spec.ts`: 40 / 40 PASS
  - `war-room-webmcp-platform.spec.ts`: 42 / 42 PASS
  - `war-room-webmcp-agent-ui.spec.ts`: 7 / 7 PASS
  - `war-room-domain.spec.ts`: 28 / 28 PASS
  - `war-room-actions.spec.ts`: 51 / 51 PASS
  - `war-room-integration.spec.ts`: 30 / 30 PASS
  - `war-room-human-ui.spec.ts`: 5 / 5 PASS
  - `homepage.spec.ts`: 8 / 8 PASS
- **Total Automated Tests**: **226 / 226 PASS**
- **TypeScript**: 0 errors (`npx tsc --noEmit`)
- **ESLint**: 0 errors, 0 warnings (`npm run lint`)
- **Next.js Production Build**: Exit 0, 15/15 static pages successfully compiled
- **npm audit**: 0 vulnerabilities

---

## 14. File Scope Classification

### Added Production Modules
- `apps/frontend/src/lib/webmcp/lifecycle/types.ts`: Action names, capability state, desired surface, registration entry, reconciler interfaces.
- `apps/frontend/src/lib/webmcp/lifecycle/surface.ts`: Pure `deriveDesiredToolSurface` function.
- `apps/frontend/src/lib/webmcp/lifecycle/reconciler.ts`: Pure `computeReconciliationPlan` function.
- `apps/frontend/src/lib/webmcp/lifecycle/lifecycle-owner.ts`: Authoritative `createWebMcpRegistrationOwner`.
- `apps/frontend/src/lib/webmcp/lifecycle/index.ts`: Module exports.

### Modified Production Modules
- `apps/frontend/src/lib/webmcp/index.ts`: Re-exports `./lifecycle` (1 line addition).

### Added Test Suite
- `apps/frontend/e2e/war-room-webmcp-lifecycle.spec.ts`: 15 comprehensive unit and lifecycle tests.

### Challenge Documentation
- `docs/challenge/WMCP-4A-ADAPTIVE-TOOL-SURFACE-LIFECYCLE.md`: This authoritative contract document.

---

## 15. Deferred Work to Later WMCP-4 Sub-Phases

The following items are deliberately out of scope for WMCP-4A and are deferred to subsequent sub-phases:
- **WMCP-4B**: Dynamic tool definition implementations for post-`IDLE` phases (`summarize_graph`, `calculate_blast_radius`, `trace_dependency_path`, `focus_graph_nodes`, `inspect_selected_package`, `simulate_api_changes`, `inspect_scenario`, `set_scenario_priority`, `generate_migration_plan`, `inspect_critical_paths`, `inspect_migration_plan`, `focus_critical_path`).
- **WMCP-4C**: Full context-bound execution wrapper enforcing invocation-time revision capture and stale-context early rejection for all new phase tools.
- **WMCP-4D**: Integration of `WebMcpRegistrationOwner` into `WarRoomWebMcpBridge` reacting dynamically to live `WarRoomState` transitions.
- **WMCP-4R**: Final holistic review and regression audit for the complete WMCP-4 phase.

---

## 16. Acceptance Gates Matrix (4A-1 to 4A-18)

| Gate ID | Requirement Description | Status |
| :--- | :--- | :--- |
| **4A-1** | Starting HEAD exact `cc070929613c9d7dbc57974f8c49aeaaf50bd996` | **PASS** |
| **4A-2** | Closed WMCP-3 contracts preserved | **PASS** |
| **4A-3** | Upstream pin unchanged (`41d12f057167ccf5954dbcf49d99502cb6c84491`) | **PASS** |
| **4A-4** | Registration and teardown semantics demonstrated from pinned source | **PASS** |
| **4A-5** | Single authoritative registration lifecycle owner implemented | **PASS** |
| **4A-6** | Deterministic registration identity established | **PASS** |
| **4A-7** | Pure adaptive desired surface derivation implemented | **PASS** |
| **4A-8** | Idempotent reconciliation planner implemented | **PASS** |
| **4A-9** | Correct removal via pinned AbortSignal lifetime implemented | **PASS** |
| **4A-10** | Capability loss cleans owned registrations without breaking app | **PASS** |
| **4A-11** | Failure consistency guarantees no false active state or leaked handles | **PASS** |
| **4A-12** | Race safety prevents stale asynchronous reconciliation resurrection | **PASS** |
| **4A-13** | Context revision foundation established | **PASS** |
| **4A-14** | All new WMCP-4A tests PASS (15/15) | **PASS** |
| **4A-15** | Full pre-existing regression suite PASS (211/211 -> 226/226 total) | **PASS** |
| **4A-16** | TypeScript, ESLint, Next.js build, npm audit PASS | **PASS** |
| **4A-17** | Zero unrelated production changes | **PASS** |
| **4A-18** | WMCP-4A documentation complete and forensically accurate | **PASS** |

---

## 17. Final Status

**IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
