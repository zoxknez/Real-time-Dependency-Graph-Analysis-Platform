# WMCP-3B Primitive Registration Adapter & Tool Execution Bridge

- **Phase:** `WMCP-3B - Primitive Registration Adapter & Tool Execution Bridge`
- **Starting HEAD:** `993fb4b10dbb1a060424494a1adad081020f782a`
- **WMCP-3A Closure Dependency:** `WMCP-3A - WebMCP Platform Contract, Capability Detection & Type Boundary` (PASS - CLOSED at `993fb4b10dbb1a060424494a1adad081020f782a`)
- **Status:** `IMPLEMENTED - PENDING INDEPENDENT VERIFICATION`

---

## 1. Purpose

WMCP-3B establishes the first end-to-end WebMCP tool execution pipeline. It connects browser-level `document.modelContext.registerTool()` registration to the unified application boundary:
```
AI/WebMCP tool
  -> WebMcpPlatformAdapter (apps/frontend/src/lib/webmcp/platform/)
  -> WebMCP Execution Bridge (apps/frontend/src/lib/webmcp/bridge/)
  -> WarRoomActions (searchPackages / openPackageGraph)
  -> Trusted Security & Authorization Ports
  -> Canonical WarRoomState (Zustand & StatePort)
  -> WarRoomGraphProjectionStore (Two-phase staging & activation lifecycle)
```
This proves that Agent invocations use the exact same action contracts, security validation, stale context protection, and graph projection rendering as the Human UI.

---

## 2. Starting HEAD

- **Authoritative SHA:** `993fb4b10dbb1a060424494a1adad081020f782a`
- **Branch:** `feature/webmcp-challenge-2026`
- **Parent Commit:** `d4c601fbb9a1370f4a0916a4391d2fee48876573`

---

## 3. WMCP-3A Closure Dependency

WMCP-3B builds directly on the independently verified, closed WMCP-3A platform foundation:
- `WMCP-3A` (Platform Contract, Capability Detection & Type Boundary): CLOSED at `993fb4b10dbb1a060424494a1adad081020f782a`
- Closed kernel dependencies: `WMCP-2A`, `WMCP-2B`, `WMCP-2C`, `WMCP-2R` preserved with 0 diff.

---

## 4. Upstream WebMCP Contract Pin

- **Repository:** `webmachinelearning/webmcp`
- **Branch:** `main`
- **Observed SHA:** `41d12f057167ccf5954dbcf49d99502cb6c84491`
- **Observation Date:** `2026-08-28`
- **Source File:** `index.bs`

---

## 5. Current Protocol Facts

- `document.modelContext.registerTool(tool, { signal })`: Registers a tool definition with registration lifetime signal.
- `ToolExecuteCallback`: Normatively passes `(inputObject, { signal: AbortSignal })`, providing a per-execution cancellation token.
- `RegisteredTool.inputSchema`: Defined as deep-copied `object`.
- Low-level `ModelContext.executeTool()`: Retained in ambient type definitions for platform completeness, but excluded from application-level execution bridges.

---

## 6. Chrome Implementation Notes

- `document.modelContext`: Primary active property.
- `navigator.modelContext`: Deprecated since Chrome 150; 100% absent from challenge codebase.
- Chrome 153 Lifecycle: Unregistering a tool does not cancel in-flight executions. Per-invocation cancellation is managed through `ToolExecuteCallbackOptions.signal`.

---

## 7. 3B Scope

WMCP-3B is deliberately restricted to registering exactly two primitive tools:
1. `search_packages` (pure-read tool)
2. `open_package_graph` (state-mutating tool)

---

## 8. Explicit Non-Goals

The following features remain strictly out of scope and deferred to WMCP-4:
- Dynamic/adaptive tool sets (`DesiredLogicalTools = f(state)`)
- `ToolRegistry` and `RegistrationManager`
- Generation IDs and tool generations
- Lifecycle states (`REGISTERING`, `ACTIVE`, `RETIRING`, `REMOVED`)
- Active execution counters and drain systems
- State-dependent physical tool replacement
- Subscribing to `toolchange` events

---

## 9. Primitive Physical Tool Set

The primitive physical tool set registered upon exiting `BOOTSTRAP` is:
- `search_packages`
- `open_package_graph`

