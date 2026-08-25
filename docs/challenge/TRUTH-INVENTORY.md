# WebMCP Challenge Truth Inventory

This document provides a forensic inventory of the platform codebase as of immutable baseline commit `864a3d6905826bd0fabab02cf02785ab0c702842`.

---

## 1. Confirmed Real Implementations

- **Multi-Ecosystem Ingestion Pipeline:** `apps/ingestion/` implements concrete index fetching for crates.io (`registries/crates/`), changelog processing for PyPI (`registries/pypi/`), and CouchDB changes streaming for npm (`registries/npm/`).
- **Graph Storage Layer:** `packages/storage/src/memgraph.rs` and `apps/graph-writer/src/graph/batch.rs` execute parameterized Cypher queries to build property graph structures in Memgraph.
- **Tree-sitter AST Symbol Extraction:** `apps/analysis/src/ast_parser.rs` uses Tree-sitter grammars to parse Rust, JavaScript, TypeScript, Python, Go, and Java source files, extracting qualified paths, visibility, and signatures.
- **Semantic Breaking Change Engine:** `apps/analysis/src/breaking_detector.rs` performs AST symbol diffing to detect removed symbols, signature modifications, and visibility drops.
- **Live OSV Integration:** `apps/api/src/services/osv.rs` queries the public OSV API (`https://api.osv.dev/v1/query`) and deserializes live CVE/GHSA vulnerability records.
- **Vector Search Storage:** `packages/storage/src/qdrant.rs` provides concrete index creation and vector similarity querying against Qdrant.
- **Modern Next.js Frontend:** `apps/frontend/` compiles cleanly with Next.js 16.2.7 and React 19, rendering interactive 2D (D3/Canvas) and 3D (Three.js/WebGL) dependency graph topologies.

---

## 2. Partial Implementations

- **Impact Radius Calculation:** `apps/api/src/graph/queries.rs` traverses reverse dependency chains (`DEPENDS_ON_PKG`) topologically, but does not evaluate version constraint compatibility or AST breaking change signatures.
- **Graph WebSocket Subscriptions:** `apps/api/src/gql/subscription.rs` broadcasts version events, but the frontend graph page (`apps/frontend/src/app/graph/page.tsx:128`) only logs updates to console without mutating or refetching graph data.
- **API Snapshot Persistence:** `apps/analysis/src/main.rs:740` saves public API snapshots to a local directory on disk rather than a durable, distributed object store.
- **Vulnerability Risk Scoring:** `apps/api/src/gql/query.rs:1132` calculates risk scores using simple severity heuristics because EPSS, KEV, and reachability metrics are unpopulated.

---

## 3. Demo or Stub Implementations

- **GraphQL OpenSSF Scorecard Resolver:** `apps/api/src/gql/query.rs:1444-1534` returns hard-coded mock check results despite a real OpenSSF scorecard module existing in `apps/api/src/services/scorecard.rs`.
- **Vulnerability Threat Intelligence Enrichment:** `apps/api/src/gql/query.rs:1173-1186` sets `cvss_score = 0.0`, `epss_score = None`, `in_kev = false`, `has_public_exploit = false`, and `reachability = ReachabilityStatus::NoRule`.
- **Gemini Live Voice Token Endpoint:** `apps/api/src/main.rs:172` (`/live/token`) returns a static token from environment configuration rather than negotiating ephemeral credentials.

---

## 4. Hard-Coded or Synthetic Production-Looking Data

- **Scorecard Check Descriptions & Scores:** Static arrays in `apps/api/src/gql/query.rs:1453-1534` return synthetic values (e.g., `"2 known vulnerabilities found"`, `"30 commits in last 90 days"`).
- **Default Vulnerability Reachability:** Every vulnerability finding emits synthetic `ReachabilityEvidence` with `confidence: 0.0` and `status: NoRule`.

---

## 5. Misleading or Overbroad Naming

- **`impactRadius` Query:** Represents topological graph distance and node reachability rather than verified semantic breakage.
- **`scorecard` Query:** Exposes OpenSSF Scorecard schema types that suggest live external telemetry while returning static in-memory structs.

---

## 6. Legacy Identifiers and Branding

- **Tooling & Namespace URIs:** `packages/models/src/sbom.rs` and `apps/api/src/gql/query.rs` emit `randomapp-sbom-generator` and `https://randomapp.dev/sbom/...`.
- **VEX Tooling Identifier:** `packages/models/src/vex.rs:583` references `randomapp-vex-generator/1.0.0`.
- **Docker Compose Configurations:** `docker-compose.yml` uses project name `randomapp`.

