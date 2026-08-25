# WMCP-0A Baseline Architecture & Scope Freeze

## 1. Baseline Metadata

- **Repository:** `zoxknez/Real-time-Dependency-Graph-Analysis-Platform`
- **Branch:** `feature/webmcp-challenge-2026`
- **Immutable Baseline SHA:** `864a3d6905826bd0fabab02cf02785ab0c702842`
- **Baseline Tree SHA:** `f0f943a9efde81be78c26fc42922bc1796cc6e45`
- **Baseline Author Date:** `2026-07-09T23:37:35+02:00`
- **Baseline Commit Message:**
  ```text
  fix(seed): set tenant_id='public' on seeded nodes so API queries can see them

  All GraphQL resolvers filter on tenant_id (default 'public'); seeded
  Package/Version nodes had no tenant_id, so every query returned 0 rows.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```
- **Phase:** `WMCP-0A - Baseline Freeze & Challenge Truth Inventory`

---

## 2. Phase Scope & Non-Goals

### In Scope
- Establishing an immutable forensic snapshot of repository structure and code at baseline.
- Executing single-attempt verification commands on native toolchains and recording honest outcomes.
- Itemizing pre-existing platform capabilities versus stubbed/demo features.
- Establishing the exact demarcation boundary between pre-existing work and future WebMCP Challenge deliverables.

### Non-Goals
- Modifying any production application logic or schema definitions.
- Updating dependencies, package manifests, or lockfiles.
- Fixing test failures, compiler warnings, or linter configuration quirks.
- Implementing WebMCP tools, agents, schemas, or protocols.

---

## 3. Baseline System Architecture

The pre-challenge platform is a distributed supply-chain dependency analysis system composed of multiple asynchronous microservices written in Rust, paired with a Next.js web application.

```
                    ┌─────────────────────────┐
                    │    Registry Watchers    │
                    │ (crates.io, PyPI, npm)  │
                    └───────────┬─────────────┘
                                │
                                ▼
                     ┌───────────────────────┐
                     │    apps/ingestion     │
                     └──────────┬────────────┘
                                │ (Events)
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ apps/analysis │       │apps/graph-    │       │apps/vector-   │
│ (AST/Breaking)│       │    writer     │       │    writer     │
└───────┬───────┘       └───────┬───────┘       └───────┬───────┘
        │ (Disk Snapshot)       │                       │
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│Filesystem-    │       │   Memgraph    │       │    Qdrant     │
│Local Storage  │       │(Graph Storage)│       │ (Vector DB)   │
│(default: temp;│       └───────┬───────┘       └───────┬───────┘
│env-config)    │               │                       │
└───────────────┘               └───────────┬───────────┘
                                            ▼
                                ┌───────────────────────┐
                                │       apps/api        │
                                │   (GraphQL Gateway)   │
                                └───────────┬───────────┘
                                            │
                                            ▼
                                ┌───────────────────────┐
                                │     apps/frontend     │
                                │   (Next.js Web UI)    │
                                └───────────────────────┘
```

### Services Summary

1. **`apps/ingestion` (Rust)**: Polls upstream package registries (crates.io sparse index, PyPI changelog / JSON API, npm replicate/changes), extracts metadata, and dispatches version events.
2. **`apps/graph-writer` (Rust)**: Consumes version/package events and executes Cypher mutations in Memgraph, writing nodes (`Package`, `Version`) and edges (`BELONGS_TO`, `DEPENDS_ON`, `DEPENDS_ON_PKG`).
3. **`apps/vector-writer` (Rust)**: Consumes metadata events and writes vector points into Qdrant for semantic and similarity search.
4. **`apps/analysis` (Rust)**: Downloads package tarballs, executes Tree-sitter AST symbol extraction across 6 languages, detects breaking changes, and calculates heuristic/ONNX embeddings.
5. **`apps/syncer` (Rust)**: Interfaces with RisingWave materialized views for fast stream transformations.
6. **`apps/api` (Rust)**: GraphQL gateway powered by `async-graphql` and `axum`. Provides package queries, reverse dependency lookups, impact radius calculations, OSV vulnerability proxying, SBOM formatting, and legacy Gemini 3 agent tools.
7. **`apps/frontend` (TypeScript / Next.js)**: Modern web interface using React 19, Tailwind CSS, Apollo Client, Three.js / React Force Graph (2D and 3D), Framer Motion, and Lucide icons.

