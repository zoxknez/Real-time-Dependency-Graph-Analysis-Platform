# WMCP-3B / WMCP-3B-R2 Primitive Registration Adapter & Tool Execution Bridge

- **Phase:** `WMCP-3B / WMCP-3B-R2 - Real Concurrency Evidence & Forensic Truth Closure`
- **Starting HEAD:** `f4b2e2182a01993e350584a580bc12752da011fc`
- **Parent Commit:** `f4b2e2182a01993e350584a580bc12752da011fc`
- **WMCP-3A Closure Dependency:** `WMCP-3A - WebMCP Platform Contract, Capability Detection & Type Boundary` (PASS - CLOSED at `993fb4b10dbb1a060424494a1adad081020f782a`)
- **Status:** `IMPLEMENTED - PENDING INDEPENDENT VERIFICATION`

---

## 1. Forensic Lineage & Independent Verification Reviews

### A. WMCP-3B Initial Implementation
- **Starting Parent:** `993fb4b10dbb1a060424494a1adad081020f782a`
- **Committed HEAD:** `91489babad3cd36502ef688048324db4e9b5a0fb`
- **Independent Verdict:** `PASS WITH CORRECTIONS - NOT CLOSED`
- **Findings:**
  1. Hard <=1500 output budget fallback in open graph retained unbounded external package name.
  2. Generic `formatToolSuccess` returned oversized envelope unchanged.
  3. Canonical mutation and projection store used conflicting winner rules (`contextRevision` vs `latestRequestedSequence` veto).
  4. Post-commit signal abort suppressed projection activation.
  5. Registration test #26 used non-existent `PACKAGE_SELECTED` and forged stale revision.
  6. Static cast test #35 computed forbidden tokens without asserting them.

### B. WMCP-3B-R1 Closure
- **Starting HEAD:** `91489babad3cd36502ef688048324db4e9b5a0fb`
- **Parent Commit:** `91489babad3cd36502ef688048324db4e9b5a0fb`
- **Committed HEAD:** `f4b2e2182a01993e350584a580bc12752da011fc`
- **Independent Verdict:** `PASS WITH CORRECTIONS - NOT CLOSED`
- **Findings & Acceptance Status:**
  1. *Accepted:* Production budget fixes (compact fallback, hard-safe `formatToolSuccess`, whole-record search truncation).
  2. *Accepted:* Canonical commit authority model in `graph-projection.ts` (latest-request veto removed, monotonic committed sequence preserved, post-commit abort publication).
  3. *Accepted:* Action result truth (`actionResult.contextRevision`, `actionResult.changed`, `projectionActivated` reporting).
  4. *Unproven in R1 commit:* Test #33 manipulated projection store directly without executing two real concurrent Agent `openGraphTool.execute()` calls; B-first scenario was absent. Gates 3B-R1-21 and 3B-R1-22 were marked PASS without committed test execution.
  5. *Unproven in R1 commit:* Browser test #7 contained no Human UI action or concurrent overlap. Gate 3B-R1-23 was marked PASS without committed test execution.
  6. *Metadata:* R1 header conflated initial 3B parent (`993fb4...`) with R1 parent (`91489b...`).
  7. *Comment:* `graph-projection.ts` header retained superseded "latest-request sequence validation" comment.

### C. WMCP-3B-R2 Closure (Current)
- **Starting HEAD:** `f4b2e2182a01993e350584a580bc12752da011fc`
- **Parent Commit:** `f4b2e2182a01993e350584a580bc12752da011fc`
- **Scope:** Zero executable production code changes. Comment-only correction to `graph-projection.ts`. Real Agent A-first and B-first concurrency tests, real Human/Agent same-key browser race E2E, and corrected forensic metadata.

---

## 2. Superseded 2C Projection Rule Note

The historical WMCP-2C evidence records the truth at its closure SHA (`da09d623...`), where single-caller human graph operations aborted prior requests. With the introduction of the independent WebMCP Agent caller in WMCP-3B, cross-channel concurrency revealed that the `latestRequestedSequence` activation veto could suppress visual projections of successfully committed canonical graphs.

Under the authorized cross-channel integration exception, `apps/frontend/src/lib/war-room/integration/graph-projection.ts` was updated so canonical commit authority governs projection activation, while preserving monotonic committed sequence protection. Closed domain, state, and application layers remain strictly immutable.

---

## 3. Upstream WebMCP Contract Pin

- **Repository:** `webmachinelearning/webmcp`
- **Branch:** `main`
- **Observed SHA:** `41d12f057167ccf5954dbcf49d99502cb6c84491`
- **Status:** Unchanged, reverified before commit.

