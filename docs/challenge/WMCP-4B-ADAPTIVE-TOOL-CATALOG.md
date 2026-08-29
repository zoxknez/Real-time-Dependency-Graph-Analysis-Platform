# WMCP-4B - Adaptive Tool Catalog, Schema Contract & Authority Binding Freeze

## 1. Purpose & Scope

This document defines the authoritative tool catalog, strict JSON input schemas, annotation contracts, authority bindings, and explicit schema readiness states for the complete canonical WebMCP tool vocabulary (**WMCP-4B / WMCP-4B-R2**).

WMCP-4B freezes the tool interface and connects every tool to its authoritative underlying capability without duplicating deterministic domain calculations, inventing unbacked future schemas, or claiming false executability for unavailable baseline engines.

### Key Corrections in WMCP-4B-R2
- **Truthful Executability (FINDING-4B-001)**: `recalculate_scenario` and `generate_migration_plan` are reclassified as `DEFERRED` because the baseline production composition binds `createUnavailable...Port()` returning `UNAVAILABLE`.
- **Truthful Visual Authority (FINDING-4B-002)**: `focus_graph_nodes` is reclassified as `DEFERRED` with `schemaStatus: "PENDING_DOMAIN_CONTRACT"` because `WarRoomGraphProjectionStore` has no `focusNodes` method and no pre-existing production adapter exists.
- **Removed Invented Future Schemas (FINDING-4B-003)**: Removed invented priority enum (`LOW/MEDIUM/HIGH/CRITICAL`) and exclusion fields (`packageId`, `excluded`). Modeled explicit schema readiness: 13 `FROZEN` vs 3 `PENDING_DOMAIN_CONTRACT`.
- **Truthful Dependency Chain (FINDING-4B-004)**: `simulate_api_changes` dependency corrected to `WMCP-5 -> WMCP-6 -> WMCP-7` (authoritative execution arrives in WMCP-7).
- **Corrected Tool Distribution**: Exactly **7 EXECUTABLE** tools and **9 DEFERRED** tools across the 16 canonical actions.

---

## 2. Review Chronology & Upstream Pin

- **Repository**: `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch**: `feature/webmcp-challenge-2026`
- **WMCP-4A Closure HEAD**: `e527dd59963ef2b63184d6ed3d4e48b526e9e574`
- **WMCP-4B Initial Commit**: `6588616563b9bc129a9a0f093fc6e271dc03ac62`
- **WMCP-4B-RV Independent Review**: `FAIL` (identified 4 material findings)
- **WMCP-4B-R2 Corrective Commit**: Pending independent re-verification
- **Pinned Upstream Reference**:
  - Repository: `webmachinelearning/webmcp`
  - Branch: `main`
  - Authoritative Commit SHA: `41d12f057167ccf5954dbcf49d99502cb6c84491` (verified unchanged)

---

## 3. Canonical WebMCP Tool Vocabulary (16 Tools)

1. `search_packages`
2. `open_package_graph`
3. `summarize_graph`
4. `calculate_blast_radius`
5. `trace_dependency_path`
6. `focus_graph_nodes`
7. `inspect_selected_package`
8. `simulate_api_changes`
9. `inspect_scenario`
10. `set_scenario_priority`
11. `set_scenario_exclusion`
12. `recalculate_scenario`
13. `generate_migration_plan`
14. `inspect_critical_paths`
15. `inspect_migration_plan`
16. `focus_critical_path`

---

## 4. Corrected Authority & Schema Readiness Matrix

| Tool Name | Authority Classification | Binding Status | Schema Status | Actual Authority / Provider | Future Dependency (if Deferred) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `search_packages` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` | `WarRoomActions.searchPackages` | N/A |
| `open_package_graph` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` | `WarRoomActions.openPackageGraph` | N/A |
| `summarize_graph` | `EXISTING_READ_MODEL` | `EXECUTABLE` | `FROZEN` | `WarRoomState.graph` | N/A |
| `calculate_blast_radius` | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | `FROZEN` | Version-Aware Blast Radius Engine | WMCP-8 (Version-Aware Blast Radius Engine) |
| `trace_dependency_path` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` | `WarRoomActions.traceDependencyPath` | N/A |
| `focus_graph_nodes` | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | `PENDING_DOMAIN_CONTRACT` | Visual Focus Projection Integration | WMCP-12 (Visual Focus Integration) |
| `inspect_selected_package` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` | `WarRoomActions.inspectPackage` | N/A (bound to `selection.package.id`) |
| `simulate_api_changes` | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | `FROZEN` | Counterfactual Breaking Change Analyzer | WMCP-5 -> WMCP-6 -> WMCP-7 |
| `inspect_scenario` | `EXISTING_READ_MODEL` | `EXECUTABLE` | `FROZEN` | `WarRoomState.scenario` | N/A |
| `set_scenario_priority` | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | `PENDING_DOMAIN_CONTRACT` | Human Business Review & Collaboration Layer | WMCP-10 (Human Business Review) |
| `set_scenario_exclusion` | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | `PENDING_DOMAIN_CONTRACT` | Scenario Exclusion Engine | WMCP-7 / WMCP-10 (Scenario Engine) |
| `recalculate_scenario` | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | `FROZEN` | Scenario Analysis Engine | WMCP-7 / WMCP-8 (Scenario Analysis & Exposure) |
| `generate_migration_plan` | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | `FROZEN` | Migration Planning Engine | WMCP-11 (Migration Planning & Synthesis) |
| `inspect_critical_paths` | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | `FROZEN` | Critical Path Analysis Engine | WMCP-10 (Human Business Review Expansion) |
| `inspect_migration_plan` | `EXISTING_READ_MODEL` | `EXECUTABLE` | `FROZEN` | `WarRoomState.plan` (identity ref only) | N/A |
| `focus_critical_path` | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` | `FROZEN` | Critical Path Visual Focus Engine | WMCP-12 (Unified Critical Path Visual Focus) |

