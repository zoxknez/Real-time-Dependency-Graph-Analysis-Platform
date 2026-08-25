# Pre-Existing Platform Capabilities Matrix

This matrix classifies the baseline capabilities present in the repository at commit `864a3d6905826bd0fabab02cf02785ab0c702842`.

Status definitions: `IMPLEMENTED`, `PARTIAL`, `STUB_OR_DEMO`, `UNVERIFIED`, `NOT_IMPLEMENTED`.

Verification semantics:
- `UNIT-TEST VERIFIED`: Isolated deterministic logic was directly exercised by executed unit tests.
- `INTEGRATION-TEST VERIFIED`: Subsystem / service boundary integration was directly exercised by integration test suites without external live infrastructure.
- `BUILD VERIFIED / NOT RUNTIME VERIFIED`: Production build/compilation succeeded, but interactive browser/live behavior was not exercised.
- `STATICALLY VERIFIED`: Complete implementation exists and was verified from source inspection.
- `STATICALLY VERIFIED / NOT RUNTIME VERIFIED`: Source implementation exists, but external service/live runtime integration was not exercised.
- `NOT RUNTIME VERIFIED`: Not exercised during baseline verification runs.
- `UNVERIFIED`: Source or runtime behavior could not be confirmed.

---

| Area | Capability | Status | Evidence | Runtime verified | Notes |
|---|---|---|---|---|---|
| Ingestion | crates.io Sparse Index Ingestion | IMPLEMENTED | `apps/ingestion/src/registries/crates/` | UNIT-TEST VERIFIED | Unit tests exercise index path, sparse URL parsing, diffing, and index entry parsing. |
| Ingestion | PyPI Registry Ingestion | IMPLEMENTED | `apps/ingestion/src/registries/pypi/` | UNIT-TEST VERIFIED | Unit tests exercise PEP 508 parsing, changelog parsing, and diff state. |
| Ingestion | npm Changes Ingestion | IMPLEMENTED | `apps/ingestion/src/registries/npm/` | STATICALLY VERIFIED / NOT RUNTIME VERIFIED | Implementation connects to CouchDB replication stream (`_changes`); live npm connection was not exercised. |
| Graph Storage | Version-Level Dependency Graph | IMPLEMENTED | `apps/graph-writer/src/graph/batch.rs`, `packages/storage/src/memgraph.rs` | UNIT-TEST VERIFIED | Unit tests verify Cypher query building for `(v:Version)-[:DEPENDS_ON {version_req}]->(p:Package)`. |
| Graph Storage | Package-Level Projection Graph | IMPLEMENTED | `apps/graph-writer/src/graph/batch.rs`, `infra/memgraph/backfill_depends_on_pkg.cypher` | UNIT-TEST VERIFIED | Query builder creates `(p1:Package)-[:DEPENDS_ON_PKG]->(p2:Package)` projection without version constraints. |
| Graph Storage | Version Requirements Parsing | IMPLEMENTED | `apps/ingestion/src/registries/crates/worker.rs:219`, `apps/ingestion/src/registries/pypi/fetcher.rs:215` | UNIT-TEST VERIFIED | Parses SemVer/PEP 508 constraints during ingestion and persists `version_req` onto `DEPENDS_ON`. |
| Graph Storage | Reverse Dependents Traversal | IMPLEMENTED | `apps/api/src/graph/queries.rs:188` (`MATCH (p:Package)<-[:DEPENDS_ON_PKG]-(dep:Package)`) | STATICALLY VERIFIED | Parameterized Cypher query retrieves direct reverse dependent packages. |
| Graph Storage | Transitive Reverse Dependents | IMPLEMENTED | `apps/api/src/graph/queries.rs:210` (`<-[:DEPENDS_ON_PKG*1..{depth}]-`) | STATICALLY VERIFIED | Parameterized Cypher query traverses transitive reverse graph up to configurable depth. |
| Graph Storage | Shortest Dependency Path | IMPLEMENTED | `apps/api/src/graph/queries.rs:280` (`shortestPath((a)-[:DEPENDS_ON_PKG*1..10]->(b))`) | STATICALLY VERIFIED | Finds shortest path between two packages via Cypher shortestPath algorithm. |
| Graph Storage | Impact Radius Calculation | PARTIAL | `apps/api/src/graph/queries.rs:320`, `apps/api/src/gql/query.rs:272` | STATICALLY VERIFIED | Computes topological reachability but does not evaluate version constraint satisfaction or semantic breaking changes. |
| AST Analysis | Multi-Language Parser | IMPLEMENTED | `apps/analysis/src/ast_parser.rs` | UNIT-TEST VERIFIED | Tree-sitter parsers for Rust, JS, TS, Python, Go, and Java. Tests exercise symbol, visibility, and signature extraction. |
| AST Analysis | Breaking Change Detection | IMPLEMENTED | `apps/analysis/src/breaking_detector.rs` | STATICALLY VERIFIED | Compares `PublicApiSnapshot` instances to detect removed symbols, parameter changes, and visibility drops. |
| AST Analysis | Snapshot Persistence | PARTIAL | `apps/analysis/src/main.rs:740` (`snapshot_base_dir`) | STATICALLY VERIFIED | Persisted to a filesystem-local directory (configured via `ANALYSIS_SNAPSHOT_DIR`, defaulting to OS temp directory). No shared durable repository. |
| Vector Search | Semantic Embedding Generation | PARTIAL | `apps/analysis/src/embeddings.rs`, `apps/analysis/src/onnx_model.rs` | STATICALLY VERIFIED | Uses heuristic fallbacks or ONNX runtime model when local model file is present. |
| Vector Search | Qdrant Vector Search | IMPLEMENTED | `packages/storage/src/qdrant.rs`, `apps/api/src/services/mod.rs` | UNIT-TEST VERIFIED | Unit tests verify point building and configuration; indexes package vectors for semantic search. |
| GraphQL Gateway | Package & Version Queries | IMPLEMENTED | `apps/api/src/gql/query.rs` | STATICALLY VERIFIED | Resolves package details, versions, licenses, and maintainers against graph context. |
| GraphQL Gateway | WebSocket Subscriptions | PARTIAL | `apps/api/src/gql/subscription.rs`, `apps/frontend/src/app/graph/page.tsx:128` | STATICALLY VERIFIED | Backend broadcasts version events; frontend receives updates but logs them without mutating or refetching graph state. |
| Security Intelligence | Live OSV Vulnerability Lookup | IMPLEMENTED | `apps/api/src/services/osv.rs`, `apps/api/src/gql/query.rs:1116` | STATICALLY VERIFIED / NOT RUNTIME VERIFIED | Implementation queries OSV REST API (`https://api.osv.dev/v1/query`) for CVE and GHSA records. |
| Security Intelligence | CVSS Score Enrichment | STUB_OR_DEMO | `apps/api/src/gql/query.rs:1173` | STATICALLY VERIFIED | Hard-coded to `cvss_score: 0.0`. |
| Security Intelligence | EPSS Score & KEV Enrichment | STUB_OR_DEMO | `apps/api/src/gql/query.rs:1174-1175` | STATICALLY VERIFIED | Hard-coded to `epss_score: None, in_kev: false`. |
| Security Intelligence | Public Exploit Availability | STUB_OR_DEMO | `apps/api/src/gql/query.rs:1176` | STATICALLY VERIFIED | Hard-coded to `has_public_exploit: false`. |
| Security Intelligence | Vulnerability Reachability | STUB_OR_DEMO | `apps/api/src/gql/query.rs:1180-1187` | STATICALLY VERIFIED | Hard-coded to `ReachabilityStatus::NoRule` with confidence `0.0`. |
| Security Intelligence | Vulnerability Risk Score | PARTIAL | `apps/api/src/gql/query.rs:1132`, `packages/models/src/vulnerability.rs` | UNIT-TEST VERIFIED | Unit tests verify heuristic model calculation based on severity label without EPSS/KEV/reachability inputs. |
| Compliance | OpenSSF Scorecard GraphQL Resolver | STUB_OR_DEMO | `apps/api/src/gql/query.rs:1444-1534` | STATICALLY VERIFIED | Returns hard-coded check results (`"2 known vulnerabilities found"`, `"30 commits in last 90 days"`). |
| Compliance | OpenSSF Scorecard Client Library | IMPLEMENTED | `packages/models/src/scorecard.rs`, `apps/api/src/services/scorecard.rs` | STATICALLY VERIFIED / NOT RUNTIME VERIFIED | Complete HTTP client against `api.securityscorecards.dev` exists in source; bypassed by GraphQL query resolver. |
| Compliance | SBOM Generation (SPDX 2.3 & CycloneDX 1.5) | IMPLEMENTED | `packages/models/src/sbom.rs`, `apps/api/src/gql/query.rs:1255` | UNIT-TEST VERIFIED | Unit tests verify generation of SPDX 2.3 and CycloneDX 1.5 JSON payloads with legacy `randomapp` tool naming. |
| Compliance | VEX Documents & Policies | IMPLEMENTED | `packages/models/src/vex.rs`, `packages/models/src/policy.rs` | UNIT-TEST VERIFIED | Unit tests verify OpenVEX document serialization and enterprise policy rules. |
| AI Operations | Gemini 3 Autonomous Security Agent | IMPLEMENTED | `apps/api/src/services/gemini_agent.rs` | STATICALLY VERIFIED | Multi-step agent implementation using Gemini 3 function calling with tools for graph search, impact, and vulnerabilities. |
| AI Operations | Gemini Dependency Q&A (`/ask`) | IMPLEMENTED | `apps/api/src/services/gemini.rs`, `apps/frontend/src/app/ask/page.tsx` | STATICALLY VERIFIED | Natural language Q&A about package dependencies and security risks. |
| AI Operations | Gemini Live Voice Token Proxy | STUB_OR_DEMO | `apps/api/src/handlers.rs` (`live_token_handler`) | STATICALLY VERIFIED | Demo helper returning a pre-generated token from `GEMINI_LIVE_EPHEMERAL_TOKEN`; does not negotiate dynamic credentials. |
| Frontend | 2D Dependency Graph | IMPLEMENTED | `apps/frontend/src/components/graph/` | BUILD VERIFIED / NOT RUNTIME VERIFIED | Next.js production build succeeded; D3 / Canvas 2D force graph component. |
| Frontend | 3D Dependency Graph | IMPLEMENTED | `apps/frontend/src/app/graph/page.tsx` | BUILD VERIFIED / NOT RUNTIME VERIFIED | Next.js production build succeeded; Three.js / `react-force-graph-3d` visualization with camera controls. |
| Frontend | Node Inspection & Tooltips | IMPLEMENTED | `apps/frontend/src/components/graph/node-tooltip.tsx` | BUILD VERIFIED / NOT RUNTIME VERIFIED | Next.js production build succeeded; node hover and selection tooltip state. |
| Frontend | Dependency Path Explorer | IMPLEMENTED | `apps/frontend/src/app/path/page.tsx` | BUILD VERIFIED / NOT RUNTIME VERIFIED | Next.js production build succeeded; path tracing visualization. |
| Frontend | Supply Chain & Security Dashboards | IMPLEMENTED | `apps/frontend/src/app/security/page.tsx`, `apps/frontend/src/app/supply-chain/page.tsx` | BUILD VERIFIED / NOT RUNTIME VERIFIED | Next.js production build succeeded; vulnerability lists, risk tiers, and package cards. |
| Testing | Rust Unit Tests | IMPLEMENTED | `tests/`, `packages/*/src/`, `apps/*/src/` | UNIT-TEST VERIFIED | 114 unit and binary tests passed across 8 workspace crates. |
| Testing | Rust API Integration Tests | IMPLEMENTED | `tests/tests/api.rs` | INTEGRATION-TEST VERIFIED | 10 integration tests passed for GraphQL introspection, health, security headers, rate limits, impact radius. |
| Testing | Rust E2E Docker Tests | IMPLEMENTED | `tests/tests/e2e.rs` | NOT RUNTIME VERIFIED | 6 integration tests configured with testcontainers; skipped when Docker daemon is not connected. |
| Testing | Frontend Unit / E2E Tests | PARTIAL | `apps/frontend/e2e/`, `apps/frontend/playwright.config.ts` | NOT RUNTIME VERIFIED | Playwright E2E configuration exists; execution blocked without running backend services. |
| Testing | Accessibility Testing | PARTIAL | `apps/frontend/package.json` (`@axe-core/playwright`) | NOT RUNTIME VERIFIED | Configured via Playwright Axe helper; blocked along with Playwright suite. |
| Infrastructure | Multi-Tenancy & Authorization | IMPLEMENTED | `packages/models/src/tenant.rs`, `apps/api/src/gql/mod.rs` | UNIT-TEST VERIFIED | Unit tests verify permissions and rate tiers; tenant filtering (`tenant_id`) enforced in API. |
| Infrastructure | Observability & Metrics | IMPLEMENTED | `packages/metrics/src/lib.rs`, `packages/tracing/src/lib.rs`, `observability/` | UNIT-TEST VERIFIED | Unit tests verify timing guards and tracing config; Prometheus endpoints and dashboard definitions present. |
| Infrastructure | Security Headers & CORS | IMPLEMENTED | `apps/api/src/main.rs`, `apps/frontend/next.config.js` | STATICALLY VERIFIED | Standard CORS and Next.js security headers configured; modern WebMCP isolation headers absent. |
| CI / Automation | GitHub Actions Workflows | PARTIAL | `.github/workflows/ci.yml` | STATICALLY VERIFIED | CI workflow contains fail-open gates (`continue-on-error: true` on lint/audit/deny, `|| true` on Playwright). |
