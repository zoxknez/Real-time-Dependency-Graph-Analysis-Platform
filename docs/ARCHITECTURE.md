# Inverse Dependency Platform - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Frontend   │  │  CLI Tool   │  │  GitHub     │  │  Slack/     │         │
│  │  (Next.js)  │  │             │  │  Action     │  │  Discord    │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          │  GraphQL/WS    │    GraphQL     │   REST/GQL     │   Webhooks
          │                │                │                │
┌─────────▼────────────────▼────────────────▼────────────────▼────────────────┐
│                           API GATEWAY                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Nginx Ingress                                  │   │
│  │                    (TLS, Rate Limiting, WAF)                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         API Service (Rust)                            │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐  │   │
│  │  │   GraphQL    │ │ Subscriptions│ │ Rate Limiter │ │   JWT Auth  │  │   │
│  │  │   Resolvers  │ │  (WebSocket) │ │  (Governor)  │ │             │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
          │                              │                        │
          │ Cypher                       │ Events                 │ Cache
          │                              │                        │
┌─────────▼──────────────────────────────▼────────────────────────▼───────────┐
│                           DATA LAYER                                         │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │    Memgraph     │  │  Kafka/Redpanda │  │      Redis      │              │
│  │   (Graph DB)    │  │   (Event Bus)   │  │    (Cache)      │              │
│  │                 │  │                 │  │                 │              │
│  │  ┌───────────┐  │  │  Topics:        │  │  - Query cache  │              │
│  │  │ Packages  │  │  │  - versions     │  │  - Rate limits  │              │
│  │  │ Versions  │  │  │  - changes      │  │  - Sessions     │              │
│  │  │ DEPENDS_ON│  │  │  - impacts      │  │                 │              │
│  │  └───────────┘  │  │                 │  │                 │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│           ▲                    ▲                                             │
└───────────┼────────────────────┼─────────────────────────────────────────────┘
            │                    │
┌───────────┼────────────────────┼─────────────────────────────────────────────┐
│           │   PROCESSING LAYER │                                             │
│           │                    │                                             │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌─────────────────┐              │
│  │  Graph Writer   │  │  Vector Writer  │  │   Analysis      │              │
│  │    (Rust)       │  │    (Rust)       │  │   Service       │              │
│  │                 │  │                 │  │   (Rust)        │              │
│  │ - Kafka → Graph │  │ - Embeddings    │  │                 │              │
│  │ - Deduplication │  │ - Qdrant index  │  │ - CVE analysis  │              │
│  │ - Validation    │  │                 │  │ - Breaking chg  │              │
│  └────────┬────────┘  └────────┬────────┘  │ - Impact calc   │              │
│           │                    │           └────────┬────────┘              │
│           │                    │                    │                        │
│           │           ┌────────▼────────┐           │                        │
│           │           │     Qdrant      │           │                        │
│           │           │  (Vector DB)    │           │                        │
│           │           └─────────────────┘           │                        │
└───────────┼─────────────────────────────────────────┼────────────────────────┘
            │                                         │
┌───────────┼─────────────────────────────────────────┼────────────────────────┐
│           │    INGESTION LAYER                      │                        │
│           │                                         │                        │
│  ┌────────┴────────┐  ┌─────────────────┐  ┌───────┴─────────┐              │
│  │    Ingestion    │  │     Syncer      │  │   RisingWave    │              │
│  │    Service      │  │    Service      │  │ (Stream SQL)    │              │
│  │                 │  │                 │  │                 │              │
│  │ - NPM crawler   │  │ - Graph→RW sync │  │ - Aggregations  │              │
│  │ - PyPI crawler  │  │ - CDC capture   │  │ - Materialized  │              │
│  │ - Crates.io     │  │                 │  │   views         │              │
│  └────────┬────────┘  └─────────────────┘  └─────────────────┘              │
│           │                                                                  │
└───────────┼──────────────────────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SOURCES                                       │
│                                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   npmjs     │  │   PyPI      │  │ crates.io   │  │   Maven     │          │
│  │   .com      │  │   .org      │  │             │  │  Central    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### API Service (apps/api)