No additional tools are registered.

---

## 10. Why `search_packages`

`search_packages` proves:
- Pure-read WebMCP execution with `channel: "AGENT"`.
- Runtime input validation with strict property filtering.
- Trusted security/auth parity without caller-supplied credentials.
- External/untrusted content annotation (`untrustedContentHint: true`, `readOnlyHint: true`).
- Incremental output budgeting (<= 1500 characters, whole package records).
- Zero canonical state or contextRevision mutation.

---

## 11. Why `open_package_graph`

`open_package_graph` proves:
- Context-bound state mutation with `channel: "AGENT"`.
- Invocation-time `contextRevision` capture from `WarRoomStatePort`.
- Execution `AbortSignal` propagation.
- Early and commit-time `STALE_CONTEXT` protection.
- Canonical state mutation through `WarRoomActions.openPackageGraph`.
- Post-action projection lifecycle: staged graph projection activation only upon successful action commit, and immediate discard on failure.
- Complete visual rendering parity with the human UI.

---

## 12. Platform Registration Primitive

`WebMcpPlatformAdapter` (`apps/frontend/src/lib/webmcp/platform/types.ts`) extends capability detection with a generic primitive:
```typescript
export interface WebMcpPlatformAdapter {
  getSnapshot(): WebMcpPlatformSnapshot;
  isAvailable(): boolean;
  registerTool<TInput extends object = Record<string, unknown>, TOutput = unknown>(
    tool: WebMcpPlatformToolDefinition<TInput, TOutput>,
    options?: WebMcpPlatformRegistrationOptions
  ): Promise<WebMcpPlatformRegistrationResult>;
}
```

---

## 13. Registration Error Normalization

`BrowserWebMcpPlatformAdapter.registerTool()` maps platform failure modes into stable, structured results:
- Platform unavailable: `{ ok: false, error: { code: "UNAVAILABLE", message: "WebMCP document.modelContext is unavailable" } }`
- Registration signal aborted: `{ ok: false, error: { code: "CANCELLED", message: "Tool registration was cancelled" } }`
- Browser rejection / DOMException: `{ ok: false, error: { code: "REGISTRATION_FAILED", message: "Tool registration failed" } }` (sanitized without leaking raw error stacks).

---

## 14. Registration Lifetime Signal

The registration signal passed to `registerTool(tool, { signal: registrationSignal })` controls the physical registration lifetime of the tool.

---

## 15. Execution Signal

The callback execution signal passed to `execute(input, { signal: executionSignal })` is forwarded to `WarRoomInvocationContext.signal`.

---

## 16. Signal Separation

Static tests and runtime assertions prove:
- `registrationLifetimeSignal !== executionSignal`
- Aborting `executionSignal` does not unregister the tool.
- Aborting `registrationLifetimeSignal` unregisters the tool without being confused for an individual callback cancellation token.

---

## 17. Primitive Registration Session

`createPrimitiveWebMcpRegistrationSession(platform, tools)`:
- Manages registration of the two primitive tools.
- Idempotent `start()` promise prevents duplicate registration.
- `dispose()` aborts the shared registration `AbortController`.

---

## 18. Partial Registration Rollback

If `search_packages` registers successfully but `open_package_graph` fails:
- The session aborts the shared registration controller.
- `search_packages` is unregistered.
- The session returns `{ ok: false }`, ensuring zero partial registration leaks.

---

## 19. StrictMode / Component Cleanup

In `WarRoomWebMcpBridge` (`apps/frontend/src/components/providers/war-room-webmcp-bridge.tsx`):
- React StrictMode unmount calls `session.dispose()`.
- Re-mount creates a fresh registration session.
- No duplicate tools or unhandled promise rejections occur.

---

## 20. AGENT Invocation Context

At the start of every tool execution callback, the bridge creates:
```typescript
const invocation: WarRoomInvocationContext = {
  channel: "AGENT",
  capturedContextRevision: statePort.getState().contextRevision,
  signal: execContext.signal,
};
```

---

## 21. Invocation-Time Revision Capture

`capturedContextRevision` is read from `statePort.getState().contextRevision` at callback invocation time, ensuring independent, dynamic revision binding for every call.

