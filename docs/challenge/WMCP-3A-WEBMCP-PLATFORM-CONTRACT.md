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

## 4. Current Public Sources Reviewed

1. **Web Machine Learning Community Group WebMCP Draft Community Group Report (26 August 2026)**
2. **Chrome WebMCP Overview (August 2026)**
3. **Chrome Imperative WebMCP API Documentation (August 2026)**

---

## 5. WebMCP Specification Status

WebMCP is currently published as a **Draft Community Group Report** by the Web Machine Learning Community Group. It is not a finalized W3C Recommendation or a standard part of default browser `lib.dom.d.ts`. Consequently, all browser integration must be treated as an experimental platform extension encapsulated behind an adapter layer with full progressive enhancement.

---

## 6. Current Community Group API Surface

The normative WebIDL surface defined in the 26 August 2026 draft includes:
- `document.modelContext`: `[SecureContext, SameObject] readonly attribute ModelContext modelContext;`
- `modelContext.registerTool(tool, options)`: Returns `Promise<undefined>`.
- `modelContext.getTools(options)`: Takes optional `ModelContextGetToolOptions` (with `fromOrigins`) and returns `Promise<sequence<RegisteredTool>>`.
- `modelContext.ontoolchange` / `toolchange` event: Emitted on tool registration/deregistration.
- `ModelContextRegisterToolOptions`: `signal` (registration lifetime), `exposedTo` (origin exposure).
- `ModelContextGetToolOptions`: `fromOrigins` (sequence of origins). Note: contains NO `signal`.
- `ModelContextTool.inputSchema`: `object` at registration time.
- `RegisteredTool.inputSchema`: `DOMString` (serialized JSON schema string) on discovery.
- `ToolAnnotations`: `readOnlyHint`, `untrustedContentHint`.
- `Permissions Policy`: `tools` directive with default allowlist `'self'`.

---

## 7. Chrome Implementation Surface

Chrome documentation details experimental browser behaviors:
- `document.modelContext`: Primary active property (origin trial / experimental flag).
- `navigator.modelContext`: Deprecated since Chrome 150; marked for removal.
- `executeTool()`: In-page debugging/invocation utility (Chrome extension, not in CG IDL).
- `ToolExecuteCallback`: Passes `(input, context)` where `context.signal` is an execution-level `AbortSignal`.
- Chrome 153 Lifecycle Note: Unregistering a tool no longer aborts currently in-flight executions.

---

## 8. Spec vs Chrome Divergence Matrix

| Capability | CG Draft Report (Aug 2026) | Chrome Docs / Behavior | WMCP Architectural Decision |
| :--- | :--- | :--- | :--- |
| **`document.modelContext`** | Primary IDL attribute | Primary active property | **Adopted as primary boundary** |
| **`navigator.modelContext`** | Not present | Deprecated since Chrome 150 | **Strictly FORBIDDEN** |
| **`registerTool()`** | `Promise<undefined>` | Supported | **Generic platform primitive (deferred to 3B)** |
| **`getTools()`** | `Promise<sequence<RegisteredTool>>` | Supported | **Diagnostic & discovery foundation** |
| **`toolchange` event** | Normative event | Supported | **Lifecycle event (deferred to 3B/4)** |
| **Registration `signal`** | `ModelContextRegisterToolOptions.signal` | Supported | **Registration lifetime control** |
| **Registration `exposedTo`** | `ModelContextRegisterToolOptions.exposedTo` | Supported | **Modeled in types; not used (same-origin)** |
| **`getTools` options** | `fromOrigins` only | Supported | **`fromOrigins` modeled; `signal` excluded** |
| **`RegisteredTool.inputSchema`** | `DOMString` (string) | Supported | **Modeled as string (serialized schema)** |
| **`executeTool()`** | Not in CG IDL | Documented in Chrome | **Excluded from platform contract** |
| **Execution `signal`** | `(input)` only in CG IDL | `(input, { signal })` in Chrome | **Optional 2nd argument in types** |
| **Permissions Policy** | `tools` default `'self'` | Cross-origin iframe requires explicit delegation | **Same-origin scope; distinct from origin-keying** |

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

## 15. Registration Signal Semantics

