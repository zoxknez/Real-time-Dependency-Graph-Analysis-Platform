# WebMCP Challenge - State Machine & Adaptive Tool Surface

## 1. Purpose

This document specifies the canonical capability state machine, context revision rules, tool registration lifecycle, and race condition protections governing the WebMCP integration on `feature/webmcp-challenge-2026`.

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

## 4. State Transition Table

| From State | Trigger Event | To State | `contextRevision` Effect | Notes |
|---|---|---|---|---|
| `BOOTSTRAP` | `APP_INITIALIZED` | `IDLE` | Initialize (`1`) | Initial store setup |
| `IDLE` | `GRAPH_OPENED` | `GRAPH_READY` | Increment (`+1`) | Root package graph loaded |
| `GRAPH_READY` | `NODE_SELECTED` | `NODE_SELECTED` | Increment (`+1`) | Target node selected |
| `GRAPH_READY` | `GRAPH_CLOSED` | `IDLE` | Increment (`+1`) | Returns to idle view |
| `NODE_SELECTED` | `NODE_DESELECTED`| `GRAPH_READY` | Increment (`+1`) | Selection cleared |
| `NODE_SELECTED` | `NODE_SELECTED` (diff) | `NODE_SELECTED` | Increment (`+1`) | Selection switched to other node |
| `NODE_SELECTED` | `SCENARIO_CREATED` | `SIMULATION_READY` | Increment (`+1`) | Deterministic scenario created |
| `SIMULATION_READY`| `HUMAN_ANNOTATED`| `HUMAN_REVIEW` | Increment (`+1`) | Human priority/exclusion added |
| `SIMULATION_READY`| `SCENARIO_RESET` | `NODE_SELECTED` | Increment (`+1`) | Scenario cleared |
| `HUMAN_REVIEW` | `PLAN_GENERATED` | `PLAN_READY` | Increment (`+1`) | Migration plan synthesized |
| `HUMAN_REVIEW` | `ANNOTATION_CHANGED` | `HUMAN_REVIEW` | Increment (`+1`) | Updated business context |
| `PLAN_READY` | `PLAN_RESET` | `HUMAN_REVIEW` | Increment (`+1`) | Plan cleared for re-analysis |
| Any State | `GRAPH_OPENED` (new) | `GRAPH_READY` | Increment (`+1`) | Full context switch to new graph |

*Note: Cosmetic UI events (panel resize, camera drag, theme toggle) do NOT increment `contextRevision`.*

---

## 5. Tool Surface by State

The active WebMCP tool surface is a pure deterministic function of state:

$$\text{ToolSurface} = f(\text{applicationState}, \text{webMcpAvailability})$$

When `webMcpAvailability = WEBMCP_AVAILABLE`, the adaptive tool set is registered according to the active phase:

```
┌─────────────────┬────────────────────────────────────────────────────────┐
│ Phase           │ Active Tool Surface (Target: 3-6 Tools)                │
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

## 6. Context Revision Rules

1. **Monotonically Increasing:** `contextRevision` is a positive integer incremented whenever canonical context changes.
2. **Captured Context at Invocation:** Every tool execution records `capturedContextRevision = currentContextRevision` at the moment of tool start.
3. **Commit Guard:** Before applying any state mutation (e.g. updating scenario, changing overlays), the execution wrapper verifies:
   $$\text{capturedContextRevision} == \text{currentContextRevision}$$
4. **Stale Execution Handling:** If revisions mismatch, the operation aborts state mutation, returns `STALE_CONTEXT`, and logs a race event to the telemetry inspector.

---

## 7. Explicit-ID vs. Context-Bound Operations

- **Context-Bound Operations (Strict Revision Guard):** Operations whose parameters implicitly depend on current session focus (e.g. `simulate_api_changes`, `set_scenario_priority`, `generate_migration_plan`). These MUST enforce `contextRevision` verification before state commit.
- **Explicit-ID Pure Reads (Permissive Completion):** Operations passing explicit immutable identifiers (e.g. `inspect_package(packageId: "npm:lodash@4.17.21")`). Pure reads may return data even if `contextRevision` has changed, provided they do NOT mutate active UI selection or graph overlays.

---

## 8. Tool Registration Lifecycle

Individual tool registrations follow a 4-stage lifecycle:

```
┌──────────────┐
│  REGISTERING │ (Instantiating AbortController, generating ID)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    ACTIVE    │ (Exposed to document.modelContext, accepting calls)
└──────┬───────┘
       │ (State transition triggered)
       ▼
┌──────────────┐
│   RETIRING   │ (Stop accepting calls; draining activeExecutions)
└──────┬───────┘
       │ (activeExecutions == 0)
       ▼
┌──────────────┐
│   REMOVED    │ (AbortController aborted, unregistration complete)
└──────────────┘
```

---

## 9. Registration Generations

- Every tool registration is tracked by a composite key: `toolName + generation` (e.g. `simulate_api_changes#12`).
- **Generation Independence Invariant:** Delayed asynchronous retirement of Generation $N$ must never unregister or corrupt active Generation $N+1$.

---

## 10. In-Flight Execution Policy

- Each registered tool maintains an `activeExecutions` atomic counter.
- When transitioning to `RETIRING`:
  1. The tool stops accepting new invocations.
  2. In-flight executions continue processing until completion or cancellation.
  3. When `activeExecutions` reaches zero, the registration is finalized to `REMOVED`.

---

## 11. Cancellation Compatibility Boundary

- `WebMcpPlatformAdapter` exposes standard `AbortSignal` instances to long-running asynchronous domain operations.
- The domain layer does not depend on browser-specific unregister cancellation behaviors (e.g. Chrome 153+ semantics). All cancellation is managed via explicit AbortControllers.

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
| `INVALID_STATE` | Tool invoked in an application phase where it is not permitted. |
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
- Active registered tool set and generation identifiers.
- Real-time toolchange event log with timestamps.
- Execution history with duration, status, and stale rejection counters.

---

## 15. Future Evaluation & Test Matrix (WMCP-14)

1. **State Machine Determinism Tests:** Verify exact tool sets for all 7 application phases.
2. **Context Revision Race Tests:** Simulate interleaved asynchronous tool calls with rapid context increments.
3. **Generation Drain Tests:** Verify rapid state bouncing ($A \rightarrow B \rightarrow A$) does not corrupt Generation $N+1$.
4. **Error Payloads & Budget Tests:** Assert all tool responses conform to schema and character budgets ($\le 1500$ chars).
5. **Agent Behavioral Evals:** Test tool selection accuracy, multi-step chaining, and negative evaluation cases (refusing tool call when prerequisites are absent).