---

## 22. Shared WarRoomActions Boundary

The WebMCP bridge delegates exclusively to:
- `actions.searchPackages(invocation, request)`
- `actions.openPackageGraph(invocation, request)`

Zero direct ApolloClient queries, GraphQL documents, fetch requests, or store mutations exist in the bridge.

---

## 23. Security Parity

Security context continues to originate solely from `WarRoomSecurityContextPort`. Tool schemas reject caller-controlled `tenantId`, `userId`, `organizationId`, and auth tokens.

---

## 24. `search_packages` Schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "query": { "type": "string", "minLength": 1, "maxLength": 120 },
    "ecosystem": { "type": "string", "enum": ["NPM", "PY_PI", "CARGO", "MAVEN", "NU_GET", "GO"] },
    "limit": { "type": "integer", "minimum": 1, "maximum": 8 }
  },
  "required": ["query"]
}
```

---

## 25. `search_packages` Runtime Validation

`validateSearchPackagesInput(raw)`:
- Verifies non-null object (not array).
- Enforces strict key allowlist `["query", "ecosystem", "limit"]`.
- Enforces non-empty trimmed string (<= 120 chars).
- Validates canonical enum and integer range (1-8).
- Rejects malformed input with `INVALID_INPUT` without invoking `WarRoomActions`.

---

## 26. `search_packages` Annotations

- `readOnlyHint`: `true`
- `untrustedContentHint`: `true`

---

## 27. `search_packages` Execution

- Captures `capturedContextRevision`.
- Validates input.
- Invokes `actions.searchPackages(invocation, request)` exactly once.
- Returns formatted output. Canonical state and revision remain unchanged.

---

## 28. `search_packages` Output Contract

```typescript
{
  ok: true,
  tool: "search_packages",
  changed: false,
  contextRevision: number,
  data: {
    packages: WarRoomPackageRef[],
    returnedCount: number,
    totalCount?: number,
    truncated: boolean
  }
}
```

---

## 29. `open_package_graph` Schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "rootPackageId": { "type": "string", "minLength": 1, "maxLength": 256 },
    "depth": { "type": "integer", "minimum": 1, "maximum": 4 }
  },
  "required": ["rootPackageId"]
}
```

---

## 30. `open_package_graph` Runtime Validation

`validateOpenPackageGraphInput(raw)`:
- Verifies non-null object.
- Enforces strict key allowlist `["rootPackageId", "depth"]`.
- Enforces non-empty trimmed root package ID (<= 256 chars).
- Validates integer depth (1-4, default 2).
- Rejects unknown keys (`tenantId`, `userId`, `contextRevision`, `url`, `graphql`, etc.).

---

## 31. `open_package_graph` Annotations

- `readOnlyHint`: `false`
- `untrustedContentHint`: `true`

---

## 32. `open_package_graph` Execution

- Captures `capturedContextRevision`.
- Validates input.
- Invokes `actions.openPackageGraph(invocation, request)` exactly once.
- On action success: calls `projectionStore.activateProjection(signal, result.data.id)` and returns success envelope.
- On action failure: calls `projectionStore.discardProjection(signal)` and returns failure envelope.

---

## 33. Projection Activation Contract

Agent graph loading mirrors the human UI integration lifecycle:
- Projection is staged by the Apollo adapter against `invocation.signal`.
- Staged projection is activated ONLY upon successful canonical commit.
- Staged projection is discarded upon failure, stale context, or cancellation.

---

## 34. `STALE_CONTEXT` Contract

If the canonical state revision increments while an Agent `open_package_graph` call is in-flight:
- Action layer rejects the commit with `STALE_CONTEXT`.
- Staged projection is discarded.
- Existing visible graph and canonical state remain preserved.

---

## 35. Cancellation Contract

If `execContext.signal` is aborted:
- Tool returns `{ ok: false, error: { code: "CANCELLED", message: "..." } }`.
- Staged projection is discarded.
- No canonical graph commit occurs.

---

## 36. Structured Error Contract

All error envelopes conform to:
```typescript
{
  ok: false,
  tool: string,
  changed: false,
  contextRevision: number,
  error: {
    code: WarRoomErrorCode,
    message: string // capped at 240 chars
  }
}
```
Raw stacks, causes, and DOMExceptions are never returned.