---

## 5. Input Schema & Annotations Contract

### Executable Tool Set (7 Tools)
1. `search_packages`: `query` (string 1..120), `ecosystem` (enum), `limit` (int 1..8). `readOnlyHint: true, untrustedContentHint: true`.
2. `open_package_graph`: `rootPackageId` (string 1..256), `depth` (int 1..4). `readOnlyHint: false, untrustedContentHint: true`.
3. `summarize_graph`: `{}` with `additionalProperties: false`. `readOnlyHint: true, untrustedContentHint: true`.
4. `trace_dependency_path`: `sourcePackageId` (string 1..256), `targetPackageId` (string 1..256), `maxDepth` (int 1..6). `readOnlyHint: true, untrustedContentHint: true`.
5. `inspect_selected_package`: `{}` with `additionalProperties: false`. Context-bound to selected package ID. `readOnlyHint: true, untrustedContentHint: true`.
6. `inspect_scenario`: `{}` with `additionalProperties: false`. `readOnlyHint: true, untrustedContentHint: true`.
7. `inspect_migration_plan`: `{}` with `additionalProperties: false`. Returns plan ref metadata (`planId`, `scenarioId`, `sourceReviewId`). `readOnlyHint: true, untrustedContentHint: true`.

### Deferred Tool Set with Frozen Schemas (6 Tools)
8. `calculate_blast_radius`: `packageId` (optional), `targetVersion` (optional).
9. `simulate_api_changes`: `packageId` (optional), `proposedVersion` (required).
10. `recalculate_scenario`: `{}` with `additionalProperties: false`.
11. `generate_migration_plan`: `{}` with `additionalProperties: false`.
12. `inspect_critical_paths`: `{}` with `additionalProperties: false`.
13. `focus_critical_path`: `pathIndex` (optional int 0..10).

### Deferred Tools with Pending Domain Contracts (3 Tools)
14. `focus_graph_nodes`: `PENDING_DOMAIN_CONTRACT` (pending WMCP-12 authoritative projection focus identifiers).
15. `set_scenario_priority`: `PENDING_DOMAIN_CONTRACT` (pending WMCP-10 canonical priority model).
16. `set_scenario_exclusion`: `PENDING_DOMAIN_CONTRACT` (pending WMCP-7 / WMCP-10 canonical exclusion model).

---

## 6. Output & Error Envelope Conventions

- **Character Budget**: All executable tools produce output envelopes strictly respecting the <= 1500 character budget (`MAX_TOTAL_OUTPUT_CHARS`).
- **Canonical Error Codes**: Tool execution failures return standardized domain error codes (`INVALID_INPUT`, `INVALID_STATE`, `STALE_CONTEXT`, `NOT_FOUND`, `UNAVAILABLE`, `CANCELLED`, `INTERNAL_ERROR`).
- **Sanitized Errors**: Error messages are trimmed to <= 240 characters without leaking raw stack traces, internal paths, or backend exceptions.

---

## 7. Architectural Boundary & Non-Duplication Evidence

- WebMCP bridge code acts strictly as an adapter boundary between AI agents and application services.
- WebMCP modules contain **zero** independent implementations of:
  - AST parsing / Babel / Acorn / TypeScript compiler AST traversal
  - SemVer or PEP 440 mathematical constraint evaluation
  - Blast Radius graph calculations
  - Scenario conflict resolution rules
  - Migration plan synthesis
  - Authorization / tenant security logic

---

## 8. Quality & Regression Test Suite

- **New Adaptive Tools Test Suite** (`e2e/war-room-webmcp-adaptive-tools.spec.ts`): **14 / 14 PASS**
- **Unit & Integration Regression (227 tests)**: **227 / 227 PASS**
  - `war-room-webmcp-adaptive-tools.spec.ts`: 14 / 14 PASS
  - `war-room-webmcp-lifecycle.spec.ts`: 22 / 22 PASS
  - `war-room-webmcp-registration.spec.ts`: 40 / 40 PASS
  - `war-room-webmcp-platform.spec.ts`: 42 / 42 PASS
  - `war-room-domain.spec.ts`: 28 / 28 PASS
  - `war-room-actions.spec.ts`: 51 / 51 PASS
  - `war-room-integration.spec.ts`: 30 / 30 PASS
