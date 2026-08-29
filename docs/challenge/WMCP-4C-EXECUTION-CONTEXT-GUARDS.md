# WMCP-4C - Adaptive Execution Admission, Context Revision & Stale Completion Guards

## 1. Purpose & Scope

This document defines the execution-time admission rules, canonical execution snapshot semantics, and policy-specific context revision / stale completion guards for the canonical WebMCP tool surface (**WMCP-4C** and **WMCP-4C-R1**).

A physical browser registration on `window.modelContext` may temporarily outlive the logical application state in which it was valid. WMCP-4C guarantees that physical registration is never treated as sufficient authority to execute: every invocation is independently evaluated against the CURRENT application capability state at invocation time, and asynchronous completions are guarded against stale context returns.

### Non-Goals (Explicitly Deferred to WMCP-4D)
- Live dynamic subscription to `WarRoomStatePort` or `WebMcpPlatformAdapter`
- Automatic reconciliation scheduling inside React provider
- Implementation of any deferred capability (`calculate_blast_radius`, `simulate_api_changes`, etc.)

---

## 2. Review Chronology & Upstream Pin

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **WMCP-4A Closure HEAD**: `e527dd59963ef2b63184d6ed3d4e48b526e9e574`
- **WMCP-4B Closure HEAD**: `55898c865269494d84b3f89aae0f7c138a1da8e1`
- **WMCP-4C Initial HEAD**: `2755440280fb74fba04d31df8a7ab30ca7f87db0`
- **WMCP-4C-RV Finding**: Independent adversarial review failed due to `FINDING-4C-001` (generic post-action cancellation check returned `CANCELLED` and discarded projection after successful canonical commit).
- **WMCP-4C-R1 Correction**: Corrected `open_package_graph` to enforce `INV-WMCP4C-MUT-001` (commit success is final; post-commit cancellation does not override committed `SUCCESS` or discard projection).
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Branch: `main`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491` (verified unchanged)

---

## 3. Execution Policy Matrix (7 Executable Tools)

| Tool Name | Execution Policy | Input Authority | Mutation? | Stale Completion Behavior | Cancellation Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `search_packages` | `REVISION_TOLERANT_READ` | Explicit input (`query`, `limit`) | NO | May drain across revision changes once validly admitted | Pre-result AbortSignal returns `CANCELLED` |
| `open_package_graph` | `ACTION_COMMIT_GUARDED_MUTATION` | Explicit input (`rootPackageId`, `depth`) | **YES** | Action commit guard validates revision; commit success returns `SUCCESS` | Pre-commit abort returns `CANCELLED`; post-commit returns `SUCCESS` |
| `summarize_graph` | `STRICT_CONTEXT_READ` | Implicit (`state.graph`) | NO | `currentRevision !== capturedRevision` -> `STALE_CONTEXT` | Pre-result AbortSignal returns `CANCELLED` |
| `trace_dependency_path` | `REVISION_TOLERANT_READ` | Explicit input (`sourcePackageId`, `targetPackageId`) | NO | May drain across revision changes once validly admitted | Pre-result AbortSignal returns `CANCELLED` |
| `inspect_selected_package` | `STRICT_CONTEXT_READ` | Implicit target (`state.selection.package.id`) | NO | `currentRevision !== capturedRevision` -> `STALE_CONTEXT` | Pre-result AbortSignal returns `CANCELLED` |
| `inspect_scenario` | `STRICT_CONTEXT_READ` | Implicit target (`state.scenario`) | NO | `currentRevision !== capturedRevision` -> `STALE_CONTEXT` | Pre-result AbortSignal returns `CANCELLED` |
| `inspect_migration_plan` | `STRICT_CONTEXT_READ` | Implicit target (`state.plan`) | NO | `currentRevision !== capturedRevision` -> `STALE_CONTEXT` | Pre-result AbortSignal returns `CANCELLED` |

**Deferred Tools (9 Tools)**: Remain strictly uninstantiable (`createAdaptiveToolDefinition` throws immediately and fails closed).

---

## 4. Execution Invariants & Architectural Contracts

### INV-WMCP4C-EXEC-001: Physical Registration is Not Execution Authority
Every tool invocation captures the current application snapshot and independently validates whether the tool is active in the current desired logical surface before invoking any action, query, or service.

### INV-WMCP4C-EXEC-002: Single Invocation Snapshot
Each invocation captures exactly one immutable `WebMcpExecutionSnapshot` (`state`, `contextRevision`, `phase`) at invocation start. All contextual inputs derive strictly from this snapshot.

### INV-WMCP4C-EXEC-003: Single Logical Surface Authority
Logical admission reuses `deriveDesiredToolSurface` from WMCP-4A as the single normative authority. No duplicated phase-to-tool maps exist in WMCP-4C.

### INV-WMCP4C-EXEC-004: Platform Availability Participates in Admission
When `WebMcpPlatformAdapter.getSnapshot().availability` is `"UNAVAILABLE"`, `deriveDesiredToolSurface` yields an empty tool set, rejecting all new invocations with `INVALID_STATE` (0 action calls).

### INV-WMCP4C-EXEC-005: Retired Tool Rejection
If a physically registered tool outlives its active phase, invocation immediately returns `INVALID_STATE` without calling any underlying actions or mutating state.

### INV-WMCP4C-EXEC-006: Strict Read Stale Completion Guard
For `STRICT_CONTEXT_READ` tools, if `statePort.getState().contextRevision !== snapshot.contextRevision` upon asynchronous resolution, the tool returns `STALE_CONTEXT` to prevent stale contextual data from being reported as current.

### INV-WMCP4C-EXEC-007: Revision-Tolerant Read Draining
For `REVISION_TOLERANT_READ` tools, once an invocation is validly admitted, later context revision changes do not invalidate the immutable explicit query; the operation drains and completes successfully.

### INV-WMCP4C-EXEC-008: Action-Commit-Guarded Mutation
`open_package_graph` delegates revision validation and atomic state commitment directly to `WarRoomActions.openPackageGraph`. A successful mutation increments `contextRevision` legitimately and returns `SUCCESS` without false stale rejection.

### INV-WMCP4C-MUT-001: Commit Success is Final (R1 Correction)
For `ACTION_COMMIT_GUARDED_MUTATION` (`open_package_graph`), `actionRes.ok === true` signifies that the authoritative canonical state commit has completed. Post-commit cancellation MUST NOT override committed `SUCCESS`, discard the projection, or return `CANCELLED`. If `actionRes.ok === false`, pre-commit cancellation / error semantics apply.

### INV-WMCP4C-EXEC-009: Cancellation Precedence for Reads
For read operations, if `execContext.signal` is aborted before result publication, the tool returns `CANCELLED`. Cancellation takes precedence over both successful resolution and stale context checks.

### INV-WMCP4C-EXEC-010: No Stale Implicit Target Re-reading
`inspect_selected_package` derives the immutable package ID from `snapshot.state.selection.package.id`. If another package is selected mid-flight, the tool does not substitute the new package and returns `STALE_CONTEXT`.

### INV-WMCP4C-EXEC-011: Sanitized Error Envelopes & Output Budgets
All tool failures and successes strictly adhere to the <= 1500 character budget (`MAX_TOTAL_OUTPUT_CHARS`), with error messages sanitized and truncated to <= 240 characters.

### INV-WMCP4C-EXEC-012: Deferred Tools Non-Executable
All 9 deferred tools fail closed on factory creation and cannot be invoked.

---

## 5. Commit-Boundary Precedence Matrix (`open_package_graph`)

| Abort Timing | Canonical Commit Happened? | Wrapper Execution Outcome | Visible Projection State |
| :--- | :--- | :--- | :--- |
| Before action start | NO | Returns `CANCELLED`, 0 action calls | Unchanged |
| During query before commit | NO | Returns `CANCELLED`, 0 state mutation | Unchanged |
| Stale commit rejected | NO | Returns `STALE_CONTEXT`, state preserved | Unchanged |
| Successful commit, no abort | YES | Returns `SUCCESS`, revision $N+1$ | Activated |
| Abort synchronously after commit | **YES** | Returns `SUCCESS`, revision $N+1$ | **Activated** |

---

## 6. Test Evidence & Quality Validation

- **Focused Execution Guard Test Suite** (`e2e/war-room-webmcp-execution-guard.spec.ts`): **19 / 19 PASS**
  - 4C-T1: Exact policy set matches 7 executable catalog tools
  - 4C-T2: Deferred tools fail closed on factory creation
  - 4C-T3: Current desired surface admits active tool
  - 4C-T4 & 4C-T5: Physically retired tool rejected with `INVALID_STATE` (0 action calls)
  - 4C-T6: Platform `UNAVAILABLE` rejects execution admission
  - 4C-T7: Pre-aborted execution signal returns `CANCELLED`
  - 4C-T8: Late success from AbortSignal-ignoring dependency returns `CANCELLED`
  - 4C-T9, 4C-T10, 4C-T11: `inspect_selected_package` immutable snapshot & stale race guard
  - 4C-T12: `trace_dependency_path` revision-tolerant read succeeds across revision change
  - 4C-T13: `search_packages` revision-tolerant read drains successfully
  - 4C-T14: `summarize_graph` uses captured canonical snapshot
  - 4C-T15 & 4C-T16: `inspect_scenario` and `inspect_migration_plan` invalid when not exposed
  - 4C-T17: Successful `open_package_graph` revision increment returns `SUCCESS`
  - 4C-T18: Delayed stale `open_package_graph` commit returns `STALE_CONTEXT`
  - 4C-T19: Cancellation wins over strict-read stale completion
  - 4C-T20: Registration and execution signals remain separate
  - 4C-T21: Action call count invariant (0 on failure, 1 on success)
  - 4C-T22: Output budget invariant (<= 1500 chars)
  - **4C-T23 (Permanent R1 Adversarial)**: Synchronous post-commit abort on `open_package_graph` preserves committed `SUCCESS` and activates matching projection (`INV-WMCP4C-MUT-001`)
- **Unit & Integration Regression Suite (8 specs)**: **246 / 246 PASS**
- **Browser E2E Regression Suite (3 specs)**: **20 / 20 PASS**
- **Total Automated Test Count**: **266 / 266 PASS**
- **TypeScript**: `npx tsc --noEmit` -> **0 errors**
- **ESLint**: `npm run lint` -> **0 errors, 0 warnings**
- **Next.js Production Build**: Compiled successfully in 5.6s (15/15 static pages)
- **ASCII Scan**: 0 non-ASCII hyphens across all deliverable files (`U+2013 = 0`, `U+2014 = 0`)

---

## 7. Status

**WMCP-4C-R1 IMPLEMENTED - PENDING INDEPENDENT RE-VERIFICATION**