**Technology:** Rust, Axum, async-graphql

**Responsibilities:**
- GraphQL query resolution
- WebSocket subscription management
- Rate limiting (Governor)
- JWT authentication
- Query complexity analysis

**Key Files:**
- `src/main.rs` - Server bootstrap
- `src/gql/` - GraphQL schema and resolvers
- `src/gql/subscription.rs` - Real-time subscriptions
- `src/kafka/consumer.rs` - Event broadcasting

### Frontend (apps/frontend)

**Technology:** Next.js 14, TypeScript, TailwindCSS

**Responsibilities:**
- Interactive dependency explorer
- Real-time dashboard
- Graph visualization
- Search interface

**Key Features:**
- Apollo Client for GraphQL
- graphql-ws for subscriptions
- 2D force-directed graph visualization (react-force-graph-2d)
- Toast notifications for events

### Ingestion Service (apps/ingestion)

**Technology:** Rust, tokio

**Responsibilities:**
- Crawl package registries
- Parse package metadata
- Publish events to Kafka
- Rate limiting for external APIs

**Supported Registries:**
- NPM (npmjs.com)
- PyPI (pypi.org)
- Crates.io
- Maven Central
- NuGet

### Graph Writer (apps/graph-writer)

**Technology:** Rust, neo4rs

**Responsibilities:**
- Consume Kafka events
- Upsert nodes/edges in Memgraph
- Maintain graph integrity
- Handle deduplication

### Vector Writer (apps/vector-writer)

**Technology:** Rust, qdrant-client

**Responsibilities:**
- Generate package embeddings
- Index in Qdrant for similarity search
- Enable semantic package discovery

### Analysis Service (apps/analysis)

**Technology:** Rust

**Responsibilities:**
- CVE impact analysis
- Breaking change detection
- Dependency impact scoring
- Publish analysis events to Kafka

### Syncer Service (apps/syncer)

**Technology:** Rust

**Responsibilities:**
- Sync graph data to RisingWave
- CDC (Change Data Capture)
- Maintain materialized views

## Data Flow

### Package Ingestion Flow

```
Registry API → Ingestion → Kafka (versions topic) → Graph Writer → Memgraph
                                ↓
                          Vector Writer → Qdrant
```

### Query Flow

```
Client → API (GraphQL) → Memgraph (Cypher)
              ↓
         Redis (Cache)
```

### Subscription Flow

```
Kafka (events) → API (Consumer) → WebSocket → Client
                      ↓
              Broadcast Channels
```

### Analysis Flow

```
Kafka (versions) → Analysis → Kafka (impacts/changes) → API (broadcast) → Clients
```

## Graph Schema

### Nodes

```cypher
(:Package {
    id: "npm:lodash",
    ecosystem: "npm",
    name: "lodash",
    created_at: timestamp,
    updated_at: timestamp
})

(:Version {
    id: "npm:lodash:4.17.21",
    version: "4.17.21",
    published_at: timestamp,
    yanked: false
})
```

### Relationships

```cypher
(p:Package)-[:HAS_VERSION]->(v:Version)
(v1:Version)-[:DEPENDS_ON {version_req: "^1.0.0"}]->(p2:Package)
(p1:Package)-[:DEPENDS_ON_PKG]->(p2:Package)  // Denormalized for fast queries
```

### Indexes

```cypher
CREATE INDEX ON :Package(id);
CREATE INDEX ON :Package(ecosystem, name);
CREATE INDEX ON :Version(id);
CREATE INDEX ON :Version(package_id, version);
```

## Kafka Topics

| Topic | Key | Value | Purpose |
|-------|-----|-------|---------|
| `versions` | package_id | VersionEvent | New version published |
| `breaking-changes` | package_id | BreakingChangeEvent | Breaking change detected |
| `dependency-impact` | package_id | ImpactEvent | High-impact dependency change |
| `package-activity` | package_id | ActivityEvent | General package updates |

### Event Schema (versions)

```json
{
  "event_id": "uuid",
  "event_type": "version.upserted",
  "ecosystem": "npm",
  "name": "lodash",
  "version": "4.17.21",
  "published_at": 1640000000000,
  "dependencies": [
    {"name": "other-pkg", "version_req": "^1.0.0"}
  ]
}
```