---

## 37. Output Budget

Per WMCP-INV-011, tool output serialized length is strictly budgeted <= 1500 characters (internal target <= 1400):
- `buildBudgetedSearchOutput()` adds complete package records incrementally. If an item causes overflow, truncation stops and sets `truncated: true`.
- Package IDs and names are never sliced into corrupted strings.

---

## 38. Untrusted Content Boundary

Both tools declare `untrustedContentHint: true` because package identifiers and graph metadata originate from public/external registries.

---

## 39. Product-Specific Input Boundary

Tools accept only domain package queries and IDs. No arbitrary URLs, GraphQL, SQL, Cypher, shell commands, or raw scripts are permitted.

---

## 40. Progressive Enhancement

When WebMCP is unavailable or registration fails:
- Host component catches errors cleanly.
- Zero error boundaries triggered.
- Human UI on `/graph` operates normally.

---

## 41. Human-Agent Shared Runtime

Human UI and WebMCP Agent tools share:
- The SAME Zustand store instance.
- The SAME `WarRoomStatePort`.
- The SAME `WarRoomActions` instance.
- The SAME `WarRoomGraphProjectionStore`.

---

## 42. No Adaptive Tool Surface Confirmation

No state-dependent tool swapping is implemented in 3B.

---

## 43. No Tool Registry Confirmation

No `ToolRegistry` class or factory exists in production.

---

## 44. No Generations Confirmation

No generation IDs or generation lifecycle management exists in production.

---

## 45. No Toolchange Handling Confirmation

No `ontoolchange` or `toolchange` event listeners exist in production.

---

## 46. Same-Origin Scope

Tool registration and execution operate exclusively within the same-origin application scope.

---

## 47. Test Inventory

- **Registration & Bridge Spec:** `apps/frontend/e2e/war-room-webmcp-registration.spec.ts` (**35 passed**)
- **Agent UI Browser Spec:** `apps/frontend/e2e/war-room-webmcp-agent-ui.spec.ts` (**6 passed**)
- **Platform Capability Spec:** `apps/frontend/e2e/war-room-webmcp-platform.spec.ts` (**42 passed**)
- **Domain State Kernel Spec:** `apps/frontend/e2e/war-room-domain.spec.ts` (**28 passed**)
- **Actions Boundary Spec:** `apps/frontend/e2e/war-room-actions.spec.ts` (**51 passed**)
- **Integration Layer Spec:** `apps/frontend/e2e/war-room-integration.spec.ts` (**30 passed**)
- **Human UI Browser Spec:** `apps/frontend/e2e/war-room-human-ui.spec.ts` (**5 passed**)
- **Homepage Smoke Spec:** `apps/frontend/e2e/homepage.spec.ts` (**8 passed**)
- **Total Automated Matrix:** **205 passed** (100% PASS)

---

## 48. 3A Regression

- Platform capability suite: 42 passed (exit 0)

---

## 49. WMCP-2 Regression

- 2A Domain State Kernel: 28 passed (exit 0)
- 2B Application Actions: 51 passed (exit 0)
- 2C Integration Layer: 30 passed (exit 0)
- 2C Human UI E2E: 5 passed (exit 0)
- Homepage Smoke: 8 passed (exit 0)

---

## 50. Registration Tests

- 35/35 logical tests passed in `war-room-webmcp-registration.spec.ts`

---

## 51. Agent UI Tests

- 6/6 browser E2E flows passed in `war-room-webmcp-agent-ui.spec.ts`:
  1. Primitive registration on boot: PASS
  2. Agent search pure-read: PASS
  3. Agent open graph & projection: PASS
  4. Shared canonical runtime: PASS
  5. Stale race rejection: PASS
  6. Execution cancellation: PASS

---

## 52. TypeScript

- `npx tsc --noEmit -p apps/frontend/tsconfig.json` -> Exit 0 (0 errors)

---

## 53. ESLint

- `npm run lint` -> Exit 0 (0 errors, 0 warnings)

---

## 54. Next Build

- `npm run build` -> Exit 0 (15/15 static pages generated)

---

## 55. npm Audit

