# WMCP-3A WebMCP Platform Contract, Capability Detection & Type Boundary

- **Phase:** `WMCP-3A - WebMCP Platform Contract, Capability Detection & Type Boundary`
- **Starting HEAD:** `1ae87969743e1d9f2a71cc0d89402090c133f0d8`
- **WMCP-2 Closure Dependency:** `WMCP-2 - WAR ROOM DOMAIN STATE & ACTION LAYER` (PASS - CLOSED at `1ae87969743e1d9f2a71cc0d89402090c133f0d8`)
- **Status:** `IMPLEMENTED - PENDING INDEPENDENT VERIFICATION`

---

## 1. Purpose

WMCP-3A establishes the type-safe browser capability and platform detection boundary for WebMCP (Web Model Context Protocol). It defines conservative local TypeScript compatibility declarations, an isolated `WebMcpPlatformAdapter` abstraction, generic tool registration variance, and lazy SSR-safe feature detection without modifying closed domain/state/application kernels or registering real War Room tools.

---

## 2. Starting HEAD

- **Authoritative SHA:** `1ae87969743e1d9f2a71cc0d89402090c133f0d8`
- **Branch:** `feature/webmcp-challenge-2026`
- **Parent Commit:** `0fd902833f92be9182eb605fd91b1510063a3c5a`

---

## 3. WMCP-2 Closure Dependency

WMCP-3A strictly depends on the independently verified, closed WMCP-2 architecture:
- `WMCP-2A` (Canonical State Kernel): CLOSED at `01c47c35a597916dceb0360c34e745c0ad9184fc`
- `WMCP-2B` (Shared WarRoomActions Boundary): CLOSED at `02c32ecb06733033fe08b2c0e5f12077695e4366`
- `WMCP-2C` (Human UI Integration & Strict Adapters): CLOSED at `da09d62371d83e6d49d37c32f1ab947b2a3d0fe6`
- `WMCP-2R` (War Room Review & Invariant Closure): CLOSED at `1ae87969743e1d9f2a71cc0d89402090c133f0d8`

---

## 4. Upstream Contract Pin

- **Repository:** `webmachinelearning/webmcp`
- **Branch:** `main`
- **Observed SHA:** `41d12f057167ccf5954dbcf49d99502cb6c84491`
- **Observation Date:** `2026-08-28`
- **Source File:** `index.bs`
- **Specification Status:** Draft Community Group Report (CG-DRAFT)

*Rationale:* The WebMCP specification is an active Community Group draft under rapid development. To eliminate ambiguity arising from cached or lagging rendered HTML reports, the local TypeScript compatibility boundary is explicitly pinned to the normative WebIDL and algorithms defined in upstream commit `41d12f057167ccf5954dbcf49d99502cb6c84491`.

---

## 5. WebMCP Specification Status

WebMCP is currently published as a **Draft Community Group Report** by the Web Machine Learning Community Group. It is not a finalized W3C Recommendation or a standard part of default browser `lib.dom.d.ts`. Consequently, all browser integration must be treated as an experimental platform extension encapsulated behind an adapter layer with full progressive enhancement.

---

## 6. Current Upstream API Surface

The normative WebIDL surface defined in upstream `index.bs` (commit `41d12f05`) includes:
- `document.modelContext`: `[SecureContext, SameObject] readonly attribute ModelContext modelContext;`
- `modelContext.registerTool(tool, options)`: Returns `Promise<undefined>`.
- `modelContext.getTools(options)`: Takes optional `ModelContextGetToolOptions` (with `fromOrigins`) and returns `Promise<sequence<RegisteredTool>>`.
- `modelContext.executeTool(tool, inputObject, options)`: Returns `Promise<DOMString>` (stringified tool result).
- `modelContext.ontoolchange` / `toolchange` event: Emitted on tool registration/deregistration.
- `ToolExecuteCallback`: `Promise<any> (object inputObject, ToolExecuteCallbackOptions options)`.
- `ToolExecuteCallbackOptions`: `required AbortSignal signal;`.
- `ModelContextRegisterToolOptions`: `signal` (registration lifetime), `exposedTo` (origin exposure).
- `ModelContextGetToolOptions`: `fromOrigins` (sequence of origins).
- `ModelContextExecuteToolOptions`: `signal` (caller execution cancellation).
- `ModelContextTool.inputSchema`: `object` at registration time.
- `RegisteredTool`: `name`, `title`, `description`, `inputSchema` (`object`), `window` (`Window`), `origin` (`USVString`), `annotations`.
- `Permissions Policy`: `tools` directive with default allowlist `'self'`.

