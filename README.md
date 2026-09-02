# 🔗 Real-time Dependency Graph Analysis Platform

[![CI](https://github.com/zoxknez/Real-time-Dependency-Graph-Analysis-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/zoxknez/Real-time-Dependency-Graph-Analysis-Platform/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A self-hostable platform that continuously ingests packages from npm, PyPI, and crates.io, parses their public APIs with tree-sitter, and answers the question most registries can't: **"if this package ships a breaking change, who breaks?"**

## Why does this exist?

Registries tell you what a package depends on. Almost nothing tells you the *inverse* — which packages (and how many hops away) depend on yours, and whether a new release actually broke its public API. This project combines real-time registry feeds, AST-level API diffing, and a graph database to make impact analysis and breaking-change detection queryable in one GraphQL API.

## ✨ Features

- **🔍 Real-time Package Crawling** - Continuous ingestion from npm, PyPI, and crates.io
- **🧠 AST Analysis** - Tree-sitter based parsing for 6 languages (JS/TS/Python/Rust/Go/Java)
- **⚠️ Breaking Change Detection** - Automatic semantic versioning analysis
- **📊 Graph Visualization** - Interactive dependency graphs (2D force layout)
- **🔎 Semantic Search** - Vector embeddings for natural language package search
- **📈 Real-time Subscriptions** - WebSocket-based live updates
- **🔒 Enterprise Security** - JWT auth, rate limiting, audit logging

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose v2.20+
- Rust 1.85+ (for development, edition 2024)
- Node.js 22+ (for frontend)

### Option 1: Lite Stack (fastest way to try it)

Runs the API, frontend, and the three databases — no Kafka, no stream processing. Queries work against seeded sample data.

```bash
git clone https://github.com/zoxknez/Real-time-Dependency-Graph-Analysis-Platform.git
cd Real-time-Dependency-Graph-Analysis-Platform

# Start the minimal stack (first run builds the images, ~10 min; afterwards seconds)
docker compose -f docker-compose.lite.yml up -d --build

# Seed sample data
docker compose -f docker-compose.lite.yml --profile seed run --rm seed
```

Then open:
- 🌐 **Dashboard**: http://localhost:3000
- 🧪 **GraphQL Playground**: http://localhost:8000/graphql

### Option 2: Full Stack (Docker)

```bash
# Clone the repository
git clone https://github.com/zoxknez/Real-time-Dependency-Graph-Analysis-Platform.git
cd Real-time-Dependency-Graph-Analysis-Platform

# Start all infrastructure services
docker compose up -d

# Wait for services to be healthy (about 30 seconds)
docker compose ps

# Start all application services (crawlers, analysis pipeline, API, frontend)
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.apps.yml up -d

# Seed sample data (optional)
python scripts/dev-seed.py
```

**Access Points:**
- 🌐 **GraphQL Playground**: http://localhost:8000/graphql
- 📊 **Grafana Dashboards**: http://localhost:3001 (admin/admin)
- 🗄️ **Memgraph Lab**: http://localhost:3002
- 📬 **Redpanda Console**: http://localhost:18080

### Option 3: Development Mode

```bash
# Start infrastructure only
docker-compose up -d

# Install frontend dependencies
cd apps/frontend && npm install && cd ../..

# Run backend services (in separate terminals)
cargo run -p api          # API Gateway → http://localhost:8000
cargo run -p ingestion    # Registry Crawler
cargo run -p analysis     # AST Analysis
cargo run -p graph-writer # Memgraph Sync
cargo run -p vector-writer # Qdrant Sync

# Run frontend
cd apps/frontend && npm run dev   # → http://localhost:3000
```

### Using the Makefile

```bash
make help           # Show all available commands
make dev            # Start infrastructure + seed data
make test           # Run all tests
make docker-up-all  # Start everything
make frontend-dev   # Start frontend dev server
```

## 📖 Sample GraphQL Queries

```graphql
# Name search for packages
query SearchPackages {
  searchPackages(query: "react", ecosystem: NPM, first: 10) {
    edges { node { id name ecosystem } }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}

# Semantic search (Qdrant-backed)
query SemanticSearchPackages {
  semanticSearchPackages(query: "http client with retries", ecosystem: NPM, first: 10) {
    edges { node { id name ecosystem } score }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}

# Get package details
query PackageDetails {
  package(id: "npm:react") { id name ecosystem }
}

# Reverse dependents
query ReverseDependents {
  reverseDependents(packageId: "npm:react", maxDepth: 2, first: 10) {
    edges { node { id name ecosystem } depth }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}

# Impact radius
query ImpactAnalysis {
  impactRadius(packageId: "npm:lodash", maxDepth: 3, limit: 100) {
    packageId
    impactedPackages
    impactedVersions
    topImpacted { package { id name ecosystem } depth }
  }
}
```

## Architecture

### WebMCP War Room challenge workflow

The canonical reviewer surface is `/graph`: open a graph, select a package, inspect evidence, simulate an API change, calculate direct version exposure, apply human review, inspect critical paths, generate a bounded migration plan, and focus a real path. API breakage, version exposure, topology, security evidence, and business priority remain separate facts.

```text
Human UI -----\\
               -> WarRoomActions -> deterministic domain/services
WebMCP Agent -/                         |-> analysis/API boundaries
                                        |-> OSV evidence provider
                                        |-> WMCP snapshot authority
```

The final package is documented in [`docs/challenge/SUBMISSION.md`](docs/challenge/SUBMISSION.md), [`docs/challenge/DEMO-SCRIPT.md`](docs/challenge/DEMO-SCRIPT.md), and [`docs/challenge/FINAL-CLAIMS.md`](docs/challenge/FINAL-CLAIMS.md). The adaptive surface contains 16 canonical tools, all executable globally, while physical registration remains phase-adaptive.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Ingestion    │───▶│    Redpanda     │◀───│    Analysis     │
│  (npm/PyPI/Cargo)│    │   (v26.1.5)     │    │  (Tree-sitter)  │
└─────────────────┘    └────────┬────────┘    └─────────────────┘
                                │
                       ┌────────▼────────┐
                       │   RisingWave    │
                       │    (v2.8.1)     │
                       └────────┬────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
│  Graph Writer   │   │  Vector Writer  │   │    PostgreSQL   │
│   (Memgraph)    │   │    (Qdrant)     │   │   (Audit/Meta)  │
└────────┬────────┘   └────────┬────────┘   └─────────────────┘
         │                     │
         └──────────┬──────────┘
                    │
           ┌────────▼────────┐
           │   API Gateway   │
           │  (GraphQL/REST) │
           └────────┬────────┘
                    │
           ┌────────▼────────┐
           │   Web Platform  │
           │  (Next.js/2D)   │
           └─────────────────┘
```

## Services

| Port  | Service           | URL                          |
|-------|-------------------|------------------------------|
| 19092 | Redpanda (Kafka)  | -                            |
| 18080 | Redpanda Console  | http://localhost:18080       |
| 4566  | RisingWave        | postgres://root@localhost    |
| 5691  | RisingWave Dashboard | http://localhost:5691     |
| 7687  | Memgraph (Bolt)   | bolt://localhost:7687        |
| 3002  | Memgraph Lab      | http://localhost:3002        |
| 6333  | Qdrant (REST)     | http://localhost:6333        |
| 6334  | Qdrant (gRPC)     | http://localhost:6334        |
| 5432  | PostgreSQL        | postgres://idp@localhost     |
| 6379  | Redis             | redis://localhost:6379       |
| 16686 | Jaeger UI         | http://localhost:16686       |

## Monitoring (Optional)

```bash
docker-compose --profile monitoring up -d
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001 (admin/admin)
```

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Messaging | Redpanda | v26.1.5 |
| Stream SQL | RisingWave | v2.8.1 |
| Graph DB | Memgraph | v3.9.0 |
| Vector DB | Qdrant | v1.17.0 |
| Metadata | PostgreSQL | 17 |
| Caching | Redis | 8.6.0 |
| Tracing | Jaeger | v2.17.0 |
| Monitoring | Prometheus | v3.11.2 |
| Dashboards | Grafana | 13.0.1 |
| Backend | Rust + Axum | 0.8 |
| Frontend | Next.js | 16.2.3 |

## 📁 Project Structure

```
├── apps/
│   ├── api/                # GraphQL API Gateway (Axum + async-graphql)
│   ├── ingestion/          # Registry crawlers (npm, PyPI, Cargo)
│   ├── analysis/           # AST parsing & breaking change detection
│   ├── graph-writer/       # Memgraph synchronization
│   ├── vector-writer/      # Qdrant embeddings writer
│   ├── syncer/             # RisingWave → Storage sync
│   └── frontend/           # Next.js + React
├── packages/
│   ├── models/             # Shared domain types
│   ├── storage/            # Database clients (Memgraph, Qdrant, RisingWave)
│   ├── tracing/            # Distributed tracing utilities
│   └── metrics/            # Prometheus metrics
├── deploy/
│   └── helm/               # Kubernetes Helm charts
├── docs/
│   ├── api/                # OpenAPI specification
│   └── adr/                # Architecture Decision Records
├── tests/
│   ├── e2e/                # Integration tests (Testcontainers)
│   └── load/               # k6 performance tests
├── observability/
│   └── grafana/            # Dashboard definitions
└── scripts/
    ├── db/                 # Database initialization scripts
    └── dev-seed.py         # Development data seeder
```

## 🔧 Configuration

Environment variables for each service:

```bash
# API Service
API_PORT=8000
MEMGRAPH_URI=bolt://localhost:7687
# Rust services use Qdrant gRPC (6334). The dev seeder uses Qdrant REST (6333).
QDRANT_URL=http://localhost:6334
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key

# Kafka/Redpanda
KAFKA_BROKERS=localhost:19092

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for complete configuration reference.

## 🧪 Testing

```bash
# Unit tests
cargo test --workspace

# Integration tests (requires Docker)
cargo test --workspace --features integration

# Load tests
k6 run tests/load/graphql-queries.js

# E2E browser tests
cd apps/frontend && npx playwright test
```

## 📊 Monitoring

Access Grafana at http://localhost:3001 with pre-configured dashboards:

- **API Dashboard** - HTTP requests, GraphQL metrics, cache hit rates
- **Pipeline Dashboard** - Ingestion rates, analysis throughput, breaking changes
- **Storage Dashboard** - Database connections, query latencies, memory usage

## 🚢 Deployment

### Kubernetes (Helm)

```bash
# Lint chart
helm lint deploy/helm/idp

# Install to staging
helm install idp deploy/helm/idp \
  -f deploy/helm/idp/values-staging.yaml \
  --namespace staging

# Production
helm install idp deploy/helm/idp \
  -f deploy/helm/idp/values-production.yaml \
  --namespace production
```

## 🤖 Autonomous Security Agent (optional)

The API ships with an experimental security agent built on Gemini function calling — it walks the dependency graph, cross-references OSV vulnerabilities, and produces structured risk reports. It needs a `GEMINI_API_KEY` (see `.env.example`) and is disabled without one. It was originally built for a Gemini hackathon; see [docs/archive/HACKATHON_SUBMISSION.md](docs/archive/HACKATHON_SUBMISSION.md).

## 📚 Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [API Reference](docs/API.md)
- [Security Guide](docs/SECURITY.md)
- [Architecture Decision Records](docs/adr/)

## 🤝 Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, and use the lite stack (`docker-compose.lite.yml`) for a quick development loop.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