The `signal` option passed to `registerTool(tool, { signal })` controls the registration lifetime of the tool (automatic unregistration when aborted). It is orthogonal to per-execution cancellation.

---

## 16. Execution Signal Divergence

While the Community Group IDL defines `execute(input)`, experimental Chrome supplies an optional second argument `{ signal?: AbortSignal }`. The local TypeScript declaration models `chromeExecutionContext?: { signal?: AbortSignal }` as an optional parameter, ensuring compatibility across standards-compliant and experimental runtimes.

---

## 17. Chrome 153 Lifecycle Note

In Chrome 153+, unregistering a tool does not cancel in-flight executions. The War Room architecture accounts for this by retaining execution-level `AbortController` management in the action layer, decoupling registration lifecycles from execution lifecycles.

---

## 18. Local TypeScript Compatibility Strategy

Local ambient declarations are isolated in `apps/frontend/src/types/webmcp.d.ts` using distinct `WebMcpBrowser*` prefixes without installing third-party npm packages.

---

## 19. Document Augmentation

`Document` is augmented conservatively with `readonly modelContext?: WebMcpBrowserModelContext`. `Navigator` is NOT augmented.
- **Normative WebIDL:** `[SecureContext, SameObject] readonly attribute ModelContext modelContext;`
- **Project Ambient Type:** `readonly modelContext?: ...` (optional to support progressive enhancement and feature detection in environments where WebMCP is absent).

---

## 20. Browser Compatibility Types

Declarations model the low-level browser surface:
- `WebMcpBrowserToolAnnotations`
- `WebMcpBrowserChromeExecutionContext`
- `WebMcpBrowserToolExecuteCallback<TInput extends object = Record<string, unknown>, TOutput = unknown>`
- `WebMcpBrowserTool<TInput extends object = Record<string, unknown>, TOutput = unknown>`
- `WebMcpBrowserRegisteredToolMetadata` (safe metadata subset omitting raw `Window`; `inputSchema?: string`)
- `WebMcpBrowserRegisterOptions` (`signal?: AbortSignal`, `exposedTo?: readonly string[]`)
- `WebMcpBrowserGetToolsOptions` (`fromOrigins?: readonly string[]`)
- `WebMcpBrowserModelContext` (generic `registerTool<TInput extends object, TOutput>`)

---

## 21. Application Platform Types

Application-owned types in `apps/frontend/src/lib/webmcp/platform/types.ts`:
- `WebMcpAvailability`: `"AVAILABLE" | "UNAVAILABLE"`
- `WebMcpPlatformSnapshot`: Plain diagnostic DTO.
- `WebMcpPlatformAdapter`: Platform abstraction interface.

---

## 22. `WebMcpAvailability`

Discrete binary status:
- `"AVAILABLE"`: `document.modelContext` is present with callable `registerTool` and `getTools` functions.
- `"UNAVAILABLE"`: Missing document, missing `modelContext`, or incomplete method surface.

---

## 23. `WebMcpPlatformSnapshot`

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

## 24. `WebMcpPlatformAdapter`

```typescript
export interface WebMcpPlatformAdapter {
  getSnapshot(): WebMcpPlatformSnapshot;
  isAvailable(): boolean;
}
```

---

## 25. Browser Adapter

`createBrowserWebMcpPlatformAdapter(options?: { customGlobal?: unknown })`:
- Lazy scope access (zero module-scope DOM evaluation).
- SSR-safe (runs in Node/Next.js build without throwing).
- Dependency injectable for deterministic testing.

---

## 26. Feature Detection Algorithm

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

## 27. SSR Safety

Platform modules can be evaluated and imported in Node.js server environments without `ReferenceError: document is not defined`.

---

## 28. Progressive Enhancement

Standard browser workflows (e.g. human UI on `/graph`) continue operating without any WebMCP dependency or errors.

---

## 29. Canonical State Isolation

Platform capability detection has ZERO interaction with `WarRoomState`. Calling detection produces zero state transitions and zero `contextRevision` increments.

---

## 30. Explicit Non-Goals

- Real tool registration (deferred to WMCP-3B / WMCP-4).
- Adaptive tool registry and generations (deferred to WMCP-4).
- Tool schemas (deferred to WMCP-3B+).
- WebMCP to `WarRoomActions` execution bridge (deferred to WMCP-3B).