---

## 7. Chrome Implementation Alignment

Chrome documentation details experimental browser behaviors:
- `document.modelContext`: Primary active property (origin trial / experimental flag).
- `navigator.modelContext`: Deprecated since Chrome 150; marked for removal and strictly forbidden in challenge code.
- `executeTool()`: Supported in Chrome and now normative in upstream WebMCP CG IDL.
- `ToolExecuteCallback`: Passes `(input, { signal })` matching normative upstream `ToolExecuteCallbackOptions`.
- Chrome 153 Lifecycle Note: Unregistering a tool no longer aborts currently in-flight executions.

---

## 8. Spec & Implementation Contract Matrix

| Capability | Upstream CG Report (`41d12f05`) | Chrome Docs / Implementation | WMCP Architectural Decision |
| :--- | :--- | :--- | :--- |
| **`document.modelContext`** | Primary IDL attribute | Primary active property | **Adopted as primary boundary** |
| **`navigator.modelContext`** | Not present | Deprecated since Chrome 150 | **Strictly FORBIDDEN** |
| **`registerTool()`** | `Promise<undefined>` | Supported | **Generic platform primitive (deferred to 3B)** |
| **`getTools()`** | `Promise<sequence<RegisteredTool>>` | Supported | **Diagnostic & discovery foundation** |
| **`executeTool()`** | `Promise<DOMString>` | Supported | **Modeled in browser types; excluded from app adapter** |
| **`toolchange` event** | Normative event | Supported | **Lifecycle event (deferred to 3B/4)** |
| **Registration `signal`** | `ModelContextRegisterToolOptions.signal` | Supported | **Registration lifetime control** |
| **Execution `signal`** | `ToolExecuteCallbackOptions.signal` (required) | Supported | **Tool execution cancellation token** |
| **`executeTool` `signal`** | `ModelContextExecuteToolOptions.signal` | Supported | **Caller execution cancellation token** |
| **`RegisteredTool.inputSchema`** | `object` (deep-copy) | Supported | **Modeled as object in registered tool** |
| **Permissions Policy** | `tools` default `'self'` | Cross-origin iframe requires delegation | **Same-origin scope; distinct from origin-keying** |

---

## 9. `document.modelContext` Decision

All platform detection and future WebMCP integrations route exclusively through `document.modelContext`. No fallback or dual-stack logic is permitted.

---

## 10. `navigator.modelContext` Deprecation Decision

`navigator.modelContext` is deprecated in Chrome 150+ and absent from the Community Group draft. It is strictly prohibited in all challenge code. A static regression test enforces zero occurrences across production source.

---

## 11. Secure Context Requirement

WebMCP requires a Secure Context (`https://` or `http://localhost`). `WebMcpPlatformSnapshot` captures `window.isSecureContext` diagnostics without artificially altering platform surface detection in non-secure test environments.

---

## 12. Origin Isolation Requirement

WebMCP registration requires an origin-keyed agent cluster. Experimental implementations fail registration if `document.domain` is modified or `Origin-Agent-Cluster: ?0` is active. This requirement is distinct from the `tools` Permissions Policy.

---

## 13. Permissions Policy

The `tools` Permissions Policy defaults to `'self'` under the current specification. Because the application is same-origin, header modification is unnecessary in WMCP-3A.

---

## 14. Same-Origin Product Scope

The War Room application operates as a single-origin, top-level application. Cross-origin iframe tool exposure, `fromOrigins`, and `exposedTo` configurations are explicitly out of product scope.

---

## 15. Tri-Context Cancellation Signal Semantics

The specification distinguishes three separate cancellation contexts:
1. **Registration Signal (`registerTool(tool, { signal })`):** Controls the registration lifetime of the tool (automatic unregistration when aborted).
2. **Execution Callback Signal (`execute(input, { signal })`):** Required `AbortSignal` passed to the tool callback to observe mid-flight execution cancellation.
3. **ExecuteTool Signal (`executeTool(tool, input, { signal })`):** Optional `AbortSignal` passed by the in-page caller to abort an in-flight tool invocation.

---

## 16. Chrome 153 Lifecycle Note

In Chrome 153+, unregistering a tool does not cancel in-flight executions. The War Room architecture accounts for this by retaining execution-level `AbortController` management in the action layer, decoupling registration lifecycles from execution lifecycles.

---

## 17. Local TypeScript Compatibility Strategy