## Scaling Considerations

### Horizontal Scaling

| Component | Scaling Strategy |
|-----------|------------------|
| API | Stateless, scale replicas |
| Ingestion | Partition by ecosystem |
| Graph Writer | Kafka consumer groups |
| Vector Writer | Independent scaling |
| Memgraph | Read replicas (Enterprise) |
| Redis | Cluster mode |
| Kafka | Increase partitions |

### Performance Targets

| Metric | Target |
|--------|--------|
| GraphQL query P99 | < 200ms |
| Subscription latency | < 100ms |
| Ingestion throughput | 1000 pkgs/sec |
| Graph query (depth 3) | < 500ms |
| Concurrent subscriptions | 10,000+ |

## Security

### Network Security

- All external traffic through Ingress (TLS)
- Network policies restrict pod-to-pod communication
- No direct database exposure

### Authentication

- JWT tokens for API access
- Service accounts for internal services
- Secrets managed via External Secrets Operator

### Rate Limiting

- Per-IP: 100 req/min
- Per-user: 1000 req/min (authenticated)
- Subscription limits: 10 concurrent/IP

## Monitoring

### Metrics (Prometheus)

```yaml
# Key metrics exposed by API service
idp_graphql_requests_total{operation, status}
idp_graphql_duration_seconds{operation}
idp_active_subscriptions
idp_kafka_messages_processed_total
idp_cache_hits_total
idp_cache_misses_total
```

### Alerting Rules

- High error rate (>5% for 5min)
- High latency (P99 > 2s)
- Pod restarts (>3/hour)
- Memory usage (>90%)
- Subscription count (>1000 - capacity warning)

### Distributed Tracing

- OpenTelemetry integration
- Trace context propagation via Kafka headers
- Jaeger/Tempo backend

## Deployment

### Kubernetes Resources

```
idp/
├── Deployments
│   ├── api (3+ replicas, HPA)
│   ├── frontend (2+ replicas, HPA)
│   ├── ingestion (2 replicas)
│   ├── graph-writer (2 replicas)
│   ├── vector-writer (1 replica)
│   ├── analysis (2 replicas)
│   └── syncer (1 replica)
├── Services
│   ├── api-service (ClusterIP)
│   └── frontend-service (ClusterIP)
├── Ingress
│   └── idp-ingress (nginx + cert-manager)
├── ConfigMaps
│   └── idp-config
├── Secrets (via External Secrets)
│   ├── redis-secret
│   ├── memgraph-secret
│   └── kafka-secret
└── HPA
    ├── api-hpa
    └── frontend-hpa
```

### CI/CD Pipeline

```
Push → GitHub Actions
          ↓
    ┌─────────────────┐
    │  Build & Test   │
    │  - Cargo check  │
    │  - Clippy       │
    │  - Unit tests   │
    │  - Integration  │
    └────────┬────────┘
             ↓
    ┌─────────────────┐
    │  Security Scan  │
    │  - cargo-audit  │
    │  - cargo-deny   │
    │  - SARIF upload │
    └────────┬────────┘
             ↓
    ┌─────────────────┐
    │  Docker Build   │
    │  - Multi-arch   │
    │  - GHCR push    │
    │  - SBOM gen     │
    └────────┬────────┘
             ↓
    ┌─────────────────┐
    │  Deploy         │
    │  - Helm upgrade │
    │  - Smoke tests  │
    │  - Notify       │
    └─────────────────┘
```

## Future Considerations

### Phase 2 Features

- [ ] Multi-tenant support
- [ ] Custom alerting rules per user
- [ ] Private registry support
- [ ] Dependency license scanning
- [ ] SBOM generation for projects

### Performance Improvements

- [ ] Query result streaming
- [ ] Incremental graph updates
- [ ] Edge caching with CDN
- [ ] Precomputed popular queries

### Ecosystem Expansion

- [ ] Go modules (go.mod)
- [ ] Ruby gems
- [ ] PHP Composer
- [ ] Swift Package Manager
