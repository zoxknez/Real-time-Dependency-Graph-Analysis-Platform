# Inverse Dependencies Platform

Enterprise-grade sistem za real-time analizu 100M+ paketa iz npm/PyPI/Cargo, detekciju breaking changes i sub-second graf upite.

## Quick Start

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Check workspace (requires Rust)
cargo check --workspace

# 3. Run API gateway
cargo run -p api
# → http://localhost:8080/graphql
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