---

## 4. Primitive Physical Tool Set & Execution Pipeline

Exactly two primitive tools are registered upon exiting `BOOTSTRAP`:
1. `search_packages` (`readOnlyHint: true`, `untrustedContentHint: true`, pure-read, zero canonical state or revision mutation).
2. `open_package_graph` (`readOnlyHint: false`, `untrustedContentHint: true`, context-bound state mutation, staged projection lifecycle).

Both tools delegate strictly through `WarRoomActions`:
```
WebMCP Platform (document.modelContext)
  -> BrowserWebMcpPlatformAdapter (apps/frontend/src/lib/webmcp/platform/)
  -> Primitive Registration Session (Single shared AbortController, rollback on failure)
  -> WebMCP Bridge (apps/frontend/src/lib/webmcp/bridge/)
  -> WarRoomActions (searchPackages / openPackageGraph)
  -> Security Context & Authorization Ports
  -> Canonical WarRoomStatePort (Zustand)
  -> WarRoomGraphProjectionStore (Two-phase staging & activation)
```

---

## 5. Output Budget & Character Budgeting Truth

- Hard maximum serialized output: **<= 1500 characters** across all tool results (`assertWithinToolBudget`).
- Target internal budget: **<= 1400 characters**.
- Whole-record search truncation: Never slices package IDs or names. Sets `truncated: true` whenever output does not contain all matching records.
- Compact open graph fallback: If full output with external package name/version exceeds 1500 chars, compact representation (`rootPackageId`, `compact: true`, `projectionActivated: true`) is emitted.
- Sanitized error envelopes: Error messages capped at 240 chars. Failures guaranteed <= 1500 chars.
- Action result truth: Output `contextRevision` and `changed` originate authoritatively from `WarRoomActionResult`, immune to subsequent store mutations.

---

## 6. Real Concurrency Test Evidence

1. **Real Agent Same-Key A-First Race (Registration Test 33):**
   - Both Agent A and Agent B invoke `openGraphTool.execute()` for `npm:same-key@1.0.0` simultaneously and capture the same initial `contextRevision` (1).
   - In-flight requests stage projections with their respective `executionSignal`.
   - Gate A is released first -> A canonical commit succeeds (`ok: true`, `changed: true`, `projectionActivated: true`, `contextRevision: 2`). Canonical graph = A, visible projection = A.
   - Gate B is released second -> B fails with `STALE_CONTEXT` (`ok: false`, `error.code: "STALE_CONTEXT"`), B projection discarded.
   - Final state and projection remain converged on A.
2. **Real Agent Same-Key B-First Race (Registration Test 34):**
   - Both Agent A and Agent B invoke `openGraphTool.execute()` for `npm:same-key-b@1.0.0` simultaneously and capture initial `contextRevision` (1).
   - Gate B is released first -> B canonical commit succeeds (`ok: true`, `changed: true`, `projectionActivated: true`, `contextRevision: 2`). Canonical graph = B, visible projection = B.
   - Gate A is released second -> A fails with `STALE_CONTEXT`.
   - Final state and projection remain converged on B.
3. **Real Human / Agent Same-Key Browser Race (Agent UI Test 7):**
   - Both Human and Agent concurrently request `npm:same-package` at depth 2 on the real `/graph` page.
   - Requests overlap simultaneously at the GraphQL network barrier.
   - First caller commits canonically and renders visible projection.
   - Second caller completes without corrupting canonical root or visible projection (`data-war-room-root-package === data-war-room-projection-root === "npm:same-package"`).

---

## 7. TypeScript & Build Invariants

- **Production TypeScript (`apps/frontend/tsconfig.json`):** PASS (0 errors).
- **TypeScript Scope Truth:** `e2e/**` is explicitly excluded from `apps/frontend/tsconfig.json`. E2E type correctness is verified through Playwright execution and static source scans.
- **ESLint:** PASS (0 errors, 0 warnings).
- **Next.js Production Build:** PASS (15/15 static routes generated).
- **npm Audit:** PASS (0 vulnerabilities).

---

## 8. Test Inventory & Regression Matrix (211 / 211 Passed)