- `npm audit --json` -> Exit 0 (0 vulnerabilities)

---

## 56. Package Invariants

- `apps/frontend/package.json`: UNCHANGED (0 diff)
- `apps/frontend/package-lock.json`: UNCHANGED (0 diff)

---

## 57. Closed Source Invariants

- `apps/frontend/src/lib/war-room/**`: UNCHANGED (0 diff)
- `apps/frontend/src/app/graph/page.tsx`: UNCHANGED (0 diff)
- `apps/frontend/src/components/providers/war-room-provider.tsx`: UNCHANGED (0 diff)
- `apps/frontend/next.config.js`: UNCHANGED (0 diff)
- Backend & Cargo workspaces: UNCHANGED (0 diff)

---

## 58. Upstream Final Recheck

- Repository: `webmachinelearning/webmcp`
- Branch: `main`
- SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491`
- Contract verified unchanged during phase.

---

## 59. Acceptance Gate Matrix

| Gate | Description | Status |
| :--- | :--- | :---: |
| **3B-1** | Starting HEAD exact `993fb4b10dbb1a060424494a1adad081020f782a` | **PASS** |
| **3B-2** | Branch exact `feature/webmcp-challenge-2026` | **PASS** |
| **3B-3** | Current upstream main SHA recorded (`41d12f05`) | **PASS** |
| **3B-4** | Current upstream registration callback contract reverified | **PASS** |
| **3B-5** | Only search_packages and open_package_graph registered | **PASS** |
| **3B-6** | No registration during BOOTSTRAP | **PASS** |
| **3B-7** | Physical primitive set not changed on later phase transitions | **PASS** |
| **3B-8** | WebMcpPlatformAdapter gains generic registration primitive | **PASS** |
| **3B-9** | Browser registerTool direct call isolated to platform adapter | **PASS** |
| **3B-10** | SSR safety preserved | **PASS** |
| **3B-11** | Platform unavailable returns UNAVAILABLE | **PASS** |
| **3B-12** | Registration AbortError returns CANCELLED | **PASS** |
| **3B-13** | Other registration failure returns REGISTRATION_FAILED | **PASS** |
| **3B-14** | Raw browser errors sanitized | **PASS** |
| **3B-15** | Registration result after aborted lifetime is not reported successful | **PASS** |
| **3B-16** | Primitive session start idempotent | **PASS** |
| **3B-17** | One registration controller controls both primitive registrations | **PASS** |
| **3B-18** | Partial registration failure rolls back successful first tool | **PASS** |
| **3B-19** | Dispose unregisters primitive physical set | **PASS** |
| **3B-20** | No ToolRegistry | **PASS** |
| **3B-21** | No registration generations | **PASS** |
| **3B-22** | No RETIRING/drain logic | **PASS** |
| **3B-23** | No adaptive tool surface | **PASS** |
| **3B-24** | search_packages exact public name | **PASS** |
| **3B-25** | open_package_graph exact public name | **PASS** |
| **3B-26** | search schema additionalProperties false | **PASS** |
| **3B-27** | open graph schema additionalProperties false | **PASS** |
| **3B-28** | search schema canonical ecosystem enum exact | **PASS** |
| **3B-29** | runtime validation exists independently of schemas | **PASS** |
| **3B-30** | caller tenant/user/token fields rejected | **PASS** |
| **3B-31** | caller contextRevision rejected | **PASS** |
| **3B-32** | arbitrary URL rejected | **PASS** |
| **3B-33** | search readOnlyHint true | **PASS** |
| **3B-34** | search untrustedContentHint true | **PASS** |
| **3B-35** | open graph readOnlyHint false | **PASS** |
| **3B-36** | open graph untrustedContentHint true | **PASS** |
| **3B-37** | AGENT channel created at execution time | **PASS** |
| **3B-38** | contextRevision captured at execution time | **PASS** |
| **3B-39** | execution AbortSignal identity preserved | **PASS** |
| **3B-40** | registration signal distinct from execution signal | **PASS** |
| **3B-41** | search delegates exactly once to actions.searchPackages | **PASS** |
| **3B-42** | open graph delegates exactly once to actions.openPackageGraph | **PASS** |
| **3B-43** | no Apollo usage in WebMCP bridge | **PASS** |
| **3B-44** | no direct canonical mutation in WebMCP bridge | **PASS** |
| **3B-45** | search successful execution leaves canonical state unchanged | **PASS** |
| **3B-46** | search may complete after unrelated revision increment | **PASS** |
| **3B-47** | open graph successful execution updates canonical graph through action | **PASS** |
| **3B-48** | open graph success activates staged projection after action success | **PASS** |
| **3B-49** | open graph failure discards staged projection | **PASS** |
| **3B-50** | STALE_CONTEXT cannot activate staged projection | **PASS** |
| **3B-51** | CANCELLED cannot commit stale graph | **PASS** |
| **3B-52** | same canonical runtime used by human and agent | **PASS** |
| **3B-53** | structured success envelope implemented | **PASS** |
| **3B-54** | structured failure envelope implemented | **PASS** |
| **3B-55** | raw stack never returned | **PASS** |
| **3B-56** | error.details omitted from default tool output | **PASS** |
| **3B-57** | all outputs JSON serializable | **PASS** |
| **3B-58** | all outputs <=1500 characters | **PASS** |
| **3B-59** | search truncation keeps whole package records | **PASS** |
| **3B-60** | no fabricated breakage/impact terminology | **PASS** |
| **3B-61** | WarRoomProvider unchanged | **PASS** |
| **3B-62** | graph page unchanged | **PASS** |
| **3B-63** | closed domain unchanged | **PASS** |
| **3B-64** | closed state unchanged | **PASS** |
| **3B-65** | closed application unchanged | **PASS** |
| **3B-66** | closed integration unchanged | **PASS** |
| **3B-67** | next.config unchanged | **PASS** |
| **3B-68** | package.json unchanged | **PASS** |
| **3B-69** | package-lock unchanged | **PASS** |
| **3B-70** | backend unchanged | **PASS** |
| **3B-71** | Cargo/toolchain unchanged | **PASS** |
| **3B-72** | CI/Docker unchanged | **PASS** |
| **3B-73** | 3A platform suite PASS (42/42) | **PASS** |
| **3B-74** | 2A regression PASS (28/28) | **PASS** |
| **3B-75** | 2B regression PASS (51/51) | **PASS** |
| **3B-76** | 2C integration PASS (30/30) | **PASS** |
| **3B-77** | 2C human UI PASS (5/5) | **PASS** |
| **3B-78** | homepage PASS (8/8) | **PASS** |
| **3B-79** | 3B registration suite PASS (35/35) | **PASS** |
| **3B-80** | >=35 meaningful registration logical tests (35 tests) | **PASS** |
| **3B-81** | 3B agent UI suite PASS (6/6) | **PASS** |
| **3B-82** | >=6 meaningful agent UI flows (6 flows) | **PASS** |
| **3B-83** | agent search E2E PASS | **PASS** |
| **3B-84** | agent graph open E2E PASS | **PASS** |
| **3B-85** | shared agent/human state E2E PASS | **PASS** |
| **3B-86** | agent stale race E2E PASS | **PASS** |
| **3B-87** | agent cancellation E2E PASS | **PASS** |
| **3B-88** | TypeScript PASS (0 errors) | **PASS** |
| **3B-89** | ESLint PASS (0 errors, 0 warnings) | **PASS** |
| **3B-90** | Next build PASS (15/15 static pages) | **PASS** |
| **3B-91** | npm audit 0 vulnerabilities | **PASS** |
| **3B-92** | navigator.modelContext absent (0 count) | **PASS** |
| **3B-93** | no production getTools invocation (0 count) | **PASS** |
| **3B-94** | no production executeTool invocation (0 count) | **PASS** |
| **3B-95** | no direct document.modelContext outside platform boundary (0 count) | **PASS** |
| **3B-96** | schema/runtime validation parity verified | **PASS** |
| **3B-97** | upstream final SHA rechecked (`41d12f05`) | **PASS** |
| **3B-98** | 3A README status corrected to CLOSED | **PASS** |
| **3B-99** | 3B README remains pending independent verification | **PASS** |
| **3B-100** | only scope-valid files staged | **PASS** |

---

## 60. Final Status

**IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