Local ambient declarations are isolated in `apps/frontend/src/types/webmcp.d.ts` using distinct `WebMcpBrowser*` prefixes without installing third-party npm packages.

---

## 18. Document Augmentation

`Document` is augmented conservatively with `readonly modelContext?: WebMcpBrowserModelContext`. `Navigator` is NOT augmented.
- **Normative WebIDL:** `[SecureContext, SameObject] readonly attribute ModelContext modelContext;`
- **Project Ambient Type:** `readonly modelContext?: ...` (optional to support progressive enhancement and feature detection in environments where WebMCP is absent).

---

## 19. Browser Compatibility Types

Declarations model the low-level browser surface:
- `WebMcpBrowserToolAnnotations`
- `WebMcpBrowserToolExecuteOptions` (`signal: AbortSignal`)
- `WebMcpBrowserToolExecuteCallback<TInput extends object, TOutput>`
- `WebMcpBrowserTool<TInput extends object, TOutput>`
- `WebMcpBrowserRegisteredTool` (`inputSchema?: Record<string, unknown>`, `window: Window`, `origin: string`)
- `WebMcpBrowserRegisterOptions` (`signal?: AbortSignal`, `exposedTo?: readonly string[]`)
- `WebMcpBrowserGetToolsOptions` (`fromOrigins?: readonly string[]`)
- `WebMcpBrowserExecuteToolOptions` (`signal?: AbortSignal`)
- `WebMcpBrowserModelContext` (`registerTool`, `getTools`, `executeTool`, `ontoolchange`)

---

## 20. Application Platform Types

Application-owned types in `apps/frontend/src/lib/webmcp/platform/types.ts`:
- `WebMcpAvailability`: `"AVAILABLE" | "UNAVAILABLE"`
- `WebMcpPlatformSnapshot`: Plain diagnostic DTO.
- `WebMcpPlatformAdapter`: Platform abstraction interface.

---

## 21. `WebMcpAvailability`

Discrete binary status:
- `"AVAILABLE"`: `document.modelContext` is present with callable `registerTool` and `getTools` functions.
- `"UNAVAILABLE"`: Missing document, missing `modelContext`, or incomplete method surface.

---

## 22. `WebMcpPlatformSnapshot`

JSON-serializable snapshot:
```typescript
export interface WebMcpPlatformSnapshot {
  readonly availability: WebMcpAvailability;
  readonly hasDocument: boolean;
  readonly hasModelContext: boolean;
  readonly secureContext: boolean | null;
  readonly originAgentCluster?: boolean | null;
}
```

---

## 23. `WebMcpPlatformAdapter`

```typescript
export interface WebMcpPlatformAdapter {
  getSnapshot(): WebMcpPlatformSnapshot;
  isAvailable(): boolean;
}
```

---

## 24. Browser Adapter

`createBrowserWebMcpPlatformAdapter(options?: { customGlobal?: unknown })`:
- Lazy scope access (zero module-scope DOM evaluation).
- SSR-safe (runs in Node/Next.js build without throwing).
- Dependency injectable for deterministic testing.

---

## 25. Feature Detection Algorithm

```
function detect():
  1. scope = customGlobal || globalThis
  2. if scope.document is not object -> UNAVAILABLE
  3. if scope.document.modelContext is not object -> UNAVAILABLE
  4. if typeof modelContext.registerTool !== "function" -> UNAVAILABLE
  5. if typeof modelContext.getTools !== "function" -> UNAVAILABLE
  6. return AVAILABLE
```

Detection performs ZERO invocations of `registerTool()` or `getTools()`.

---

## 26. SSR Safety

Platform modules can be evaluated and imported in Node.js server environments without `ReferenceError: document is not defined`.

---

## 27. Progressive Enhancement

Standard browser workflows (e.g. human UI on `/graph`) continue operating without any WebMCP dependency or errors.

---

## 28. Canonical State Isolation

Platform capability detection has ZERO interaction with `WarRoomState`. Calling detection produces zero state transitions and zero `contextRevision` increments.

---

## 29. Explicit Non-Goals

- Real tool registration (deferred to WMCP-3B / WMCP-4).
- Adaptive tool registry and generations (deferred to WMCP-4).
- Tool schemas (deferred to WMCP-3B+).
- WebMCP to `WarRoomActions` execution bridge (deferred to WMCP-3B).

---

## 30. No Tool Registration Confirmation

Static scans and runtime assertions confirm zero production calls to `document.modelContext.registerTool()` in WMCP-3A.

---

## 31. No Tool Registry Confirmation

