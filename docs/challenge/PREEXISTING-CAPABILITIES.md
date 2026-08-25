# Pre-Existing Platform Capabilities Matrix

This matrix classifies the baseline capabilities present in the repository at commit `864a3d6905826bd0fabab02cf02785ab0c702842`.

Status definitions: `IMPLEMENTED`, `PARTIAL`, `STUB_OR_DEMO`, `UNVERIFIED`, `NOT_IMPLEMENTED`.

---

| Area | Capability | Status | Evidence | Runtime verified | Notes |
|---|---|---|---|---|---|
| Ingestion | crates.io Sparse Index Ingestion | IMPLEMENTED | `apps/ingestion/src/registries/crates/` | RUNTIME VERIFIED (unit tests) | Polls crates.io sparse index HTTP endpoints and emits version metadata events. |
| Ingestion | PyPI Registry Ingestion | IMPLEMENTED | `apps/ingestion/src/registries/pypi/` | RUNTIME VERIFIED (unit tests) | Uses PyPI changelog and PEP 508 parsing. |
| Ingestion | npm Changes Ingestion | IMPLEMENTED | `apps/ingestion/src/registries/npm/` | UNVERIFIED | Connects to CouchDB replication stream (`_changes`). |
| Graph Storage | Version-Level Dependency Graph | IMPLEMENTED | `apps/graph-writer/src/graph/batch.rs`, `packages/storage/src/memgraph.rs` | RUNTIME VERIFIED (unit tests) | Creates `(v:Version)-[:DEPENDS_ON {version_req}]->(p:Package)` in Memgraph. |
| Graph Storage | Package-Level Projection Graph | IMPLEMENTED | `apps/graph-writer/src/graph/batch.rs`, `infra/memgraph/backfill_depends_on_pkg.cypher` | RUNTIME VERIFIED (unit tests) | Creates `(p1:Package)-[:DEPENDS_ON_PKG]->(p2:Package)` without version constraints. |
| Graph Storage | Version Requirements Parsing | IMPLEMENTED | `apps/ingestion/src/registries/crates/worker.rs:219`, `apps/ingestion/src/registries/pypi/fetcher.rs:215` | RUNTIME VERIFIED (unit tests) | Parses version ranges during ingestion and writes `version_req` onto `DEPENDS_ON`. |
| Graph Storage | Reverse Dependents Traversal | IMPLEMENTED | `apps/api/src/graph/queries.rs:188` (`MATCH (p:Package)<-[:DEPENDS_ON_PKG]-(dep:Package)`) | STATICALLY VERIFIED | Cypher query retrieves direct reverse dependent packages. |
| Graph Storage | Transitive Reverse Dependents | IMPLEMENTED | `apps/api/src/graph/queries.rs:210` (`<-[:DEPENDS_ON_PKG*1..{depth}]-`) | STATICALLY VERIFIED | Traverses transitive graph up to configurable depth. |
| Graph Storage | Shortest Dependency Path | IMPLEMENTED | `apps/api/src/graph/queries.rs:280` (`shortestPath((a)-[:DEPENDS_ON_PKG*1..10]->(b))`) | STATICALLY VERIFIED | Finds shortest path between two packages. |
| Graph Storage | Impact Radius Calculation | PARTIAL | `apps/api/src/graph/queries.rs:320`, `apps/api/src/gql/query.rs:272` | STATICALLY VERIFIED | Computes topological node reachability but does not evaluate version constraint satisfaction or semantic breaking changes. |
| AST Analysis | Multi-Language Parser | IMPLEMENTED | `apps/analysis/src/ast_parser.rs` | RUNTIME VERIFIED (unit tests) | Tree-sitter parsers for Rust, JS, TS, Python, Go, and Java. Extracts symbols, visibility, and signatures. |
| AST Analysis | Breaking Change Detection | IMPLEMENTED | `apps/analysis/src/breaking_detector.rs` | RUNTIME VERIFIED (unit tests) | Compares `PublicApiSnapshot` instances to detect removed symbols, parameter changes, and visibility drops. |
| AST Analysis | Snapshot Persistence | PARTIAL | `apps/analysis/src/main.rs:740` (`snapshot_base_dir`) | STATICALLY VERIFIED | Stores snapshots in local temporary directory (`std::env::temp_dir().join("randomapp-snapshots")`). Not durable or shared across nodes. |
| Vector Search | Semantic Embedding Generation | PARTIAL | `apps/analysis/src/embeddings.rs`, `apps/analysis/src/onnx_model.rs` | RUNTIME VERIFIED (unit tests) | Uses heuristic fallbacks or ONNX runtime model when model file is present. |
| Vector Search | Qdrant Vector Search | IMPLEMENTED | `packages/storage/src/qdrant.rs`, `apps/api/src/services/mod.rs` | RUNTIME VERIFIED (unit tests) | Indexes package vectors and supports payload filtering by ecosystem. |
| GraphQL Gateway | Package & Version Queries | IMPLEMENTED | `apps/api/src/gql/query.rs` | STATICALLY VERIFIED | Resolves package details, versions, licenses, and maintainers. |
| GraphQL Gateway | WebSocket Subscriptions | PARTIAL | `apps/api/src/gql/subscription.rs`, `apps/frontend/src/app/graph/page.tsx:128` | STATICALLY VERIFIED | Backend emits events via broadcast channels; frontend receives updates but logs them without mutating graph state. |
| Security Intelligence | Live OSV Vulnerability Lookup | IMPLEMENTED | `apps/api/src/services/osv.rs`, `apps/api/src/gql/query.rs:1116` | STATICALLY VERIFIED | Queries OSV REST API (`https://api.osv.dev/v1/query`) for CVE and GHSA records. |
| Security Intelligence | CVSS Score Enrichment | STUB_OR_DEMO | `apps/api/src/gql/query.rs:1173` | STATICALLY VERIFIED | Hard-coded to `cvss_score: 0.0`. |
| Security Intelligence | EPSS Score & KEV Enrichment | STUB_OR_DEMO | `apps/api/src/gql/query.rs:1174-1175` | STATICALLY VERIFIED | Hard-coded to `epss_score: None, in_kev: false`. |
| Security Intelligence | Public Exploit Availability | STUB_OR_DEMO | `apps/api/src/gql/query.rs:1176` | STATICALLY VERIFIED | Hard-coded to `has_public_exploit: false`. |
| Security Intelligence | Vulnerability Reachability | STUB_OR_DEMO | `apps/api/src/gql/query.rs:1180-1187` | STATICALLY VERIFIED | Hard-coded to `ReachabilityStatus::NoRule` with confidence `0.0`. |
| Security Intelligence | Vulnerability Risk Score | PARTIAL | `apps/api/src/gql/query.rs:1132`, `packages/models/src/vulnerability.rs` | RUNTIME VERIFIED (unit tests) | Static heuristic calculation based on severity label without EPSS/KEV/reachability inputs. |
| Compliance | OpenSSF Scorecard GraphQL Resolver | STUB_OR_DEMO | `apps/api/src/gql/query.rs:1444-1534` | STATICALLY VERIFIED | Returns hard-coded check results (`"2 known vulnerabilities found"`, `"30 commits in last 90 days"`). |
| Compliance | OpenSSF Scorecard Client Library | IMPLEMENTED | `packages/models/src/scorecard.rs`, `apps/api/src/services/scorecard.rs` | RUNTIME VERIFIED (unit tests) | Separate client and model exist, but are bypassed by the primary GraphQL query resolver. |
| Compliance | SBOM Generation (SPDX 2.3 & CycloneDX 1.5) | IMPLEMENTED | `packages/models/src/sbom.rs`, `apps/api/src/gql/query.rs:1255` | RUNTIME VERIFIED (unit tests) | Generates valid SPDX 2.3 and CycloneDX 1.5 JSON payloads using legacy `randomapp` tool names. |
| Compliance | VEX Documents & Policies | IMPLEMENTED | `packages/models/src/vex.rs`, `packages/models/src/policy.rs` | RUNTIME VERIFIED (unit tests) | OpenVEX document structures and enterprise policy evaluation engine. |
| AI Operations | Gemini 3 Autonomous Security Agent | IMPLEMENTED | `apps/api/src/services/gemini_agent.rs` | STATICALLY VERIFIED | Multi-step agent with function calling (tool definitions for graph search, impact, vulnerabilities). |
| AI Operations | Gemini Dependency Q&A (`/ask`) | IMPLEMENTED | `apps/api/src/services/gemini.rs`, `apps/frontend/src/app/ask/page.tsx` | STATICALLY VERIFIED | Natural language Q&A about package dependencies and security risks. |
| AI Operations | Gemini Live Voice Token Proxy | STUB_OR_DEMO | `apps/api/src/main.rs:172` (`/live/token`) | STATICALLY VERIFIED | Returns ephemeral token from environment variable `GEMINI_LIVE_EPHEMERAL_TOKEN`. |
| Frontend | 2D Dependency Graph | IMPLEMENTED | `apps/frontend/src/components/graph/` | RUNTIME VERIFIED (build) | D3 / Canvas 2D force graph representation. |
| Frontend | 3D Dependency Graph | IMPLEMENTED | `apps/frontend/src/app/graph/page.tsx` | RUNTIME VERIFIED (build) | Three.js / `react-force-graph-3d` visualization with camera controls and custom sprite labels. |
| Frontend | Node Inspection & Tooltips | IMPLEMENTED | `apps/frontend/src/components/graph/node-tooltip.tsx` | RUNTIME VERIFIED (build) | Hover and selection state displaying package metadata. |
| Frontend | Dependency Path Explorer | IMPLEMENTED | `apps/frontend/src/app/path/page.tsx` | RUNTIME VERIFIED (build) | Visualizes path traces between packages. |
| Frontend | Supply Chain & Security Dashboards | IMPLEMENTED | `apps/frontend/src/app/security/page.tsx`, `apps/frontend/src/app/supply-chain/page.tsx` | RUNTIME VERIFIED (build) | Displays vulnerability lists, risk tiers, and package cards. |
| Testing | Rust Unit Tests | IMPLEMENTED | `tests/`, `packages/*/src/`, `apps/*/src/` | RUNTIME VERIFIED | 114 tests passing across workspace crates. |
| Testing | Frontend Unit / E2E Tests | PARTIAL | `apps/frontend/e2e/`, `apps/frontend/playwright.config.ts` | NOT RUNTIME VERIFIED | Playwright E2E configuration exists but is blocked without running backend infrastructure. |
| Testing | Accessibility Testing | PARTIAL | `apps/frontend/package.json` (`@axe-core/playwright`) | NOT RUNTIME VERIFIED | Configured via Playwright Axe helper. |
| Infrastructure | Multi-Tenancy & Authorization | IMPLEMENTED | `packages/models/src/tenant.rs`, `apps/api/src/gql/mod.rs` | RUNTIME VERIFIED (unit tests) | Tenant filtering (`tenant_id`) enforced across GraphQL queries and Memgraph nodes. |
| Infrastructure | Observability & Metrics | IMPLEMENTED | `packages/metrics/src/lib.rs`, `packages/tracing/src/lib.rs`, `observability/` | RUNTIME VERIFIED (unit tests) | Prometheus metrics endpoints and Grafana dashboard templates. |
| Infrastructure | Security Headers & CORS | PARTIAL | `apps/api/src/main.rs`, `apps/frontend/next.config.mjs` | STATICALLY VERIFIED | Standard CORS and Next.js headers; modern WebMCP isolation headers absent. |
| CI / Automation | GitHub Actions Workflows | PARTIAL | `.github/workflows/ci.yml` | STATICALLY VERIFIED | CI pipeline contains fail-open gates (`continue-on-error: true` on lint, `|| true` on Playwright). |
