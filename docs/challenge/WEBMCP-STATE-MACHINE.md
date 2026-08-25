# WebMCP Challenge - State Machine & Adaptive Tool Surface

## 1. Purpose

This document specifies the canonical capability state machine, derived artifact invalidation rules, context revision lifecycle, tool registration drain, and race condition protections governing the WebMCP integration on `feature/webmcp-challenge-2026`.

---

## 2. Application State vs. WebMCP Availability

Application domain state and WebMCP protocol availability are strictly orthogonal:

```
┌─────────────────────────────────────────────────────────────┐
│ APPLICATION PHASE                                           │
│ BOOTSTRAP -> IDLE -> GRAPH_READY -> NODE_SELECTED ->        │
│ SIMULATION_READY -> HUMAN_REVIEW -> PLAN_READY              │
└──────────────────────────────┬──────────────────────────────┘
                               │ Orthogonal Dimensions
┌──────────────────────────────▼──────────────────────────────┐
│ WEBMCP AVAILABILITY                                         │
│ WEBMCP_AVAILABLE   (document.modelContext present)          │
│ WEBMCP_UNAVAILABLE (Standard browser without WebMCP flags)  │
└─────────────────────────────────────────────────────────────┘
```

- **Invariant:** When `webMcpAvailability = WEBMCP_UNAVAILABLE`, every application phase remains fully navigable by human users through standard UI interactions.

---

## 3. Canonical State Definitions

1. **`BOOTSTRAP`:** Application and stores are initializing; no context-bound tools are exposed.
2. **`IDLE`:** War Room is initialized, but no package graph is currently opened.
3. **`GRAPH_READY`:** A package graph is active, displaying root and dependent nodes; no single node is currently selected.
4. **`NODE_SELECTED`:** A specific package/node within the graph is actively selected in the inspector.
5. **`SIMULATION_READY`:** A deterministic counterfactual API scenario has been generated for the selected node.
6. **`HUMAN_REVIEW`:** Human business priority, exclusions, or ownership annotations have been attached to the scenario.
7. **`PLAN_READY`:** A structured migration and release plan has been generated from scenario evidence and human context.

---

## 4. Derived Artifact Invalidation Rules

The platform models a strict upstream-to-downstream dependency chain:

$$\text{Graph Context} \rightarrow \text{Node Selection} \rightarrow \text{Scenario} \rightarrow \text{Deterministic Analysis} \rightarrow \text{Human Review} \rightarrow \text{Migration Plan}$$

When an upstream entity changes, all dependent downstream artifacts are automatically invalidated:

1. **New Graph Opened:** Invalidates selected node, scenario, analysis results, human review bindings, migration plan, and graph overlays. Resets state to `GRAPH_READY` (`contextRevision +1`).
2. **Selected Node Changed:** Invalidates scenario, analysis results, human review bindings, migration plan, and node overlays. Transitions to `NODE_SELECTED` (`contextRevision +1`).
3. **Scenario Patch Changed / Replaced:** Invalidates derived breaking-change results, exposure sets, Blast Radius, Confidence, critical paths, and migration plan. Transitions to `SIMULATION_READY` (`contextRevision +1`). Human annotations are preserved only if their bound entity IDs remain valid.
4. **Scenario Recalculated:** Re-runs deterministic analysis. Existing migration plans are invalidated. State transitions to `SIMULATION_READY` (from `SIMULATION_READY`) or `HUMAN_REVIEW` (from `HUMAN_REVIEW` or `PLAN_READY`) (`contextRevision +1`).
5. **Human Annotation Changed While Plan Exists:** Invalidates the existing migration plan and returns state to `HUMAN_REVIEW` (`contextRevision +1`). Objective technical Blast Radius and Confidence scores do NOT change.

---

## 5. State Transition Table

