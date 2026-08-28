# WMCP-3B / WMCP-3B-R1 Primitive Registration Adapter & Tool Execution Bridge

- **Phase:** `WMCP-3B / WMCP-3B-R1 - Primitive Registration Adapter & Tool Execution Bridge`
- **Starting HEAD:** `91489babad3cd36502ef688048324db4e9b5a0fb`
- **Parent Commit:** `993fb4b10dbb1a060424494a1adad081020f782a`
- **WMCP-3A Closure Dependency:** `WMCP-3A - WebMCP Platform Contract, Capability Detection & Type Boundary` (PASS - CLOSED at `993fb4b10dbb1a060424494a1adad081020f782a`)
- **Status:** `IMPLEMENTED - PENDING INDEPENDENT VERIFICATION`

---

## 1. WMCP-3B Independent Review & Corrective Closure

### Reviewed Commit
`91489babad3cd36502ef688048324db4e9b5a0fb`

### Independent Verdict
`PASS WITH CORRECTIONS - NOT CLOSED`

### Itemized Review Findings & R1 Resolutions
1. **Finding 1 (Open Graph Compact Output Budget):** In initial 3B, `buildBudgetedOpenGraphOutput()` checked full representation, but the fallback still retained unbounded external package name and was not checked again.
   - **R1 Resolution:** Introduced `WebMcpOpenGraphResultData` union with `compact: boolean`. Compact fallback omits external package name/version and includes only `rootPackageId`. Compact representation is explicitly checked against the 1500-char budget. If even compact representation exceeds budget, the bridge fails closed to a small structured `INTERNAL_ERROR` envelope.
2. **Finding 2 (Generic `formatToolSuccess` Budget Safety):** In initial 3B, `formatToolSuccess()` detected overflow but returned the oversized envelope unchanged.
   - **R1 Resolution:** `formatToolSuccess()` is now genuinely hard-safe: any payload exceeding 1500 characters returns a structured `INTERNAL_ERROR` envelope within budget.
3. **Finding 3 (Canonical / Projection Winner Rule Mismatch):** Canonical state mutation uses `contextRevision` first-commit-wins semantics, while the legacy 2C projection store used `sequence === latestRequestedSequence` veto semantics. Under concurrent same-key requests from independent callers (Human and Agent), an earlier request could successfully commit canonically while its projection was rejected by an uncommitted newer request.
   - **R1 Resolution:** Successful canonical commit through `WarRoomActions` is established as the authoritative permission to publish its staged visual projection. The `latestRequestedSequence` equality veto was removed from `activateProjection()`. Monotonic committed sequence (`sequence >= latestCommittedSequence`) was preserved to prevent older committed sequences from replacing newer committed visual states.
4. **Finding 4 (Post-Commit Abort Projection Publication):** In initial 3B, `activateProjection()` rejected publication if `signal.aborted` was set after canonical commit.
   - **R1 Resolution:** Pre-commit cancellation via `signal` correctly returns `CANCELLED` and discards staged projection. Post-canonical-commit activation uses `signal` strictly as a correlation key and does not reject publication, preventing state/visual divergence.