---

## 31. No Tool Registration Confirmation

Static scans and runtime assertions confirm zero production calls to `document.modelContext.registerTool()` in WMCP-3A.

---

## 32. No Tool Registry Confirmation

No `ToolRegistry`, `RegistrationManager`, or lifecycle states (`REGISTERING`, `ACTIVE`, `RETIRING`) exist in production code.

---

## 33. No Adaptive Surface Confirmation

Adaptive tool surfaces and state-dependent schema registration remain deferred to WMCP-4.

---

## 34. WMCP-3A Corrective Review History

### 34.1 WMCP-3A Initial Review
- **Reviewed Commit:** `8013ec7d13e474b30bd6e7af357b298234961c23`
- **Independent Status:** `PASS WITH CORRECTIONS - NOT CLOSED`
- **Findings Identified & Corrected (WMCP-3A-R1):**
  1. *`getTools()` Options:* Replaced erroneous `signal?: AbortSignal` with normative `fromOrigins?: readonly string[]`.
  2. *`RegisteredTool.inputSchema`:* Replaced object schema with `inputSchema?: string` (DOMString serialized JSON schema).
  3. *`registerTool()` Return Type:* Narrowed from `Promise<void> | void` to strict `Promise<void>` matching normative `Promise<undefined>`.
  4. *`document.modelContext` Evidence Precision:* Clarified that normative WebIDL defines a non-optional attribute, while our local ambient declaration uses `?` for progressive enhancement.
  5. *Permissions Policy vs Origin-Keying:* Clarified that `tools` Permissions Policy and origin-keyed agent clusters are distinct security gates.

### 34.2 WMCP-3A-R1 Independent Review
- **Reviewed Commit:** `85bcd1b4dd59745ef43ca9bd5f101ed3479f30b6`
- **Independent Status:** `PASS WITH CORRECTIONS - NOT CLOSED`
- **Findings Identified & Corrected (WMCP-3A-R2):**
  1. *Generic `registerTool` Boundary:* Converted `registerTool` into a generic method `registerTool<TInput extends object, TOutput>(tool: WebMcpBrowserTool<TInput, TOutput>, options?)` to prevent TypeScript strict function variance errors when registering concretely typed tools.
  2. *Object Constraint on `TInput`:* Constrained `TInput extends object = Record<string, unknown>` to enforce the normative WebIDL callback contract `Promise<any> (object input)`, statically rejecting primitive inputs.
  3. *Permissions Policy Wording:* Refined the divergence matrix to remove any implication that Permissions Policy itself enforces origin-keyed agent clusters.

---

## 35. Test Inventory

- **Platform Spec:** `apps/frontend/e2e/war-room-webmcp-platform.spec.ts` (**38 passed**)
- Total Logical Tests across all suites: **160 tests** (28 2A + 51 2B + 30 2C + 5 Human UI + 8 Homepage + 38 3A).

---

## 36. WMCP-2 Regression Results

| Test Suite | Logical Count | Passed | Result |
| :--- | :---: | :---: | :---: |
| **WMCP-2A Domain State Kernel** | 28 | 28 | **PASS** |
| **WMCP-2B Application Boundary** | 51 | 51 | **PASS** |
| **WMCP-2C Integration Layer** | 30 | 30 | **PASS** |
| **WMCP-2C Human UI E2E** | 5 | 5 | **PASS** |
| **Homepage Smoke & Accessibility** | 8 | 8 | **PASS** |
| **WMCP-3A Platform Boundary** | 38 | 38 | **PASS** |
| **Total Automated Matrix** | **160** | **160** | **100% PASS** |

---

## 37. TypeScript Compilation

- **Command:** `npx tsc --noEmit -p apps/frontend/tsconfig.json`
- **Result:** **PASS** (0 errors, exit 0)

---

## 38. ESLint

- **Command:** `npm run lint`
- **Result:** **PASS** (0 errors, 0 warnings, exit 0)

---

## 39. Next Production Build

- **Command:** `npm run build`
- **Result:** **PASS** (15/15 static routes generated, exit 0)

---

## 40. npm Audit

- **Command:** `npm audit --json`
- **Result:** **PASS** (0 vulnerabilities, exit 0)

