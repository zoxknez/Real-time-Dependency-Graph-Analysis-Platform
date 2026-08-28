# WMCP-3A WebMCP Platform Contract, Capability Detection & Type Boundary

- **Phase:** `WMCP-3A - WebMCP Platform Contract, Capability Detection & Type Boundary`
- **Starting HEAD:** `1ae87969743e1d9f2a71cc0d89402090c133f0d8`
- **WMCP-2 Closure Dependency:** `WMCP-2 - WAR ROOM DOMAIN STATE & ACTION LAYER` (PASS - CLOSED at `1ae87969743e1d9f2a71cc0d89402090c133f0d8`)
- **Status:** `IMPLEMENTED - PENDING INDEPENDENT VERIFICATION`

---

## 1. Purpose

WMCP-3A establishes the type-safe browser capability and platform detection boundary for WebMCP (Web Model Context Protocol). It defines conservative local TypeScript compatibility declarations, an isolated `WebMcpPlatformAdapter` abstraction, and lazy SSR-safe feature detection without modifying closed domain/state/application kernels or registering real War Room tools.

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
- `document.modelContext`: Optional `ModelContext` interface on the document.
- `modelContext.registerTool(tool, options)`: Registers a tool definition with lifetime options.
- `modelContext.getTools(options)`: Returns registered tools.
- `modelContext.ontoolchange` / `toolchange` event: Emitted on tool registration/deregistration.
- `ToolRegistrationOptions`: `signal` (registration lifetime), `exposedTo` (origin exposure).
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
| **`registerTool()`** | Normative IDL method | Supported | **Platform primitive (deferred to 3B)** |
| **`getTools()`** | Normative IDL method | Supported | **Detection & diagnostic foundation** |
| **`toolchange` event** | Normative event | Supported | **Lifecycle event (deferred to 3B/4)** |
| **Registration `signal`** | `ToolRegistrationOptions.signal` | Supported | **Registration lifetime control** |
| **`exposedTo`** | `ToolRegistrationOptions.exposedTo` | Supported | **Modeled in types; not used (same-origin)** |
| **`executeTool()`** | Not in CG IDL | Documented in Chrome | **Excluded from platform contract** |
| **Execution `signal`** | `(input)` only in CG IDL | `(input, { signal })` in Chrome | **Optional 2nd argument in types** |
| **Permissions Policy** | `tools` default `'self'` | Enforces origin isolation | **Documented; same-origin default** |

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

WebMCP registration requires an origin-keyed agent cluster. Experimental implementations fail registration if `document.domain` is modified or `Origin-Agent-Cluster: ?0` is active. This requirement is documented for WMCP-3B error normalization.

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

---

## 20. Browser Compatibility Types

Declarations model the low-level browser surface:
- `WebMcpBrowserToolAnnotations`
- `WebMcpBrowserChromeExecutionContext`
- `WebMcpBrowserToolExecuteCallback`
- `WebMcpBrowserTool`
- `WebMcpBrowserRegisteredTool`
- `WebMcpBrowserRegisterOptions`
- `WebMcpBrowserGetToolsOptions`
- `WebMcpBrowserModelContext`

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

## 34. Test Inventory

- **Platform Spec:** `apps/frontend/e2e/war-room-webmcp-platform.spec.ts` (**26 passed**)
- Total Logical Tests across all suites: **148 tests** (28 2A + 51 2B + 30 2C + 5 Human UI + 8 Homepage + 26 3A).

---

## 35. WMCP-2 Regression Results