- **3B Registration & Execution Bridge Unit Spec:** `apps/frontend/e2e/war-room-webmcp-registration.spec.ts` (**40 / 40 PASS**)
- **3B WebMCP Agent UI Browser E2E Spec:** `apps/frontend/e2e/war-room-webmcp-agent-ui.spec.ts` (**7 / 7 PASS**)
- **3A Platform Capability Spec:** `apps/frontend/e2e/war-room-webmcp-platform.spec.ts` (**42 / 42 PASS**)
- **2A Domain State Kernel Spec:** `apps/frontend/e2e/war-room-domain.spec.ts` (**28 / 28 PASS**)
- **2B Application Actions Spec:** `apps/frontend/e2e/war-room-actions.spec.ts` (**51 / 51 PASS**)
- **2C Integration Layer Spec:** `apps/frontend/e2e/war-room-integration.spec.ts` (**30 / 30 PASS**)
- **2C Human UI Graph Workflow Spec:** `apps/frontend/e2e/war-room-human-ui.spec.ts` (**5 / 5 PASS**)
- **Homepage Smoke Spec:** `apps/frontend/e2e/homepage.spec.ts` (**8 / 8 PASS**)
- **Total Automated Matrix:** **211 passed** (100% PASS)

---

## 9. Acceptance Gate Matrix (3B-R2-1 to 3B-R2-60)

| Gate | Description | Status |
| :--- | :--- | :---: |
| **3B-R2-1** | Starting HEAD exact `f4b2e2182a01993e350584a580bc12752da011fc` | **PASS** |
| **3B-R2-2** | Upstream WebMCP pin reverified (`41d12f05`) | **PASS** |
| **3B-R2-3** | R1 production output budget implementation unchanged | **PASS** |
| **3B-R2-4** | R1 production primitive bridge implementation unchanged | **PASS** |
| **3B-R2-5** | R1 projection executable logic unchanged | **PASS** |
| **3B-R2-6** | graph-projection stale comment corrected | **PASS** |
| **3B-R2-7** | Real Agent A-first same-key test exists | **PASS** |
| **3B-R2-8** | Agent A-first uses openGraphTool.execute for both callers | **PASS** |
| **3B-R2-9** | Agent A-first callers capture same starting revision | **PASS** |
| **3B-R2-10** | Agent A-first winner canonical commit succeeds | **PASS** |
| **3B-R2-11** | Agent A-first winner projectionActivated true | **PASS** |
| **3B-R2-12** | Agent A-first loser returns STALE_CONTEXT | **PASS** |
| **3B-R2-13** | Agent A-first final canonical/projection converge | **PASS** |
| **3B-R2-14** | Real Agent B-first same-key test exists | **PASS** |
| **3B-R2-15** | Agent B-first uses openGraphTool.execute for both callers | **PASS** |
| **3B-R2-16** | Agent B-first callers capture same starting revision | **PASS** |
| **3B-R2-17** | Agent B-first winner canonical commit succeeds | **PASS** |
| **3B-R2-18** | Agent B-first winner projectionActivated true | **PASS** |
| **3B-R2-19** | Agent B-first loser returns STALE_CONTEXT | **PASS** |
| **3B-R2-20** | Agent B-first final canonical/projection converge | **PASS** |
| **3B-R2-21** | Browser Human/Agent same-key race contains actual Human UI action | **PASS** |
| **3B-R2-22** | Browser Human/Agent same-key race contains actual Agent registered-tool action | **PASS** |
| **3B-R2-23** | Both browser requests overlap in-flight | **PASS** |
| **3B-R2-24** | Both browser requests use same package/root | **PASS** |
| **3B-R2-25** | Final browser canonical root equals projection root | **PASS** |
| **3B-R2-26** | Existing general stale E2E preserved | **PASS** |
| **3B-R2-27** | Corrected delayed bridge stale unit test preserved | **PASS** |
| **3B-R2-28** | Hard output budget tests preserved | **PASS** |
| **3B-R2-29** | Static no-as-any production scan preserved | **PASS** |
| **3B-R2-30** | Evidence records f4b2 independent PASS WITH CORRECTIONS verdict | **PASS** |
| **3B-R2-31** | R1 gates 21/22/23 mismatch recorded truthfully | **PASS** |
| **3B-R2-32** | Evidence parent metadata corrected | **PASS** |
| **3B-R2-33** | Historical initial 3B lineage preserved | **PASS** |
| **3B-R2-34** | Domain unchanged | **PASS** |
| **3B-R2-35** | State unchanged | **PASS** |
| **3B-R2-36** | Application unchanged | **PASS** |
| **3B-R2-37** | Apollo integration executable code unchanged | **PASS** |
| **3B-R2-38** | WarRoomProvider unchanged | **PASS** |
| **3B-R2-39** | WebMCP host unchanged | **PASS** |
| **3B-R2-40** | Graph page unchanged | **PASS** |
| **3B-R2-41** | Platform adapter unchanged | **PASS** |
| **3B-R2-42** | Output formatter unchanged | **PASS** |
| **3B-R2-43** | Primitive tools unchanged | **PASS** |
| **3B-R2-44** | No third tool | **PASS** |
| **3B-R2-45** | No ToolRegistry | **PASS** |
| **3B-R2-46** | No adaptive surface | **PASS** |
| **3B-R2-47** | 3A regression PASS (42/42) | **PASS** |
| **3B-R2-48** | 2A regression PASS (28/28) | **PASS** |
| **3B-R2-49** | 2B regression PASS (51/51) | **PASS** |
| **3B-R2-50** | 2C integration PASS under corrected projection contract (30/30) | **PASS** |
| **3B-R2-51** | 2C Human UI PASS (5/5) | **PASS** |
| **3B-R2-52** | Homepage PASS (8/8) | **PASS** |
| **3B-R2-53** | 3B registration suite PASS >=40 meaningful cases (40/40) | **PASS** |
| **3B-R2-54** | 3B Agent browser suite PASS >=7 meaningful flows (7/7) | **PASS** |
| **3B-R2-55** | TypeScript PASS (0 errors) | **PASS** |
| **3B-R2-56** | ESLint PASS (0 errors, 0 warnings) | **PASS** |
| **3B-R2-57** | Build PASS (15/15 static pages) | **PASS** |
| **3B-R2-58** | npm audit 0 vulnerabilities | **PASS** |
| **3B-R2-59** | README/phase remains pending independent verification | **PASS** |
| **3B-R2-60** | Only scope-valid files committed | **PASS** |

