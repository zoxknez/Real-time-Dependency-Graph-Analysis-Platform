# WMCP-9: Live Package Evidence & Deterministic Graph Focus

## 1. Overview & Architectural Boundaries

WMCP-9 extends the War Room platform with two distinct, deterministic capabilities:
1. **Source-Backed Live Package Evidence:** Queries public vulnerability advisories from the open OSV service (`api.osv.dev`) server-side, providing factual CVE/GHSA intelligence without fabricating artificial risk scores or synthetic probability metrics.
2. **Deterministic Visual Graph Focus (`focus_graph_nodes`):** Promotes `focus_graph_nodes` to an `EXECUTABLE` WebMCP tool, delegating to the shared application action `WarRoomActions.focusGraphNodes` to focus and highlight loaded nodes in the UI visual projection.

### Strict Authority Boundaries
- **Orthogonality to Breaking Analysis:** Security evidence is purely factual external intelligence. It **never** influences counterfactual scenario analysis, breaking change classifications, candidate surface hashes, or version constraint evaluations.
- **Visual Focus is Analytical Read-Only:** `focus_graph_nodes` mutates only the visual projection state (`focusedPackageIds`). It does not alter graph connectivity, package versions, scenario definitions, or review annotations.
- **No SSRF / Strict Same-Origin:** The external OSV provider URL is hard-coded to trusted server configuration (`https://api.osv.dev`). WebMCP, browser clients, and scenario payloads cannot supply arbitrary query endpoints.

---

## 2. Package Evidence Authority & Ecosystem Mapping

### 2.1 Coordinate Authority vs Snapshot Revision
- **Ecosystem Package Coordinate:** Vulnerability lookups require package coordinates defined by:
  - `ecosystem`: Canonical package ecosystem (`NPM`, `PY_PI`, `CARGO`).
  - `packageName`: Real package name (e.g. `express`, `requests`).
  - `packageVersion`: Concrete ecosystem version string (e.g. `4.18.2`).
- **Authority Distinction:**
  - **WMCP Snapshot Revision:** An internal database revision hash representing a point-in-time API surface.
  - **Ecosystem Package Version:** The authoritative upstream package version used for security advisory matching.
  - Snapshot revisions and base versions are **never** used as ecosystem package versions.
  - If a package version is missing, the coordinate is classified as `INVALID_COORDINATE` and no speculative lookup is made.

### 2.2 Ecosystem Mapping
| War Room Ecosystem | OSV Ecosystem Identifier | Status |
| :--- | :--- | :--- |
| `NPM` | `npm` | Supported |
| `PY_PI` | `PyPI` | Supported |
| `CARGO` | `crates.io` | Supported |
| Other / Unknown | N/A | `UNSUPPORTED_ECOSYSTEM` (Fails closed, 0 network calls) |

### 2.3 Status Model: No Results vs Unavailable
- **`AVAILABLE`:** Provider returned 1 or more factual vulnerability advisories.
- **`NO_KNOWN_ADVISORIES`:** Provider returned an HTTP 200 with an empty advisories list (`vulns: []`).
- **`UNAVAILABLE`:** Network error, HTTP 5xx, or provider timeout.
- **`UNSUPPORTED_ECOSYSTEM`:** The ecosystem is not supported by the provider.
- **`INVALID_COORDINATE`:** Package name or version was missing or malformed.

### 2.4 Caching, Timeouts, and Result Bounds
- **Timeout:** 5,000ms default timeout enforced via `AbortController`.
- **In-Memory Cache:** 10-minute TTL per coordinate (`OSV:<ecosystem>:<name>:<version>`).
- **Result Bounding:** Maximum 20 advisories returned. Truncation is truthfully reported via `advisoriesTotal`, `advisoriesReturned`, and `truncated: boolean`.
- **Deterministic Sorting:** Advisories are sorted lexicographically ascending by `id` (e.g., `GHSA-...`).
- **Zero Fabricated Risk Scores:** No synthetic CVSS scores, probability metrics, or exploitability estimations are generated.

---

## 3. Visual Graph Focus (`focus_graph_nodes`)

### 3.1 Application Action Authority
- **Authority:** `WarRoomActions.focusGraphNodes`.
- **State Transition:** Dispatches canonical event `VISUAL_FOCUS_CHANGED` to update `state.visualEvidence.focusedPackageIds`.
- **Lifecycle Phases:** Available across all graph-bearing phases: `GRAPH_READY`, `NODE_SELECTED`, `SIMULATION_READY`, `HUMAN_REVIEW`, `PLAN_READY`.
- **Channel Convergence:** Human UI and AGENT WebMCP tool call the identical application action.

### 3.2 Strict Validation & Boundary Guards
- **Input Schema:** `{ nodeIds: string[] }` (minItems: 1, maxItems: 20, `additionalProperties: false`).
- **Graph Existence Check:** Every requested node ID must exist in `state.graph.packageIds`. Unknown node IDs fail immediately with `INVALID_INPUT` without mutating state.

---

## 4. WebMCP Canonical Tool Matrix (Post WMCP-9)

| Tool Name | Authority | Classification | Binding Status | Schema Status |
| :--- | :--- | :--- | :--- | :--- |
| `search_packages` | `WarRoomActions.searchPackages` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `open_package_graph` | `WarRoomActions.openPackageGraph` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `summarize_graph` | `WarRoomState.graph` | `EXISTING_READ_MODEL` | `EXECUTABLE` | `FROZEN` |
| `calculate_blast_radius` | `WarRoomActions.calculateBlastRadius` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `trace_dependency_path` | `WarRoomActions.traceDependencyPath` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| **`focus_graph_nodes`** | **`WarRoomActions.focusGraphNodes`** | **`EXISTING_ACTION`** | **`EXECUTABLE` (WMCP-9)** | **`FROZEN`** |
| `inspect_selected_package` | `WarRoomState.selection` / `WarRoomActions.inspectPackage` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `simulate_api_changes` | `WarRoomActions.createScenario -> recalculate` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `inspect_scenario` | `WarRoomState.scenario` | `EXISTING_READ_MODEL` | `EXECUTABLE` | `FROZEN` |
| `recalculate_scenario` | `WarRoomActions.recalculateScenario` | `EXISTING_ACTION` | `EXECUTABLE` | `FROZEN` |
| `inspect_migration_plan` | `WarRoomState.plan` | `EXISTING_READ_MODEL` | `EXECUTABLE` | `FROZEN` |
| `set_scenario_priority` | Scenario Priority Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` (WMCP-10) | `PENDING_DOMAIN_CONTRACT` |
| `set_scenario_exclusion` | Scenario Exclusion Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` (WMCP-10) | `PENDING_DOMAIN_CONTRACT` |
| `generate_migration_plan` | Migration Planning Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` (WMCP-11) | `FROZEN` |
| `inspect_critical_paths` | Critical Path Analysis Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` (WMCP-10) | `FROZEN` |
| `focus_critical_path` | Critical Path Visual Focus Engine | `FUTURE_DETERMINISTIC_CAPABILITY` | `DEFERRED` (WMCP-12) | `FROZEN` |

- **Total Tools:** 16
- **Executable Tools:** 11
- **Deferred Tools:** 5
