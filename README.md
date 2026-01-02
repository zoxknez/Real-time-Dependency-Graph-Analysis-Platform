# 🔗 Real-time Dependency Graph Analysis Platform

[![CI](https://github.com/zoxknez/Real-time-Dependency-Graph-Analysis-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/zoxknez/Real-time-Dependency-Graph-Analysis-Platform/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Enterprise-grade platform for real-time analysis of 100M+ packages from npm/PyPI/Cargo with breaking change detection and sub-second graph queries.

## ✨ Features

- **🔍 Real-time Package Crawling** - Continuous ingestion from npm, PyPI, and crates.io
- **🧠 AST Analysis** - Tree-sitter based parsing for 6 languages (JS/TS/Python/Rust/Go/Java)
- **⚠️ Breaking Change Detection** - Automatic semantic versioning analysis
- **📊 Graph Visualization** - WebGPU-powered interactive dependency graphs
- **🔎 Semantic Search** - Vector embeddings for natural language package search
- **📈 Real-time Subscriptions** - WebSocket-based live updates
- **🔒 Enterprise Security** - JWT auth, rate limiting, audit logging

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose v2.20+
- Rust 1.75+ (for development)
- Node.js 18+ (for frontend)

### Option 1: Full Stack (Docker)

```bash
# Clone the repository
git clone https://github.com/zoxknez/Real-time-Dependency-Graph-Analysis-Platform.git
cd Real-time-Dependency-Graph-Analysis-Platform

# Start all infrastructure services
docker-compose up -d

# Wait for services to be healthy (about 30 seconds)
docker-compose ps

# Start all application services
docker-compose -f docker-compose.apps.yml up -d

# Seed sample data (optional)
python scripts/dev-seed.py
```

**Access Points:**
- 🌐 **GraphQL Playground**: http://localhost:8080/graphql
- 📊 **Grafana Dashboards**: http://localhost:3001 (admin/admin)
- 🗄️ **Memgraph Lab**: http://localhost:3000
- 📬 **Redpanda Console**: http://localhost:8081

### Option 2: Development Mode

```bash
# Start infrastructure only
docker-compose up -d

# Install frontend dependencies
cd apps/frontend && npm install && cd ../..

# Run backend services (in separate terminals)
cargo run -p api          # API Gateway → http://localhost:8080
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
# Search for packages
query SearchPackages {
  search(term: "json parser", limit: 10) {
    name
    description
    ecosystem
    score
  }
}

# Get package details with dependents
query PackageDetails {
  package(name: "react") {
    name
    latestVersion
    dependentCount
    reverseDependents(first: 5) {
      name
      usedVersion
    }
  }
}

# Calculate impact radius
query ImpactAnalysis {
  impactRadius(packageId: "npm:lodash", depth: 3) {
    directDependents
    transitiveDependents
    affectedPackages {
      name
      depth
    }
  }
}

# Subscribe to real-time updates (WebSocket)
subscription LiveStats {
  liveStats {
    totalPackages
    packagesUpdatedToday
    activeSubscriptions
  }
}
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Ingestion    │───▶│    Redpanda     │◀───│    Analysis     │
│  (npm/PyPI/Cargo)│    │   (v25.3.4)     │    │  (Tree-sitter)  │
└─────────────────┘    └────────┬────────┘    └─────────────────┘
                                │
                       ┌────────▼────────┐
                       │   RisingWave    │
                       │    (v2.7.0)     │
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
           │    (WebGPU)     │
           └─────────────────┘
```

## Project Structure

```
├── Cargo.toml              # Workspace (7 crates)
├── docker-compose.yml      # 10 services
├── proto/
│   ├── shared/             # Event Envelope
│   └── domain/             # Package & Analysis
├── apps/
│   ├── ingestion/          # Registry crawler
│   ├── analysis/           # AST & breaking detection
│   ├── graph-writer/       # Memgraph writer
│   ├── vector-writer/      # Qdrant writer
│   └── api/                # GraphQL gateway
├── packages/
│   ├── models/             # Shared types
│   └── storage/            # DB wrappers
├── docs/adr/               # Architecture decisions
├── tools/                  # Dev scripts
├── observability/          # Monitoring configs
└── infra/                  # K8s, Prometheus
```

## Services

| Port  | Service           | URL                          |
|-------|-------------------|------------------------------|
| 19092 | Redpanda (Kafka)  | -                            |
| 8080  | Redpanda Console  | http://localhost:8080        |
| 4566  | RisingWave        | postgres://root@localhost    |
| 5691  | RisingWave Dashboard | http://localhost:5691     |
| 7687  | Memgraph (Bolt)   | bolt://localhost:7687        |
| 3000  | Memgraph Lab      | http://localhost:3000        |
| 6333  | Qdrant            | http://localhost:6333        |
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
| Messaging | Redpanda | v25.3.4 |
| Stream SQL | RisingWave | v2.7.0 |
| Graph DB | Memgraph | v3.0 |
| Vector DB | Qdrant | v1.13.0 |
| Metadata | PostgreSQL | 16 |
| Tracing | Jaeger | 1.54 |
| Backend | Rust + Axum | 0.8 |
## 📁 Project Structure

```
├── apps/
│   ├── api/                # GraphQL API Gateway (Axum + async-graphql)
│   ├── ingestion/          # Registry crawlers (npm, PyPI, Cargo)
│   ├── analysis/           # AST parsing & breaking change detection
│   ├── graph-writer/       # Memgraph synchronization
│   ├── vector-writer/      # Qdrant embeddings writer
│   ├── syncer/             # RisingWave → Storage sync
│   └── frontend/           # Next.js + React + WebGPU
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
API_PORT=8080
MEMGRAPH_URL=bolt://localhost:7687
QDRANT_URL=http://localhost:6333
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
helm lint deploy/helm/depgraph

# Install to staging
helm install depgraph deploy/helm/depgraph \
  -f deploy/helm/depgraph/values-staging.yaml \
  --namespace staging

# Production
helm install depgraph deploy/helm/depgraph \
  -f deploy/helm/depgraph/values-production.yaml \
  --namespace production
```

## 📚 Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [API Reference](docs/API.md)
- [Security Guide](SECURITY.md)
- [Architecture Decision Records](docs/adr/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Install pre-commit hooks (`pre-commit install`)
4. Make your changes
5. Run tests (`make test`)
6. Commit (`git commit -m 'feat: add amazing feature'`)
7. Push (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.