---

## 11. WMCP-3B-R3 Deterministic Human-Agent Overlap & Final Evidence Closure

### 11.1 Independent Review Context (WMCP-3B-R2)
- **Reviewed HEAD**: `8714009e403da938c507503f7901e067ee325a19`
- **Verdict**: `PASS WITH CORRECTIONS - NOT CLOSED`
- **Key Findings**:
  1. Agent A-first (Test 33) and Agent B-first (Test 34) bridge race tests in `war-room-webmcp-registration.spec.ts` fully verified and accepted.
  2. Browser Human-Agent same-key race in `war-room-webmcp-agent-ui.spec.ts` Test 7 required removing fixed timers (`setTimeout(60)`) and establishing deterministic synchronization and completion tracking.
  3. Zero executable production diff required for R3.

### 11.2 R3 Deterministic Overlap Implementation
- **Zero Timer Authority**: Completely eliminated `setTimeout(60)` or any arbitrary delay timers from concurrency assertions.
- **Deterministic Network Gating**: Playwright route handler gates on the reverse dependents network request for the requested root package (`npm:same-package`).
- **Concurrent In-Flight Assertion**: While the Agent's request is held at the network gate, the Human UI triggers graph opening via real UI search input and button click; the test deterministically verifies that the Human UI loading spinner (`.animate-spin`) is actively visible, proving simultaneous in-flight execution.
- **Unblocking & Settlement**: Upon releasing the network gate, the Agent completes canonical commit and projection activation (`agentResult.data.projectionActivated === true`); the Human UI then finishes execution and clears its loading spinner (`expect(loadingSpinner).not.toBeVisible()`).
- **Final State Parity**: Both canonical root and visual projection root deterministically converge to `"npm:same-package"`.

### 11.3 Quality Suite Execution (211/211 PASS)
- **Agent UI E2E**: 7/7 tests PASS (`war-room-webmcp-agent-ui.spec.ts`)
- **Human UI E2E**: 5/5 tests PASS (`war-room-human-ui.spec.ts`)
- **Homepage E2E**: 8/8 tests PASS (`homepage.spec.ts`)
- **Registration Bridge Unit/Integration**: 40/40 tests PASS (`war-room-webmcp-registration.spec.ts`)
- **Platform Capability Boundary**: 42/42 tests PASS (`war-room-webmcp-platform.spec.ts`)
- **Domain Logic**: 28/28 tests PASS (`war-room-domain.spec.ts`)
- **Application Actions**: 51/51 tests PASS (`war-room-actions.spec.ts`)
- **Integration Adapters**: 30/30 tests PASS (`war-room-integration.spec.ts`)
- **TypeScript**: 0 errors (`tsc --noEmit`)
- **ESLint**: 0 errors, 0 warnings (`eslint .`)
- **Next.js Build**: 15/15 static pages successfully generated (`next build`)
- **npm audit**: 0 vulnerabilities