5. **Finding 5 (Registration Test #26 Validity):** Test #26 previously used a non-existent `PACKAGE_SELECTED` event and manually forged a stale revision while bypassing the bridge.
   - **R1 Resolution:** Replaced with a real unit/integration stale test using a delayed `WarRoomGraphQueryPort`, genuine semantic mutation (`selectPackage` / `NODE_SELECTED`), executing through `open_package_graph.execute()`.
6. **Finding 6 (Static Cast Test Assertion):** Test #35 computed `targetForbidden1` (`as any`) without asserting it.
   - **R1 Resolution:** Fixed test to scan production WebMCP bridge and platform code and assert both `as any` and `WebMcpBrowserTool<any, any>` are completely absent.

### Confirmed Architectural Integrity
- No security bypass found.
- No direct Apollo or GraphQL bypass found in bridge.
- No trusted caller identity leak found.
- No adaptive registry was prematurely implemented (zero `ToolRegistry`, zero generations, zero `ACTIVE/RETIRING/REMOVED` lifecycle states).

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

## 6. TypeScript & Build Invariants

- **Production TypeScript (`apps/frontend/tsconfig.json`):** PASS (0 errors).
- **TypeScript Scope Truth:** `e2e/**` is explicitly excluded from `apps/frontend/tsconfig.json`. E2E type correctness is verified through Playwright execution and static source scans.
- **ESLint:** PASS (0 errors, 0 warnings).
- **Next.js Production Build:** PASS (15/15 static routes generated).
- **npm Audit:** PASS (0 vulnerabilities).

---

## 7. Test Inventory & Regression Matrix (209 / 209 Passed)

- **3B Registration & Execution Bridge Unit Spec:** `apps/frontend/e2e/war-room-webmcp-registration.spec.ts` (**38 / 38 PASS**)
- **3B WebMCP Agent UI Browser E2E Spec:** `apps/frontend/e2e/war-room-webmcp-agent-ui.spec.ts` (**7 / 7 PASS**)
- **3A Platform Capability Spec:** `apps/frontend/e2e/war-room-webmcp-platform.spec.ts` (**42 / 42 PASS**)
- **2A Domain State Kernel Spec:** `apps/frontend/e2e/war-room-domain.spec.ts` (**28 / 28 PASS**)
- **2B Application Actions Spec:** `apps/frontend/e2e/war-room-actions.spec.ts` (**51 / 51 PASS**)
- **2C Integration Layer Spec:** `apps/frontend/e2e/war-room-integration.spec.ts` (**30 / 30 PASS**)
- **2C Human UI Graph Workflow Spec:** `apps/frontend/e2e/war-room-human-ui.spec.ts` (**5 / 5 PASS**)
- **Homepage Smoke Spec:** `apps/frontend/e2e/homepage.spec.ts` (**8 / 8 PASS**)
- **Total Automated Matrix:** **209 passed** (100% PASS)

---

## 8. Acceptance Gate Matrix (3B-R1-1 to 3B-R1-58)

| Gate | Description | Status |
| :--- | :--- | :---: |
| **3B-R1-1** | Starting HEAD exact `91489babad3cd36502ef688048324db4e9b5a0fb` | **PASS** |
| **3B-R1-2** | Upstream WebMCP SHA reverified (`41d12f05`) | **PASS** |
| **3B-R1-3** | No third public tool added | **PASS** |
| **3B-R1-4** | Generic registration primitive preserved | **PASS** |
| **3B-R1-5** | Hard <=1500 budget enforced for every output class | **PASS** |
| **3B-R1-6** | Pathological open root name cannot exceed budget | **PASS** |
| **3B-R1-7** | Compact open graph fallback rechecked after construction | **PASS** |
| **3B-R1-8** | formatToolSuccess made genuinely budget-safe | **PASS** |
| **3B-R1-9** | Search preserves whole package records | **PASS** |
| **3B-R1-10** | Long search record produces safe truncation | **PASS** |
| **3B-R1-11** | Error outputs <=1500 | **PASS** |
| **3B-R1-12** | Tool success uses actionResult.contextRevision | **PASS** |
| **3B-R1-13** | Tool success uses authoritative action changed semantics | **PASS** |
| **3B-R1-14** | Successful canonical graph commit is projection publication authority | **PASS** |
| **3B-R1-15** | latestRequestedSequence no longer vetoes a successful canonical commit | **PASS** |
| **3B-R1-16** | monotonic committed sequence protection preserved | **PASS** |
| **3B-R1-17** | post-commit signal abort cannot leave canonical graph without its committed projection | **PASS** |
| **3B-R1-18** | pre-commit abort remains CANCELLED | **PASS** |
| **3B-R1-19** | open bridge checks projection activation result | **PASS** |
| **3B-R1-20** | open output reports projectionActivated truthfully | **PASS** |
| **3B-R1-21** | same-key agent A-first race converges canonical/projection | **PASS** |
| **3B-R1-22** | same-key agent B-first race converges canonical/projection | **PASS** |
| **3B-R1-23** | human/agent same-key race converges canonical/projection | **PASS** |
| **3B-R1-24** | stale request cannot mutate canonical state | **PASS** |
| **3B-R1-25** | stale request cannot publish projection | **PASS** |
| **3B-R1-26** | old invalid PACKAGE_SELECTED test removed | **PASS** |
| **3B-R1-27** | replacement stale test executes through WebMCP bridge | **PASS** |
| **3B-R1-28** | replacement stale test uses genuine semantic mutation | **PASS** |
| **3B-R1-29** | test 35 actually asserts intended static rule | **PASS** |
| **3B-R1-30** | E2E tsconfig exclusion documented truthfully | **PASS** |
| **3B-R1-31** | domain unchanged | **PASS** |
| **3B-R1-32** | state unchanged | **PASS** |
| **3B-R1-33** | application unchanged | **PASS** |
| **3B-R1-34** | only authorized graph-projection integration file changed | **PASS** |
| **3B-R1-35** | WarRoomProvider unchanged | **PASS** |
| **3B-R1-36** | graph page unchanged | **PASS** |
| **3B-R1-37** | next.config unchanged | **PASS** |
| **3B-R1-38** | package manifests unchanged | **PASS** |
| **3B-R1-39** | backend unchanged | **PASS** |
| **3B-R1-40** | no ToolRegistry | **PASS** |
| **3B-R1-41** | no generations | **PASS** |
| **3B-R1-42** | no RETIRING/drain logic | **PASS** |
| **3B-R1-43** | 3A platform regression PASS (42/42) | **PASS** |
| **3B-R1-44** | 2A regression PASS (28/28) | **PASS** |
| **3B-R1-45** | 2B regression PASS (51/51) | **PASS** |
| **3B-R1-46** | 2C integration regression PASS under corrected projection contract (30/30) | **PASS** |
| **3B-R1-47** | 2C human UI regression PASS (5/5) | **PASS** |
| **3B-R1-48** | homepage PASS (8/8) | **PASS** |
| **3B-R1-49** | 3B registration suite PASS (38/38) | **PASS** |
| **3B-R1-50** | 3B agent UI suite PASS (7/7) | **PASS** |
| **3B-R1-51** | TypeScript PASS (0 errors) | **PASS** |
| **3B-R1-52** | ESLint PASS (0 errors, 0 warnings) | **PASS** |
| **3B-R1-53** | Next build PASS (15/15 static pages) | **PASS** |
| **3B-R1-54** | npm audit 0 vulnerabilities | **PASS** |
| **3B-R1-55** | independent review recorded | **PASS** |
| **3B-R1-56** | historical 2C rule supersession documented | **PASS** |
| **3B-R1-57** | README remains pending independent verification | **PASS** |
| **3B-R1-58** | only scope-valid files committed | **PASS** |

---

## 9. Final Status

**IMPLEMENTED - PENDING INDEPENDENT VERIFICATION**