| From State | Trigger Event | To State | `contextRevision` Effect | Invalidation & Lifecycle Notes |
|---|---|---|---|---|
| `BOOTSTRAP` | `APP_INITIALIZED` | `IDLE` | Initialize (`1`) | Initial store initialization |
| `IDLE` | `GRAPH_OPENED` | `GRAPH_READY` | Increment (`+1`) | Root package graph loaded |
| `GRAPH_READY` | `NODE_SELECTED` | `NODE_SELECTED` | Increment (`+1`) | Target node selected |
| `GRAPH_READY` | `GRAPH_CLOSED` | `IDLE` | Increment (`+1`) | Returns to idle view |
| `NODE_SELECTED` | `NODE_DESELECTED`| `GRAPH_READY` | Increment (`+1`) | Selection cleared |
| `NODE_SELECTED` | `NODE_SELECTED` (diff) | `NODE_SELECTED` | Increment (`+1`) | Selected node changed; scenario/plan invalidated |
| `NODE_SELECTED` | `SCENARIO_CREATED` | `SIMULATION_READY` | Increment (`+1`) | Deterministic scenario created |
| `SIMULATION_READY`| `SCENARIO_PATCH_CHANGED`| `SIMULATION_READY`| Increment (`+1`)| Patch updated; derived analysis invalidated |
| `SIMULATION_READY`| `SCENARIO_RECALCULATED` | `SIMULATION_READY`| Increment (`+1`)| Deterministic analysis re-executed |
| `SIMULATION_READY`| `HUMAN_ANNOTATED`| `HUMAN_REVIEW` | Increment (`+1`) | Human priority/exclusion added |
| `SIMULATION_READY`| `SCENARIO_RESET` | `NODE_SELECTED` | Increment (`+1`) | Scenario cleared |
| `HUMAN_REVIEW` | `SCENARIO_RECALCULATED` | `HUMAN_REVIEW` | Increment (`+1`) | Analysis re-run; human context retained if valid |
| `HUMAN_REVIEW` | `ANNOTATION_CHANGED` | `HUMAN_REVIEW` | Increment (`+1`) | Updated business annotations |
| `HUMAN_REVIEW` | `PLAN_GENERATED` | `PLAN_READY` | Increment (`+1`) | Migration plan generated |
| `PLAN_READY` | `SCENARIO_RECALCULATED` | `HUMAN_REVIEW` | Increment (`+1`) | Analysis re-run; existing plan invalidated |
| `PLAN_READY` | `ANNOTATION_CHANGED` | `HUMAN_REVIEW` | Increment (`+1`) | Human context updated; plan invalidated |
| `PLAN_READY` | `PLAN_RESET` | `HUMAN_REVIEW` | Increment (`+1`) | Plan cleared for re-analysis |
| Any State | `GRAPH_OPENED` (new) | `GRAPH_READY` | Increment (`+1`) | Full context switch; all downstream state invalidated |

*Note: Cosmetic UI events (panel resize, camera drag, theme toggle) do NOT increment `contextRevision`.*

---

## 6. Logical Tool Surface vs. Physical Registration Set

The architecture strictly distinguishes:

- **Desired Logical Tool Surface:** The set of tools semantically available to the agent for the active canonical state:
  $$\text{DesiredLogicalTools} = f(\text{canonicalApplicationState}, \text{webMcpAvailability})$$
- **Physical Browser Registration Set:** The actual tool registrations currently existing inside `document.modelContext`.

### Transient Phased Retirement
When transitioning between application states:
1. Retiring tools are immediately removed from the desired logical tool surface.
2. The registration state transitions from `ACTIVE` to `RETIRING`.
3. In `RETIRING`, the tool wrapper immediately rejects newly arriving invocations with `INVALID_STATE` (or `STALE_CONTEXT` if the context revision has advanced).
4. Already admitted in-flight executions are allowed to drain or are explicitly cancelled via `executionSignal`.
5. Once `activeExecutions == 0`, the registration is physically unmounted and transitions to `REMOVED`.

---

## 7. Tool Surface by State

When `webMcpAvailability = WEBMCP_AVAILABLE`, the active logical tool surface is:

```
┌─────────────────┬────────────────────────────────────────────────────────┐
│ Phase           │ Active Logical Tool Surface (Target: 3-6 Tools)        │
├─────────────────┼────────────────────────────────────────────────────────┤
│ BOOTSTRAP       │ (None)                                                 │
│ IDLE            │ search_packages, open_package_graph                   │
│ GRAPH_READY     │ summarize_graph, calculate_blast_radius,               │
│                 │ trace_dependency_path, focus_graph_nodes,              │
│                 │ open_package_graph                                    │
│ NODE_SELECTED   │ inspect_selected_package, calculate_blast_radius,      │
│                 │ trace_dependency_path, simulate_api_changes,           │
│                 │ focus_graph_nodes                                      │
│ SIMULATION_READY│ inspect_scenario, calculate_blast_radius,              │
│                 │ trace_dependency_path, set_scenario_priority,          │
│                 │ set_scenario_exclusion, focus_graph_nodes              │
│ HUMAN_REVIEW    │ recalculate_scenario, generate_migration_plan,         │
│                 │ inspect_critical_paths, set_scenario_priority          │
│ PLAN_READY      │ inspect_migration_plan, recalculate_scenario,          │
│                 │ focus_critical_path                                    │
└─────────────────┴────────────────────────────────────────────────────────┘
```

---

## 8. Context Revision Rules

1. **Monotonically Increasing:** `contextRevision` is a positive integer incremented whenever canonical context changes.
2. **Captured Context at Invocation:** Every tool execution records `capturedContextRevision = currentContextRevision` at the moment of tool start.
3. **Commit Guard:** Before applying any state mutation (e.g. updating scenario, changing overlays), the execution wrapper verifies:
   $$\text{capturedContextRevision} == \text{currentContextRevision}$$
4. **Stale Execution Handling:** If revisions mismatch, the operation aborts state mutation, returns `STALE_CONTEXT`, and logs a race event to the telemetry inspector.

---

## 9. Explicit-ID vs. Context-Bound Operations