### 11.4 Acceptance Gates Matrix (3B-R3-1 to 3B-R3-40)

| Gate ID | Requirement Description | Status |
| :--- | :--- | :--- |
| **3B-R3-1** | Starting commit is exactly `8714009e403da938c507503f7901e067ee325a19` | **PASS** |
| **3B-R3-2** | Zero executable production diff in bridge, platform, domain, state, app, or UI | **PASS** |
| **3B-R3-3** | Browser Test 7 eliminates all fixed sleep timers (`setTimeout`) | **PASS** |
| **3B-R3-4** | Browser Test 7 explicitly awaits network arrival before Human UI trigger | **PASS** |
| **3B-R3-5** | Browser Test 7 verifies simultaneous in-flight state via active UI spinner | **PASS** |
| **3B-R3-6** | Browser Test 7 releases network gate and verifies Agent projection activation | **PASS** |
| **3B-R3-7** | Browser Test 7 deterministically awaits Human action settlement | **PASS** |
| **3B-R3-8** | Browser Test 7 verifies canonical root equals projection root (`npm:same-package`) | **PASS** |
| **3B-R3-9** | Agent A-first race test preserved and passing in registration spec (Test 33) | **PASS** |
| **3B-R3-10** | Agent B-first race test preserved and passing in registration spec (Test 34) | **PASS** |
| **3B-R3-11** | Hard output budget tests preserved (5000-char, 50000-char, oversized search) | **PASS** |
| **3B-R3-12** | Truncation preserves whole package records | **PASS** |
| **3B-R3-13** | Compact fallback outputs rootPackageId and compact: true | **PASS** |
| **3B-R3-14** | formatToolSuccess fails closed on oversized payload | **PASS** |
| **3B-R3-15** | formatToolFailure sanitizes error messages <= 1500 chars | **PASS** |
| **3B-R3-16** | Action result contextRevision and changed remain authoritative | **PASS** |
| **3B-R3-17** | Monotonic committed sequence preserved in projection store | **PASS** |
| **3B-R3-18** | Post-commit signal abort publishes projection | **PASS** |
| **3B-R3-19** | Zero `as any` or broad `any` casts in production code | **PASS** |
| **3B-R3-20** | WebMCP bridge contains zero direct DOM/Apollo/GraphQL access | **PASS** |
| **3B-R3-21** | WebMCP bridge contains zero ToolRegistry or generation lifecycle concepts | **PASS** |
| **3B-R3-22** | Upstream WebMCP pin verified (`41d12f057167ccf5954dbcf49d99502cb6c84491`) | **PASS** |
| **3B-R3-23** | 3A Platform regression suite PASS (42/42) | **PASS** |
| **3B-R3-24** | 2A Domain regression suite PASS (28/28) | **PASS** |
| **3B-R3-25** | 2B Application Actions regression suite PASS (51/51) | **PASS** |
| **3B-R3-26** | 2C Integration Adapters regression suite PASS (30/30) | **PASS** |
| **3B-R3-27** | 2C Human UI regression suite PASS (5/5) | **PASS** |
| **3B-R3-28** | Homepage regression suite PASS (8/8) | **PASS** |
| **3B-R3-29** | 3B Primitive Registration suite PASS (40/40) | **PASS** |
| **3B-R3-30** | 3B Agent Browser suite PASS (7/7) | **PASS** |
| **3B-R3-31** | Total test count is 211 tests (211/211 PASS) | **PASS** |
| **3B-R3-32** | TypeScript verification PASS (0 errors) | **PASS** |
| **3B-R3-33** | ESLint verification PASS (0 errors, 0 warnings) | **PASS** |
| **3B-R3-34** | Next.js production build PASS (15/15 static pages) | **PASS** |
| **3B-R3-35** | npm audit PASS (0 vulnerabilities) | **PASS** |
| **3B-R3-36** | Evidence documents R2 review findings and R3 resolution | **PASS** |
| **3B-R3-37** | Evidence lists exact parent SHA `8714009e403da938c507503f7901e067ee325a19` | **PASS** |
| **3B-R3-38** | Git status clean with only scope-permitted files modified | **PASS** |
| **3B-R3-39** | Commit message formatted as `test(webmcp): make human-agent race deterministic` | **PASS** |
| **3B-R3-40** | Final status set to IMPLEMENTED - PENDING INDEPENDENT VERIFICATION | **PASS** |

---

## 12. Final Status

**IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