| Test Suite | Logical Count | Passed | Result |
| :--- | :---: | :---: | :---: |
| **WMCP-2A Domain State Kernel** | 28 | 28 | **PASS** |
| **WMCP-2B Application Boundary** | 51 | 51 | **PASS** |
| **WMCP-2C Integration Layer** | 30 | 30 | **PASS** |
| **WMCP-2C Human UI E2E** | 5 | 5 | **PASS** |
| **Homepage Smoke & Accessibility** | 8 | 8 | **PASS** |
| **WMCP-3A Platform Boundary** | 26 | 26 | **PASS** |
| **Total Automated Matrix** | **148** | **148** | **100% PASS** |

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
| **3A-1** | Starting HEAD exact `1ae87969743e1d9f2a71cc0d89402090c133f0d8` | **PASS** |
| **3A-2** | Branch exact `feature/webmcp-challenge-2026` | **PASS** |
| **3A-3** | Current WebMCP draft re-verified | **PASS** |
| **3A-4** | Draft status recorded truthfully | **PASS** |
| **3A-5** | `document.modelContext` established as primary API | **PASS** |
| **3A-6** | `navigator.modelContext` forbidden | **PASS** |
| **3A-7** | Spec/Chrome divergence documented | **PASS** |
| **3A-8** | `executeTool` not required by app platform contract | **PASS** |
| **3A-9** | Chrome execution signal documented as experimental compatibility | **PASS** |
| **3A-10** | Registration signal distinguished from execution signal | **PASS** |
| **3A-11** | `tools` Permissions Policy default self documented | **PASS** |
| **3A-12** | Secure context requirement documented | **PASS** |
| **3A-13** | Origin-isolation requirement documented | **PASS** |
| **3A-14** | Cross-origin support explicitly out of scope | **PASS** |
| **3A-15** | Local TypeScript declaration created (`webmcp.d.ts`) | **PASS** |
| **3A-16** | `Document.modelContext` declaration optional | **PASS** |
| **3A-17** | No navigator augmentation | **PASS** |
| **3A-18** | No new npm dependency | **PASS** |
| **3A-19** | `WebMcpAvailability` implemented | **PASS** |
| **3A-20** | `WebMcpPlatformSnapshot` implemented | **PASS** |
| **3A-21** | Snapshot JSON serializable | **PASS** |
| **3A-22** | Snapshot contains no DOM/browser objects | **PASS** |
| **3A-23** | `WebMcpPlatformAdapter` implemented | **PASS** |
| **3A-24** | Browser adapter implemented | **PASS** |
| **3A-25** | Browser adapter SSR safe | **PASS** |
| **3A-26** | No module-scope document access | **PASS** |
| **3A-27** | Availability requires `registerTool` + `getTools` callable | **PASS** |
| **3A-28** | Detection performs no registration | **PASS** |
| **3A-29** | Detection performs no `getTools` call | **PASS** |
| **3A-30** | Detection has no canonical state side effects | **PASS** |
| **3A-31** | `contextRevision` unaffected by detection | **PASS** |
| **3A-32** | No real War Room tool registration | **PASS** |
| **3A-33** | No `ToolRegistry` | **PASS** |
| **3A-34** | No registration lifecycle / generations | **PASS** |
| **3A-35** | No adaptive tool surface | **PASS** |
| **3A-36** | No tool schemas | **PASS** |
| **3A-37** | No WebMCP `WarRoomActions` bridge | **PASS** |
| **3A-38** | Closed WMCP-2 domain unchanged | **PASS** |
| **3A-39** | Closed WMCP-2 state unchanged | **PASS** |
| **3A-40** | Closed WMCP-2 application unchanged | **PASS** |
| **3A-41** | Closed WMCP-2 integration unchanged | **PASS** |
| **3A-42** | `WarRoomProvider` unchanged | **PASS** |
| **3A-43** | `/graph` page unchanged | **PASS** |
| **3A-44** | `next.config.js` unchanged | **PASS** |
| **3A-45** | `package.json` unchanged | **PASS** |
| **3A-46** | `package-lock.json` unchanged | **PASS** |
| **3A-47** | Platform tests PASS (26/26) | **PASS** |
| **3A-48** | 2A regression PASS (28/28) | **PASS** |
| **3A-49** | 2B regression PASS (51/51) | **PASS** |
| **3A-50** | 2C integration regression PASS (30/30) | **PASS** |
| **3A-51** | 2C human UI regression PASS (5/5) | **PASS** |
| **3A-52** | Homepage regression PASS (8/8) | **PASS** |
| **3A-53** | TypeScript PASS (0 errors) | **PASS** |
| **3A-54** | ESLint PASS (0 errors, 0 warnings) | **PASS** |
| **3A-55** | Next build PASS (15/15 static pages) | **PASS** |
| **3A-56** | npm audit 0 vulnerabilities | **PASS** |
| **3A-57** | README records WMCP-2 closure correctly | **PASS** |
| **3A-58** | README marks 3A pending independent verification | **PASS** |
| **3A-59** | Evidence document truthful | **PASS** |
| **3A-60** | Only scope-valid files staged | **PASS** |

---

## 43. Final Status

**IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