---

## 41. Package Invariants

- `apps/frontend/package.json`: UNCHANGED (0 diff)
- `apps/frontend/package-lock.json`: UNCHANGED (0 diff)

---

## 42. Platform Invariants

- `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `.clippy.toml`: UNCHANGED (0 diff)
- `apps/frontend/next.config.js`: UNCHANGED (0 diff)
- `.github/workflows/`, `deploy/docker/`: UNCHANGED (0 diff)

---

## 43. Acceptance Gate Matrix

| Gate | Description | Status |
| :--- | :--- | :---: |
| **3A-R2-1** | Starting HEAD exact `85bcd1b4dd59745ef43ca9bd5f101ed3479f30b6` | **PASS** |
| **3A-R2-2** | Current CG IDL reverified | **PASS** |
| **3A-R2-3** | `registerTool` is generic over concrete tool input/output | **PASS** |
| **3A-R2-4** | Typed `WebMcpBrowserTool<{query:string}, Result>` registers without cast | **PASS** |
| **3A-R2-5** | `TInput` constrained to `object` | **PASS** |
| **3A-R2-6** | Primitive `string` input rejected at compile time | **PASS** |
| **3A-R2-7** | Primitive `number` input rejected at compile time | **PASS** |
| **3A-R2-8** | `registerTool` remains Promise-only | **PASS** |
| **3A-R2-9** | `getTools` `fromOrigins` preserved | **PASS** |
| **3A-R2-10** | `getTools` `signal` remains absent | **PASS** |
| **3A-R2-11** | Registration `signal` preserved | **PASS** |
| **3A-R2-12** | `exposedTo` preserved | **PASS** |
| **3A-R2-13** | Discovered `inputSchema` string preserved | **PASS** |
| **3A-R2-14** | Safe `RegisteredTool` metadata subset documented truthfully | **PASS** |
| **3A-R2-15** | Chrome optional execution signal preserved | **PASS** |
| **3A-R2-16** | `navigator` remains forbidden | **PASS** |
| **3A-R2-17** | `executeTool` remains excluded | **PASS** |
| **3A-R2-18** | Permissions Policy no longer described as enforcing origin isolation | **PASS** |
| **3A-R2-19** | Origin-keyed requirement documented separately | **PASS** |
| **3A-R2-20** | Browser detection unchanged | **PASS** |
| **3A-R2-21** | SSR safety preserved | **PASS** |
| **3A-R2-22** | Zero detection side effects preserved | **PASS** |
| **3A-R2-23** | Zero real tool registration | **PASS** |
| **3A-R2-24** | No `ToolRegistry` | **PASS** |
| **3A-R2-25** | No adaptive lifecycle | **PASS** |
| **3A-R2-26** | No `WarRoomActions` bridge | **PASS** |
| **3A-R2-27** | Platform tests PASS | **PASS** |
| **3A-R2-28** | >=37 meaningful platform tests (38 tests) | **PASS** |
| **3A-R2-29** | 2A regression PASS (28/28) | **PASS** |
| **3A-R2-30** | 2B regression PASS (51/51) | **PASS** |
| **3A-R2-31** | 2C integration PASS (30/30) | **PASS** |
| **3A-R2-32** | 2C human UI PASS (5/5) | **PASS** |
| **3A-R2-33** | Homepage PASS (8/8) | **PASS** |
| **3A-R2-34** | TypeScript PASS (0 errors) | **PASS** |
| **3A-R2-35** | ESLint PASS (0 errors, 0 warnings) | **PASS** |
| **3A-R2-36** | Next build PASS (15/15 static pages) | **PASS** |
| **3A-R2-37** | npm audit 0 vulnerabilities | **PASS** |
| **3A-R2-38** | Closed WMCP-2 unchanged | **PASS** |
| **3A-R2-39** | `next.config.js` unchanged | **PASS** |
| **3A-R2-40** | Package manifests unchanged | **PASS** |
| **3A-R2-41** | README remains pending independent verification | **PASS** |
| **3A-R2-42** | R1 independent review recorded | **PASS** |
| **3A-R2-43** | Only scope-valid files committed | **PASS** |

---

## 44. Final Status

**IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