No `ToolRegistry`, `RegistrationManager`, or lifecycle states (`REGISTERING`, `ACTIVE`, `RETIRING`) exist in production code.

---

## 32. No Adaptive Surface Confirmation

Adaptive tool surfaces and state-dependent schema registration remain deferred to WMCP-4.

---

## 33. WMCP-3A Corrective Review History

### 33.1 WMCP-3A Initial Review
- **Reviewed Commit:** `8013ec7d13e474b30bd6e7af357b298234961c23`
- **Independent Status:** `PASS WITH CORRECTIONS - NOT CLOSED`
- **Findings (WMCP-3A-R1):**
  1. *`getTools()` Options:* Corrected from erroneous `signal` to `fromOrigins`.
  2. *`RegisteredTool.inputSchema`:* Replaced object with serialized string (stale rendered draft).
  3. *`registerTool()` Return Type:* Narrowed to `Promise<void>`.
  4. *`document.modelContext` Precision:* Distinguished normative attribute from optional local ambient type.
  5. *Permissions Policy:* Separated from origin-keyed agent cluster gate.

### 33.2 WMCP-3A-R1 Independent Review
- **Reviewed Commit:** `85bcd1b4dd59745ef43ca9bd5f101ed3479f30b6`
- **Independent Status:** `PASS WITH CORRECTIONS - NOT CLOSED`
- **Findings (WMCP-3A-R2):**
  1. *Generic `registerTool`:* Converted `registerTool` into a generic method to support strict function variance without casts.
  2. *`TInput` Object Constraint:* Added `TInput extends object` to match `Promise<any> (object input)`.
  3. *Permissions Policy Matrix:* Removed erroneous "enforces origin isolation" phrase.

### 33.3 WMCP-3A-R2 Independent Review
- **Reviewed Commit:** `d4c601fbb9a1370f4a0916a4391d2fee48876573`
- **Independent Status:** `PASS WITH CORRECTIONS - NOT CLOSED`
- **Findings (WMCP-3A-R3):**
  1. *Upstream Source Alignment:* Aligned directly with `webmachinelearning/webmcp` main (`41d12f05`), incorporating normative `executeTool()` and required `ToolExecuteCallbackOptions.signal`.
  2. *`RegisteredTool.inputSchema`:* Updated to normative `object` (deep-copy) shape.
  3. *Cast-Free Test Boundary:* Eliminated all `as any` and `WebMcpBrowserTool<any, any>` from platform test source.
  4. *Upstream SHA Pinning:* Established explicit upstream repository SHA pin (`41d12f05`) to prevent draft drift.

---

## 34. Test Inventory

- **Platform Spec:** `apps/frontend/e2e/war-room-webmcp-platform.spec.ts` (**42 passed**)
- Total Logical Tests across all suites: **164 tests** (28 2A + 51 2B + 30 2C + 5 Human UI + 8 Homepage + 42 3A).

---

## 35. WMCP-2 Regression Results

| Test Suite | Logical Count | Passed | Result |
| :--- | :---: | :---: | :---: |
| **WMCP-2A Domain State Kernel** | 28 | 28 | **PASS** |
| **WMCP-2B Application Boundary** | 51 | 51 | **PASS** |
| **WMCP-2C Integration Layer** | 30 | 30 | **PASS** |
| **WMCP-2C Human UI E2E** | 5 | 5 | **PASS** |
| **Homepage Smoke & Accessibility** | 8 | 8 | **PASS** |
| **WMCP-3A Platform Boundary** | 42 | 42 | **PASS** |
| **Total Automated Matrix** | **164** | **164** | **100% PASS** |

---

## 36. TypeScript Compilation

- **Command:** `npx tsc --noEmit -p apps/frontend/tsconfig.json`
- **Result:** **PASS** (0 errors, exit 0)

---

## 37. ESLint

- **Command:** `npm run lint`
- **Result:** **PASS** (0 errors, 0 warnings, exit 0)

---

## 38. Next Production Build

- **Command:** `npm run build`
- **Result:** **PASS** (15/15 static routes generated, exit 0)

---

## 39. npm Audit

- **Command:** `npm audit --json`
- **Result:** **PASS** (0 vulnerabilities, exit 0)

---

## 40. Package Invariants

- `apps/frontend/package.json`: UNCHANGED (0 diff)
- `apps/frontend/package-lock.json`: UNCHANGED (0 diff)

---

## 41. Platform Invariants