- **Browser E2E Regression (20 tests)**: **20 / 20 PASS**
  - `war-room-webmcp-agent-ui.spec.ts`: 7 / 7 PASS
  - `war-room-human-ui.spec.ts`: 5 / 5 PASS
  - `homepage.spec.ts`: 8 / 8 PASS
- **Total Automated Test Suite**: **247 / 247 PASS**
- **TypeScript**: 0 errors (`npx tsc --noEmit`)
- **ESLint**: 0 errors, 0 warnings (`npm run lint`)
- **Next.js Production Build**: Exit 0 in 6.0s (15/15 static routes compiled)
- **ASCII Scan**: 0 non-ASCII hyphens (U+2013 count = 0, U+2014 count = 0)

---

## 9. File Scope Classification

### Added/Modified Production Modules
- `apps/frontend/src/lib/webmcp/bridge/adaptive-catalog.ts`: Static catalog definitions, strict JSON schemas, annotations, and authority binding classifications with schema readiness.
- `apps/frontend/src/lib/webmcp/bridge/adaptive-validation.ts`: Strict input validators for adaptive tools with frozen schemas.
- `apps/frontend/src/lib/webmcp/bridge/adaptive-tools.ts`: Executable platform tool definition factory for all 7 executable tools, failing closed for 9 deferred capabilities.
- `apps/frontend/src/lib/webmcp/bridge/index.ts`: Re-exports adaptive catalog, validation, and tool modules.

### Test Suite
- `apps/frontend/e2e/war-room-webmcp-adaptive-tools.spec.ts`: 14 comprehensive unit, schema readiness, and factory tests.

### Challenge Documentation
- `docs/challenge/WMCP-4B-ADAPTIVE-TOOL-CATALOG.md`: This authoritative contract document.

---

## 10. Acceptance Gates Matrix (4B-R2-1 to 4B-R2-27)

| Gate ID | Requirement Description | Status |
| :--- | :--- | :--- |
| **4B-R2-1** | Starting HEAD exact `6588616563b9bc129a9a0f093fc6e271dc03ac62` | **PASS** |
| **4B-R2-2** | All four independent findings reproduced | **PASS** |
| **4B-R2-3** | `recalculate_scenario` corrected to `DEFERRED` | **PASS** |
| **4B-R2-4** | `generate_migration_plan` corrected to `DEFERRED` | **PASS** |
| **4B-R2-5** | `focus_graph_nodes` corrected to `DEFERRED` | **PASS** |
| **4B-R2-6** | False visual focus authority removed | **PASS** |
| **4B-R2-7** | Priority enum invention removed | **PASS** |
| **4B-R2-8** | Exclusion schema invention removed | **PASS** |
| **4B-R2-9** | Schema readiness explicitly modeled (`FROZEN` vs `PENDING_DOMAIN_CONTRACT`) | **PASS** |
| **4B-R2-10** | Pending schema cannot produce executable tool definition | **PASS** |
| **4B-R2-11** | Seven executable tools exactly identified | **PASS** |
| **4B-R2-12** | Nine deferred tools exactly identified | **PASS** |
| **4B-R2-13** | `inspect_scenario` preserved executable | **PASS** |
| **4B-R2-14** | `inspect_migration_plan` preserved as truthful limited read model | **PASS** |
| **4B-R2-15** | `simulate_api_changes` dependency corrected through WMCP-7 | **PASS** |
| **4B-R2-16** | No future deterministic capability implemented | **PASS** |
| **4B-R2-17** | No new domain semantics invented | **PASS** |
| **4B-R2-18** | Primitive WMCP-3B contracts preserved | **PASS** |
| **4B-R2-19** | WMCP-4A lifecycle untouched | **PASS** |
| **4B-R2-20** | Closed WarRoom layers untouched | **PASS** |
| **4B-R2-21** | Focused tests PASS (14/14) | **PASS** |
| **4B-R2-22** | Full relevant regression PASS (247/247) | **PASS** |
| **4B-R2-23** | TypeScript/lint/build PASS | **PASS** |
| **4B-R2-24** | Upstream pin unchanged (`41d12f057167ccf5954dbcf49d99502cb6c84491`) | **PASS** |
| **4B-R2-25** | Documentation chronology truthful | **PASS** |
| **4B-R2-26** | User files untouched (`AGENTS.md`, `CLAUDE.md`) | **PASS** |
| **4B-R2-27** | ASCII requirements PASS (0 non-ASCII dashes) | **PASS** |

---

## 11. Final Status

**IMPLEMENTED - PENDING INDEPENDENT RE-VERIFICATION (WMCP-4B-R2-RV)**