---

## 7. Fail-Open CI Checks

- **Frontend Linter Gate:** `.github/workflows/ci.yml:207` sets `continue-on-error: true` on `npm run lint`.
- **Frontend E2E Test Gate:** `.github/workflows/ci.yml:243` runs `npx playwright test || true`.
- **Security & Dependency Audits:** `.github/workflows/ci.yml:329` and `:348` set `continue-on-error: true` on `cargo audit` and `cargo deny check`.

---

## 8. Runtime Claims Not Proven by Static Source

- **Real-Time Graph Reactivity:** The UI displays live connection indicators, but received WebSocket updates do not mutate the rendered graph dataset.
- **Reachability-Aware Risk:** Documentation and schemas describe reachability-weighted vulnerability scoring, but runtime resolvers default all reachability fields to empty/zero.

---

## 9. Technical Debt Relevant to the Challenge Path

- AST snapshots stored on local ephemeral disk cannot be shared across scalable analysis workers.
- Package-level graph projections (`DEPENDS_ON_PKG`) discard SemVer range requirements, impeding precise counterfactual simulation.
- Legacy Gemini hackathon code is coupled to custom JSON prompts rather than standard WebMCP protocol tools.

---

## 10. Items That MUST Be Resolved Before Submission

1. Replace hard-coded Scorecard GraphQL resolver with live OpenSSF evaluation (WMCP-9).
2. Wire real threat enrichment (EPSS, KEV, Exploit signals) into vulnerability models (WMCP-9).
3. Upgrade SBOM generator to modern SPDX 3.0 / CycloneDX 1.6 specifications and clean branding (WMCP-13).
4. Implement durable snapshot persistence for AST analysis (WMCP-6).
5. Retain version requirements on graph projections to support counterfactual scenario simulation (WMCP-7, WMCP-8).
6. Implement true WebMCP capability registry and tool surfaces (WMCP-3, WMCP-4).
7. Harden CI quality gates by removing `continue-on-error` and `|| true` bypasses (WMCP-14).

---

## Itemized Material Findings

### TRUTH-001 (HYPOTHESIS A): GraphQL OpenSSF Scorecard Returns Hard-Coded Data
- **Severity:** HIGH
- **Area:** GraphQL API Gateway (`apps/api`)
- **Evidence:** `apps/api/src/gql/query.rs:1444-1534`
- **Observed behavior:** The `scorecard` query constructs an inline `vec!` of hard-coded `ScorecardCheck` structs with static scores and reasons, completely bypassing the actual client in `apps/api/src/services/scorecard.rs`.
- **Why it matters:** Users querying supply chain security scores receive synthetic mock data rather than genuine OpenSSF metrics.
- **Hypothesis Classification:** CONFIRMED
- **Recommended future phase:** WMCP-9 - Evidence and scoring

### TRUTH-002 (HYPOTHESIS B): OSV Query Real While Threat Metrics Are Stubbed
- **Severity:** HIGH
- **Area:** Vulnerability Intelligence (`apps/api`)
- **Evidence:** `apps/api/src/gql/query.rs:1173-1186`, `apps/api/src/services/osv.rs`
- **Observed behavior:** Vulnerabilities are fetched from `api.osv.dev`, but threat signals are hard-coded: `cvss_score = 0.0`, `epss_score = None`, `in_kev = false`, `has_public_exploit = false`, `reachability = ReachabilityStatus::NoRule`.
- **Why it matters:** Downstream consumers cannot prioritize vulnerabilities by real-world exploitability or reachability.
- **Hypothesis Classification:** CONFIRMED
- **Recommended future phase:** WMCP-9 - Evidence and scoring

### TRUTH-003 (HYPOTHESIS C): SBOM Defaults to Older Specifications and Legacy Branding
- **Severity:** MEDIUM
- **Area:** Compliance & SBOM (`packages/models`, `apps/api`)
- **Evidence:** `packages/models/src/sbom.rs:648-793`, `apps/api/src/gql/query.rs:1366-1410`
- **Observed behavior:** SBOM generators target SPDX 2.3 and CycloneDX 1.5, and populate creator metadata with `randomapp-sbom-generator` and `https://randomapp.dev/sbom/`.
- **Why it matters:** Legacy naming creates branding inconsistency, and modern compliance targets expect updated SBOM specifications.
- **Hypothesis Classification:** CONFIRMED
- **Recommended future phase:** WMCP-13 - Product finalization

