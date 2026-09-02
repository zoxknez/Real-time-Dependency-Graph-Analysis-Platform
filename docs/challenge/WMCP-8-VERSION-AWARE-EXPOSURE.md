# WMCP-8: Version-Aware Dependency Exposure & Blast Radius Analysis

## 1. Executive Summary

### Final closure amendment

The final submission no longer exposes or reports `topologicalReachabilityCount` through the WMCP-8 War Room result. Final application/UI truth is direct dependency exposure only: direct dependents are classified as `DECLARED_RANGE_EXPOSED`, `DECLARED_RANGE_BLOCKED`, or typed `UNKNOWN_*` states. `directDependentsTotal` is not inferred or presented as transitive compatibility or topological reachability. Historical phase text below that describes a separately preserved topology count refers to the earlier WMCP-8 implementation and was narrowed during final closure at `d74fe501699c765efddef720848274e8b0707c35`.

WMCP-8 establishes deterministic, multi-ecosystem, version-aware dependency exposure evaluation across the War Room platform. Prior to WMCP-8, graph queries reported purely topological reachability (all reverse dependents traversed without version evaluation), and the `calculate_blast_radius` WebMCP tool was factory-deferred.

WMCP-8 implements:
1. Deterministic version constraint parsing and evaluation across `NPM` (SemVer 2.0), `CARGO` (Cargo SemVer with bare version caret semantics), and `PY_PI` (PEP 440 comparison, compatible release, and prefix rules).
2. Domain version exposure evaluator (`evaluateVersionAwareExposure`) classifying direct dependents into `DECLARED_RANGE_EXPOSED`, `DECLARED_RANGE_BLOCKED`, or typed `UNKNOWN_*` states.
3. Historical WMCP-8 phase snapshot: strict separation between **direct constraint exposure** and the earlier **topological reachability count**.
4. Shared read-only application action (`WarRoomActions.calculateBlastRadius`) providing identical authority to Human and Agent callers without mutating canonical state or incrementing context revisions.
5. WebMCP promotion of `calculate_blast_radius` to `EXECUTABLE` with strict JSON schema, `STRICT_CONTEXT_READ` execution policy, and bounded output ($\le 1500$ UTF-16 code units, top 5 exposed dependents).

---

## 2. End-to-End Dataflow & Authority Inventory

```
+-------------------------------------------------------------------------------+
| Manifest Sources: package.json, Cargo.toml, requirements.txt                  |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Ingestion & Storage: apps/syncer preserves dep.version_constraint on          |
| Memgraph DEPENDS_ON edge: r.version_constraint                                |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Query & Projection: GraphQL reverseDependents query projects rawRequirement   |
| or WarRoom actions query direct dependents from graph context                 |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Application Authority: WarRoomActions.calculateBlastRadius                    |
| - Validates proposedVersion (explicitly provided, non-empty, <= 128 chars)     |
| - Enforces context-owned target package (no client overrides allowed)         |
| - Read-only: changed = false, contextRevision preserved                       |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Domain Calculation Engines (src/lib/war-room/domain/):                        |
| - VersionConstraintEngine: NPM (semver), CARGO, PEP440 (PEP 440 clauses)      |
| - VersionAwareExposureEngine: evaluateVersionAwareExposure                     |
|   * Classifies direct dependents only (no transitive constraint claims)       |
|   * Distinguishes exposed range from confirmed downstream breakage            |
|   * Earlier phase preserved topological reachability count separately          |
|   * Deterministic sorting: package ID ascending, then requirement             |
|   * Output bounding & truncation flags                                        |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| WebMCP Layer (src/lib/webmcp/bridge/):                                        |
| - calculate_blast_radius promoted to EXECUTABLE (10 executable, 6 deferred)   |
| - STRICT_CONTEXT_READ execution guard policy                                  |
| - Strict input schema: { proposedVersion } only (additionalProperties: false) |
| - Budgeted output: <= 1500 UTF-16 code units, max 5 exposed dependents,       |
|   surrogate-safe UTF-16 truncation                                            |
+-------------------------------------------------------------------------------+
```

---

## 3. Dialect Semantics

### NPM SemVer
- Powered by `semver` engine with `includePrerelease: true`.
- Standard SemVer ranges: `^1.2.0`, `~1.2.0`, `>=1.0.0 <2.0.0`, exact matches `1.2.3`.

### Cargo SemVer
- Bare version numbers follow Cargo specification: `1.2.3` expands to `^1.2.3` (caret matching up to next major, or minor for 0.x).
- Wildcards (`1.*`, `*`), tildes (`~1.2`), and comma-separated clauses (`>=1.0, <2.0`).

### PEP 440
- Operators: `==`, `!=`, `<=`, `>=`, `<`, `>`, `~=`, `===`.
- Compatible release clauses: `~= 1.4.2` expands to `>= 1.4.2, == 1.4.*`.
- Wildcard prefix matches: `== 1.4.*`, `!= 1.4.*`.
- Pre-releases (`a`, `b`, `rc`), post-releases (`.postN`), and dev releases (`.devN`).

### Fail-Closed Typing
- Missing requirement $\rightarrow$ `UNKNOWN_MISSING_REQUIREMENT`. Never synthesized from package version.
- Unsupported ecosystem $\rightarrow$ `UNSUPPORTED_ECOSYSTEM`.
- Syntax error in requirement $\rightarrow$ `INVALID_REQUIREMENT`.
- Syntax error in proposed version $\rightarrow$ `INVALID_VERSION`.

---

## 4. WebMCP Tool Catalog Status

Following the promotion of `calculate_blast_radius`, the canonical 16-tool catalog consists of:

### Executable Tools (10)
1. `search_packages` (REVISION_TOLERANT_READ)
2. `open_package_graph` (ACTION_COMMIT_GUARDED_MUTATION)
3. `summarize_graph` (STRICT_CONTEXT_READ)
4. `calculate_blast_radius` (STRICT_CONTEXT_READ) -- **Promoted in WMCP-8**
5. `trace_dependency_path` (REVISION_TOLERANT_READ)
6. `inspect_selected_package` (STRICT_CONTEXT_READ)
7. `simulate_api_changes` (ACTION_COMMIT_GUARDED_MUTATION)
8. `inspect_scenario` (STRICT_CONTEXT_READ)
9. `recalculate_scenario` (ACTION_COMMIT_GUARDED_MUTATION)
10. `inspect_migration_plan` (STRICT_CONTEXT_READ)

### Deferred Tools (6)
1. `focus_graph_nodes` (WMCP-9)
2. `set_scenario_priority` (WMCP-10)
3. `set_scenario_exclusion` (WMCP-10)
4. `generate_migration_plan` (WMCP-11)
5. `inspect_critical_paths` (WMCP-10)
6. `focus_critical_path` (WMCP-12)

---

## 5. Verification Evidence

- `e2e/war-room-webmcp-blast-radius.spec.ts`: 42/42 PASS (covering 8-T1 through 8-T35)
- `npm run test:e2e`: 796/796 PASS across all browser suites (0 failures)
- `npm run build`: Next.js production build succeeded with 0 errors
- `cargo test --workspace --lib --bins`: 100% PASS (0 failures)
- `cargo check --workspace --all-targets`: PASS (code 0)
- `cargo fmt --all -- --check`: PASS (code 0)
- `cargo clippy --workspace --all-targets -- -D warnings`: PASS (code 0, 0 warnings)