- `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `.clippy.toml`: UNCHANGED (0 diff)
- `apps/frontend/next.config.js`: UNCHANGED (0 diff)
- `.github/workflows/`, `deploy/docker/`: UNCHANGED (0 diff)

---

## 42. Acceptance Gate Matrix

| Gate | Description | Status |
| :--- | :--- | :---: |
| **3A-R3-1** | Starting HEAD exact `d4c601fbb9a1370f4a0916a4391d2fee48876573` | **PASS** |
| **3A-R3-2** | Current upstream GitHub main HEAD recorded (`41d12f05`) | **PASS** |
| **3A-R3-3** | Current `index.bs` inspected directly | **PASS** |
| **3A-R3-4** | `executeTool` current upstream status recorded truthfully | **PASS** |
| **3A-R3-5** | `ToolExecuteCallback` current second argument recorded truthfully | **PASS** |
| **3A-R3-6** | `ToolExecuteCallback` signal requiredness recorded truthfully | **PASS** |
| **3A-R3-7** | `RegisteredTool.inputSchema` current type recorded truthfully | **PASS** |
| **3A-R3-8** | `ModelContextExecuteToolOptions` modeled if normative | **PASS** |
| **3A-R3-9** | Low-level `WebMcpBrowserModelContext` includes `executeTool` | **PASS** |
| **3A-R3-10** | Application `WebMcpPlatformAdapter` remains minimal | **PASS** |
| **3A-R3-11** | Generic `registerTool` preserved | **PASS** |
| **3A-R3-12** | `TInput` object constraint preserved | **PASS** |
| **3A-R3-13** | Typed registration requires no cast | **PASS** |
| **3A-R3-14** | Typed execution requires no cast | **PASS** |
| **3A-R3-15** | Platform tests contain no `as any` | **PASS** |
| **3A-R3-16** | Platform tests contain no `WebMcpBrowserTool<any, any>` | **PASS** |
| **3A-R3-17** | Only deliberate negative `@ts-expect-error` remains allowed | **PASS** |
| **3A-R3-18** | `getTools` `fromOrigins` preserved | **PASS** |
| **3A-R3-19** | `getTools` `signal` absent | **PASS** |
| **3A-R3-20** | Registration `signal` preserved | **PASS** |
| **3A-R3-21** | Execution callback signal distinct from registration signal | **PASS** |
| **3A-R3-22** | `executeTool` cancellation signal distinct from both | **PASS** |
| **3A-R3-23** | `navigator.modelContext` remains forbidden | **PASS** |
| **3A-R3-24** | Permissions Policy remains separate from origin-keying | **PASS** |
| **3A-R3-25** | Detection algorithm unchanged | **PASS** |
| **3A-R3-26** | SSR safety preserved | **PASS** |
| **3A-R3-27** | Snapshot remains browser-object free | **PASS** |
| **3A-R3-28** | Zero real registration | **PASS** |
| **3A-R3-29** | No `ToolRegistry` | **PASS** |
| **3A-R3-30** | No adaptive lifecycle | **PASS** |
| **3A-R3-31** | No `WarRoomActions` bridge | **PASS** |
| **3A-R3-32** | Platform suite PASS | **PASS** |
| **3A-R3-33** | >=42 meaningful platform tests (42 tests) | **PASS** |
| **3A-R3-34** | 2A regression PASS (28/28) | **PASS** |
| **3A-R3-35** | 2B regression PASS (51/51) | **PASS** |
| **3A-R3-36** | 2C integration PASS (30/30) | **PASS** |
| **3A-R3-37** | 2C human UI PASS (5/5) | **PASS** |
| **3A-R3-38** | Homepage PASS (8/8) | **PASS** |
| **3A-R3-39** | TypeScript PASS (0 errors) | **PASS** |
| **3A-R3-40** | ESLint PASS (0 errors, 0 warnings) | **PASS** |
| **3A-R3-41** | Next build PASS (15/15 static pages) | **PASS** |
| **3A-R3-42** | npm audit 0 vulnerabilities | **PASS** |
| **3A-R3-43** | Closed WMCP-2 unchanged | **PASS** |
| **3A-R3-44** | `next.config.js` unchanged | **PASS** |
| **3A-R3-45** | Package manifests unchanged | **PASS** |
| **3A-R3-46** | README remains pending verification | **PASS** |
| **3A-R3-47** | R2 independent review recorded | **PASS** |
| **3A-R3-48** | Upstream source SHA pin recorded | **PASS** |
| **3A-R3-49** | Final upstream re-check performed | **PASS** |
| **3A-R3-50** | Only scope-valid files committed | **PASS** |

---

## 43. Final Status

**IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