- **Context-Bound Operations (Strict Revision Guard):** Operations whose parameters implicitly depend on current session focus (e.g. `simulate_api_changes`, `set_scenario_priority`, `generate_migration_plan`, `recalculate_scenario`). These MUST enforce `contextRevision` verification before state commit.
- **Explicit-ID Pure Reads (Permissive Completion):** Operations passing explicit immutable identifiers (e.g. `inspect_package(packageId: "npm:lodash@4.17.21")`). Pure reads may return data even if `contextRevision` has changed, provided they do NOT mutate active UI selection or graph overlays.

---

## 10. Tool Registration Lifecycle & Generations

```
┌──────────────┐
│  REGISTERING │ (Instantiating registrationLifetimeSignal, generating ID)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    ACTIVE    │ (Exposed in logical surface, accepting calls)
└──────┬───────┘
       │ (State transition triggered)
       ▼
┌──────────────┐
│   RETIRING   │ (Removed from logical surface; rejects new calls; drains in-flight)
└──────┬───────┘
       │ (activeExecutions == 0)
       ▼
┌──────────────┐
│   REMOVED    │ (registrationLifetimeSignal aborted; physical unregister complete)
└──────────────┘
```

- **Generation Composite Key:** `toolName + generation` (e.g. `simulate_api_changes#12`).
- **Generation Independence Invariant:** Teardown of Generation $N$ must never unregister or corrupt active Generation $N+1$.

---

## 11. AbortSignal Role Separation

The platform strictly isolates two distinct cancellation mechanisms:

1. **`registrationLifetimeSignal`:** Passed to `document.modelContext.registerTool(tool, { signal: registrationLifetimeSignal })`. Controls physical browser registration lifetime. Aborting unregisters the tool.
2. **`executionSignal`:** Passed into tool execution callback `execute(input, { signal: executionSignal })`. Signals cancellation of an individual invocation and propagates to network/analysis operations.

$$\text{registrationLifetimeSignal} \neq \text{executionSignal}$$

Registration teardown must never be conflated with execution cancellation.

---

## 12. Stale Execution & Race Condition Examples

### Scenario A: Asynchronous Node Switch Race
1. Human selects `Package A` (`contextRevision = 10`). Tool `simulate_api_changes` is active.
2. Agent initiates `simulate_api_changes(patch: [REMOVE_SYMBOL])` (`capturedContextRevision = 10`).
3. While analysis is processing, Human clicks `Package B` (`contextRevision = 11`).
4. Analysis for `Package A` finishes.
5. Invocation wrapper detects `capturedContextRevision (10) != currentContextRevision (11)`.
6. Invocation returns `STALE_CONTEXT`. UI for `Package B` remains uncorrupted.

---

## 13. Error Taxonomy

All WebMCP tool errors return structured, typed payloads:

| Error Code | Meaning / Trigger |
|---|---|
| `INVALID_INPUT` | Parameter failed schema or runtime domain validation. |
| `NOT_FOUND` | Specified package, symbol, or scenario ID does not exist. |
| `INVALID_STATE` | Tool invoked in an application phase where it is not logically active, or invoked during `RETIRING`. |
| `STALE_CONTEXT` | In-flight execution completed after a contextRevision increment. |
| `UNAVAILABLE` | Required external data service (e.g. OSV API) is unreachable. |
| `UNSUPPORTED_ECOSYSTEM` | Registry ecosystem not supported for requested operation. |
| `SNAPSHOT_UNAVAILABLE` | AST public API snapshot missing for requested package version. |
| `VERSION_RANGE_INVALID` | SemVer/PEP 440 constraint string is malformed. |
| `SCENARIO_CONFLICT` | Scenario patch contains contradictory operations on same symbol. |
| `CAPABILITY_DENIED` | Tenant authorization policy rejected the requested action. |
| `CANCELLED` | Operation was aborted via AbortSignal. |
| `INTERNAL_ERROR` | Unhandled internal exception (sanitized; no raw stack traces). |

---

## 14. Development Inspector Observability

The platform provides a real-time developer and judge inspection panel displaying:
- WebMCP availability (`AVAILABLE` / `UNAVAILABLE`).
- Current application phase and `contextRevision`.
- **Desired Logical Tool Surface:** List of currently valid active tools.
- **Physical Registration Set:** Detailed records of registered tools with generation ID, state (`ACTIVE` / `RETIRING`), and atomic `activeExecutions` count.
- Real-time toolchange event log with timestamps.
- Execution history with duration, status, and stale rejection counters.

---

## 15. Future Evaluation & Test Matrix (WMCP-14)

1. **State Machine Determinism Tests:** Verify exact tool sets for all 7 application phases.
2. **Derived Invalidation Tests:** Assert changing upstream entities properly invalidates downstream analysis/plans.
3. **Context Revision Race Tests:** Simulate interleaved asynchronous tool calls with rapid context increments.
4. **Generation Drain Tests:** Verify rapid state bouncing ($A \rightarrow B \rightarrow A$) does not corrupt Generation $N+1$.
5. **Error Payloads & Budget Tests:** Assert all tool responses conform to schema and character budgets ($\le 1500$ chars).
6. **Agent Behavioral Evals:** Test tool selection accuracy, multi-step chaining, and negative evaluation cases (refusing tool call when prerequisites are absent).