### TRUTH-004 (HYPOTHESIS D): AST Analysis Snapshots Stored in Ephemeral Directory
- **Severity:** HIGH
- **Area:** AST Analysis Service (`apps/analysis`)
- **Evidence:** `apps/analysis/src/main.rs:740-754`
- **Observed behavior:** Snapshots are written to `std::env::temp_dir().join("randomapp-snapshots")` without durable replication or shared storage.
- **Why it matters:** Restarting the analysis container or scaling horizontally destroys cached historical AST snapshots, breaking regression detection.
- **Hypothesis Classification:** CONFIRMED
- **Recommended future phase:** WMCP-6 - Snapshot persistence

### TRUTH-005 (HYPOTHESIS E): Dependency Version Constraints Discarded on Package Projections
- **Severity:** HIGH
- **Area:** Graph Model & Storage (`apps/graph-writer`, `packages/storage`)
- **Evidence:** `apps/graph-writer/src/graph/batch.rs:437`, `infra/memgraph/backfill_depends_on_pkg.cypher`
- **Observed behavior:** Version constraints (`version_req`) are saved on `(Version)-[:DEPENDS_ON]->(Package)` edges, but omitted on `(Package)-[:DEPENDS_ON_PKG]->(Package)` edges.
- **Why it matters:** Queries traversing package-level graphs lack the constraint context needed to evaluate whether a new version breaks downstream dependencies.
- **Hypothesis Classification:** CONFIRMED
- **Recommended future phase:** WMCP-8 - Version-aware exposure

### TRUTH-006 (HYPOTHESIS F): Impact Traversal Represents Topological Reachability
- **Severity:** HIGH
- **Area:** Impact Analysis Engine (`apps/api`)
- **Evidence:** `apps/api/src/graph/queries.rs:320`, `apps/api/src/gql/query.rs:272`
- **Observed behavior:** The impact calculation performs variable-length path traversal across dependency edges without evaluating SemVer ranges or breaking change deltas.
- **Why it matters:** The impact score indicates potential blast radius rather than guaranteed breaking failures.
- **Hypothesis Classification:** CONFIRMED
- **Recommended future phase:** WMCP-7 - Counterfactual engine

### TRUTH-007 (HYPOTHESIS G): Frontend Subscriptions Log Without Updating Graph State
- **Severity:** MEDIUM
- **Area:** Web UI (`apps/frontend`)
- **Evidence:** `apps/frontend/src/app/graph/page.tsx:128-136`
- **Observed behavior:** The `onUpdate` callback in `useDependencyGraphUpdates` prints `console.log("[Graph] Live update received:", update)` but does not trigger graph re-fetch or state mutation.
- **Why it matters:** Users viewing the 3D/2D graph do not see dynamic topological changes during live ingestion events.
- **Hypothesis Classification:** CONFIRMED
- **Recommended future phase:** WMCP-12 - Graph experience

### TRUTH-008 (HYPOTHESIS H): Frontend CI Quality Gates Fail Open
- **Severity:** MEDIUM
- **Area:** CI / Automation (`.github/workflows/ci.yml`)
- **Evidence:** `.github/workflows/ci.yml:207,243,329,348`
- **Observed behavior:** `npm run lint` uses `continue-on-error: true`, and `npx playwright test` uses `|| true`.
- **Why it matters:** Pull request builds can succeed even when frontend lint errors or E2E browser tests fail.
- **Hypothesis Classification:** CONFIRMED
- **Recommended future phase:** WMCP-14 - Evals and hardening

### TRUTH-009: Legacy Gemini Hackathon Implementation Precedes WebMCP
- **Severity:** HIGH
- **Area:** AI Architecture (`apps/api`, `apps/frontend`)
- **Evidence:** `apps/api/src/services/gemini_agent.rs`, `apps/frontend/src/app/agent-live/`
- **Observed behavior:** AI agent logic is tightly bound to custom Gemini 3 function calling formats rather than a standardized WebMCP interface.
- **Why it matters:** WebMCP challenge requirements require a decoupled, adaptive tool surface and standardized protocol.
- **Recommended future phase:** WMCP-3 - WebMCP foundation & WMCP-4 - Adaptive capability surface

### TRUTH-010: Windows Environment Missing Clippy Component
- **Severity:** LOW
- **Area:** Developer Toolchain (`Root`)
- **Evidence:** `cargo clippy --workspace --all-targets --all-features -- -D warnings -D clippy::all` exit code 1
- **Observed behavior:** `cargo-clippy.exe` is absent from the host Rust toolchain.
- **Why it matters:** Baseline verification must document the exact toolchain state without unapproved automatic environment modifications.
- **Recommended future phase:** WMCP-1 - Platform modernization