### Core Packages Summary

1. **`packages/models`**: Domain structs, protobuf code generation, SBOM builders (SPDX 2.3 & CycloneDX 1.5), OpenSSF Scorecard structs, VEX types, and tenant authorization models.
2. **`packages/storage`**: Client drivers and connection pools for Memgraph, Qdrant, RisingWave, PostgreSQL, advanced caching, and circuit breakers.
3. **`packages/metrics`**: Prometheus metrics collection wrappers.
4. **`packages/tracing`**: OpenTelemetry / `tracing-subscriber` initialization.

### Data Stores & Storage

- **Memgraph**: In-memory property graph storing package and version dependency topologies.
- **PostgreSQL**: Relational database for audit logs and tenant metadata.
- **Qdrant**: Vector database storing embeddings for semantic search.
- **RisingWave**: Streaming SQL database for materializing real-time analytics.
- **Filesystem-Local Snapshot Storage**: Public API snapshots are saved to a filesystem-local directory. The base path can be configured through `ANALYSIS_SNAPSHOT_DIR` and otherwise defaults to the OS temporary directory (`std::env::temp_dir().join("randomapp-snapshots")`). The baseline does not provide a shared durable snapshot repository, so cross-worker persistence and persistence across container replacement are deployment-dependent and not guaranteed by the application itself.

### External Integrations

- **OSV (Open Source Vulnerabilities API)**: `https://api.osv.dev/v1/query` and `v1/vulns/{id}` for live vulnerability lookups.
- **Upstream Package Registries**: crates.io sparse index, PyPI JSON API, npm registry.
- **Gemini API**: Google Gemini 3 model integration for chat and legacy security agent tool calling.

---

## 4. Pre-Challenge Capabilities

The following platform capabilities existed at the baseline commit:

- **Ecosystem Ingestion**: Polling mechanisms for crates.io, PyPI, and npm registry feeds.
- **Graph Ingestion & Topology**: Insertion of `Package` and `Version` nodes, `DEPENDS_ON` version-level edges, and `DEPENDS_ON_PKG` package projection edges.
- **AST Parsing Engine**: Tree-sitter parsers for Rust, JavaScript, TypeScript, Python, Go, and Java, extracting symbols, signatures, parameter lists, and visibility.
- **Breaking Change Detection**: Semantic comparison of public API symbol snapshots detecting removed symbols, modified parameter lists, return type modifications, and visibility drops.
- **GraphQL Gateway**: Rich schema exposing package details, reverse dependents, impact radius traversals, shortest path, and vulnerability queries.
- **Interactive UI**: Web interface supporting 2D and 3D dependency visualization, interactive node inspection, search, and comparative analysis.
- **Legacy AI Security Agent**: Gemini 3 function-calling agent capable of querying graph tools and formatting remediation reports.

---

## 5. Planned Challenge Capabilities - NOT PRESENT IN BASELINE

The following components represent future WebMCP Challenge deliverables and are verified to be completely absent from the baseline codebase:

- **WebMCP Capability Registry**: NOT PRESENT AT BASELINE
- **Adaptive WebMCP Tool Surface**: NOT PRESENT AT BASELINE
- **War Room Shared Action Layer**: NOT PRESENT AT BASELINE
- **contextRevision Stale-Context Protection**: NOT PRESENT AT BASELINE
- **Counterfactual API Scenario Engine**: NOT PRESENT AT BASELINE
- **Version-Aware Future-Release Exposure**: NOT PRESENT AT BASELINE
- **Human Scenario Review**: NOT PRESENT AT BASELINE
- **Migration Planning Engine**: NOT PRESENT AT BASELINE
- **WebMCP Judge Inspector**: NOT PRESENT AT BASELINE
- **WebMCP Evaluation Suite**: NOT PRESENT AT BASELINE
