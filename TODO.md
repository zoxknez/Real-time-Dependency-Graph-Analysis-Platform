# 🚀 Platform Improvement Roadmap

> Generisano na osnovu duboke analize - Januar 2026
> Prioriteti: 🔴 Kritično | 🟠 Visok | 🟡 Srednji | 🟢 Nizak

---

## ✅ COMPLETED TASKS

### Infrastructure & DevOps
- [x] **CI/CD Pipeline** - Complete GitHub Actions workflows
  - `ci.yml` - Lint, test, security scan, build
  - `deploy.yml` - Multi-environment deployment
- [x] **Kubernetes Deployment** - Production-ready Helm chart
  - Complete Helm chart with 16+ templates
  - HPA autoscaling, PDB, NetworkPolicies
  - ServiceMonitor, PrometheusRules for monitoring
  - Staging and production value files
- [x] **Docker Compose** - Complete application orchestration
  - `docker-compose.apps.yml` - All services with healthchecks
  - Dockerfiles for all 7 services

### Backend Services
- [x] **WebSocket Subscriptions** - 5 real-time subscription types
  - `newVersion` - Package version updates
  - `breakingChangeDetected` - Breaking change alerts
  - `liveStats` - Real-time platform statistics
  - `dependencyImpact` - Impact analysis events
  - `packageEvents` - Package activity stream
- [x] **JWT Authentication** - Complete auth middleware
- [x] **Rate Limiting** - Tier-based rate limits (Free/Pro/Enterprise)
  - Local rate limiting with governor
  - Distributed Redis-based rate limiting
- [x] **Prometheus Metrics** - Custom metrics for all operations
  - HTTP request metrics (latency, count, in-flight)
  - GraphQL query metrics (duration, complexity, errors)
  - Database operation metrics
  - Cache hit/miss metrics
  - Kafka consumer metrics
  - Subscription metrics

### Ingestion Service
- [x] **NPM Crawler** - Fetcher, diff, state, watcher, worker
- [x] **PyPI Crawler** - JSON API, Simple API, yank detection
- [x] **Cargo Crawler** - Sparse index with ETag/Last-Modified
- [x] **Rate Limiting** - Per-registry rate limiting with backoff

### Security Hardening
- [x] **Security Headers** - HSTS, CSP, X-Frame-Options, etc.
- [x] **Input Validation** - Query depth, complexity, size limits
- [x] **Audit Logging** - Comprehensive request/event logging
- [x] **Security Documentation** - SECURITY.md guide

### Testing
- [x] **E2E Integration Tests** - Testcontainers infrastructure
  - Memgraph, Qdrant, Redpanda, RisingWave containers
  - API GraphQL endpoint tests
  - Security header tests

### Frontend
- [x] **Theme System** - Dark/light mode with toggle
- [x] **Error Boundaries** - Graceful error handling
- [x] **Loading States** - Skeleton, spinner, overlay variants
- [x] **Accessibility** - Screen reader support, keyboard navigation
  - VisuallyHidden, SkipLink, LiveRegion components
  - Focus trap hook, accessible progress bars

### Tracing & Observability
- [x] **Tracing Library** - Configurable tracing infrastructure
- [x] **Metrics Library** - Shared metrics for all services

### Documentation
- [x] **API Documentation** - Complete GraphQL API reference
- [x] **Architecture Documentation** - System diagrams & flows
- [x] **Development Guide** - Setup & workflow instructions
- [x] **GraphQL Schema** - Complete schema definition

---

## 📊 Status Overview

| Kategorija | Status | Prioritet | Detalji |
|------------|--------|-----------|---------|
| API Service | ✅ Funkcionalan | 🟢 | GraphQL radi, testovi postoje |
| Ingestion Service | ⚠️ Delimično | 🟠 | Crawlers imaju TODO |
| Analysis Service | ❌ Skeleton | 🔴 | Većina TODO |
| Graph Writer | ⚠️ Delimično | 🟠 | Handlers postoje |
| Vector Writer | ❌ Skeleton | 🔴 | TODO-ovi |
| Syncer | ❌ Skeleton | 🔴 | TODO-ovi |
| Frontend | ⚠️ U razvoju | 🟠 | Radi, treba poboljšanja |
| Testovi | ⚠️ Delimični | 🟠 | Ingestion ima, API delimično |
| CI/CD | ✅ Završeno | 🟢 | GitHub Actions + Helm |
| Dokumentacija | ✅ Kompletno | 🟢 | API, Arch, Dev, Security |
| Security | ✅ Završeno | 🟢 | Headers, Audit, Validation |

---

## 🔍 Pronađeni TODO-ovi u Kodu

### Analysis Service (`apps/analysis/`)
| Fajl | Linija | TODO |
|------|--------|------|
| `main.rs` | 31 | Load configuration |
| `main.rs` | 32 | Initialize Kafka consumer |
| `main.rs` | 33 | Initialize Kafka producer |
| `main.rs` | 34 | Load Tree-sitter parsers |
| `main.rs` | 35 | Load embedding model |
| `main.rs` | 36 | Start worker pool |
| `ast_parser.rs` | 71 | Initialize language-specific parsers |
| `ast_parser.rs` | 89 | Actual Tree-sitter parsing |
| `breaking_detector.rs` | 125 | Implement detailed signature comparison |

### Ingestion Service (`apps/ingestion/`)
| Fajl | Linija | TODO |
|------|--------|------|
| `crawler.rs` | 95 | Parse registry-specific response format |
| `crawler.rs` | 113 | Implement registry-specific change polling |
| `store/outbox.rs` | 383 | Add unit tests with mock database |

### Vector Writer (`apps/vector-writer/`)
| Fajl | Linija | TODO |
|------|--------|------|
| `main.rs` | 26 | Connect to Qdrant |
| `main.rs` | 27 | Initialize Kafka consumer |
| `main.rs` | 28 | Start writer workers with backoff |

### Syncer (`apps/syncer/`)
| Fajl | Linija | TODO |
|------|--------|------|
| `main.rs` | 28 | Connect to RisingWave |
| `main.rs` | 29 | Connect to Memgraph |
| `main.rs` | 30 | Connect to Qdrant |
| `main.rs` | 31 | Start sync workers |

### Storage Package (`packages/storage/`)
| Fajl | Linija | TODO |
|------|--------|------|
| `memgraph.rs` | 13 | Initialize connection |
| `qdrant.rs` | 13 | Initialize connection |
| `risingwave.rs` | 13 | Initialize connection |

---

## ⚡ HITNO - Početni Koraci (Ovaj Sprint)

### Korak 1: Analysis Service - Tree-sitter Parseri
**Prioritet:** 🔴 Kritično  
**Effort:** 4-6 sati  
**Fajlovi:** `apps/analysis/src/ast_parser.rs`, `apps/analysis/src/main.rs`

Trenutno AST parser vraća mock podatke. Treba implementirati pravu Tree-sitter integraciju.

```bash
# Dependencies da dodamo u Cargo.toml:
tree-sitter = "0.22"
tree-sitter-rust = "0.21"
tree-sitter-javascript = "0.21"
tree-sitter-python = "0.21"
tree-sitter-go = "0.21"
tree-sitter-java = "0.21"
```

### Korak 2: API Testovi
**Prioritet:** 🔴 Kritično  
**Effort:** 3-4 sata  
**Fajlovi:** `apps/api/src/gql/query.rs`

Dodati GraphQL query testove za sve resolvere.

### Korak 3: CI/CD Pipeline
**Prioritet:** 🟠 Visok  
**Effort:** 2-3 sata  
**Fajl:** `.github/workflows/ci.yml`

Kreirati osnovni CI workflow.

### Korak 4: JWT Autentifikacija
**Prioritet:** 🟠 Visok  
**Effort:** 4-5 sati  
**Fajlovi:** `apps/api/src/middleware/auth.rs`

Implementirati JWT middleware.

---

## 🔴 FAZA 1: Kritične Implementacije (Sprint 1-2)

### 1.1 Završiti TODO Delove u Kodu

#### Analysis Service (`apps/analysis/src/main.rs`)
- [ ] **A1.1** Implementirati Tree-sitter parser loading
  - Učitavanje parsera za Rust, JavaScript, Python, Go, Java
  - Kreirati `ParserPool` sa lazy initialization
  - Fajl: `apps/analysis/src/parsers/mod.rs`
  
- [ ] **A1.2** Implementirati Worker Pool
  - Start worker pool za paralelnu analizu
  - Konfigurabilni broj workera (env: `ANALYSIS_WORKERS`)
  - Graceful shutdown handling

- [ ] **A1.3** Breaking Change Detection
  - Implementirati AST diff analizu
  - Detekcija: removed functions, changed signatures, removed exports
  - Generisanje `BreakingChangeEvent` za Kafka

#### Ingest Service (`apps/ingest/`)
- [ ] **A1.4** Kafka Consumer Implementation
  - Kompletirati consumer loop za registry events
  - Implementirati retry logic sa exponential backoff
  - Dead letter queue za failed messages

- [ ] **A1.5** Registry Crawlers
  - NPM registry crawler (pagination, rate limiting)
  - PyPI crawler (JSON API)
  - Crates.io crawler (sparse index)
  - Maven Central crawler

#### Graph Writer (`apps/graph-writer/`)
- [ ] **A1.6** Kompletirati graph upsert logiku
  - Batch upsert za Package/Version čvorove
  - Dependency edge creation sa verzijskim opsezima
  - Conflict resolution strategy

#### Vector Writer (`apps/vector-writer/`)
- [ ] **A1.7** Embedding Generation
  - Integracija sa embedding modelom (OpenAI/local)
  - Batch processing za efikasnost
  - Qdrant upsert sa metadata

---

### 1.2 Robusna Obrada Grešaka

- [ ] **A2.1** Eliminisati sve `unwrap()` pozive
  ```rust
  // LOŠE:
  let port = env::var("PORT").unwrap();
  
  // DOBRO:
  let port = env::var("PORT")
      .context("PORT environment variable not set")?;
  ```
  
  Fajlovi za proveru:
  - [ ] `apps/api/src/main.rs`
  - [ ] `apps/api/src/config.rs`
  - [ ] `apps/ingest/src/main.rs`
  - [ ] `apps/analysis/src/main.rs`
  - [ ] `apps/graph-writer/src/main.rs`

- [ ] **A2.2** Implementirati custom Error tipove
  - `ApiError` enum sa HTTP status mapiranjem
  - `IngestError` za registry failures
  - `AnalysisError` za parsing failures
  - Koristiti `thiserror` crate

- [ ] **A2.3** Structured Logging
  - Dodati `tracing` spans za sve operacije
  - Error context sa stack traces
  - Request ID propagation

---

## 🔴 FAZA 2: Testiranje (Sprint 2-3)

### 2.1 Unit Testovi

#### API Testovi
- [ ] **T1.1** GraphQL Query testovi
  ```rust
  #[tokio::test]
  async fn test_package_query() {
      let schema = create_test_schema();
      let query = "{ package(id: \"cargo:serde\") { name ecosystem } }";
      let result = schema.execute(query).await;
      assert!(result.errors.is_empty());
  }
  ```
  - [ ] `package` query
  - [ ] `reverseDependents` query
  - [ ] `dependencyPath` query
  - [ ] `impactRadius` query
  - [ ] `searchPackages` query
  - [ ] `graphStats` query

- [ ] **T1.2** GraphQL Mutation testovi (ako postoje)

- [ ] **T1.3** Rate limiting testovi
  - Verify 429 response after limit
  - Reset after window

#### Analysis Testovi
- [ ] **T1.4** Breaking change detection testovi
  - Test: removed public function
  - Test: changed function signature
  - Test: removed struct field
  - Test: changed visibility

- [ ] **T1.5** Parser testovi
  - Test parsing za svaki podržani jezik
  - Test malformed input handling

#### Graph Testovi
- [ ] **T1.6** Cypher query testovi
  - Test query generation
  - Test parameter escaping (SQL injection prevention)

### 2.2 Integration Testovi

- [ ] **T2.1** End-to-end flow test
  ```
  Registry Event → Ingest → Kafka → Graph Writer → API Query
  ```

- [ ] **T2.2** Database integration testovi
  - Memgraph container za testove
  - Test complex graph queries
  - Test transaction rollback

- [ ] **T2.3** Kafka integration testovi
  - Mock Kafka sa `testcontainers`
  - Test message serialization/deserialization
  - Test consumer group rebalancing

### 2.3 Test Infrastructure

- [ ] **T3.1** Test fixtures
  - Sample package data (JSON)
  - Sample dependency graphs
  - Breaking change examples

- [ ] **T3.2** Test utilities
  - `TestContext` struct sa mock services
  - Database seeding helpers
  - Assertion helpers za GraphQL responses

---

## 🔴 FAZA 3: Sigurnost (Sprint 3-4)

### 3.1 Autentifikacija & Autorizacija

- [ ] **S1.1** JWT Authentication
  ```rust
  // middleware/auth.rs
  pub async fn jwt_auth(
      req: Request,
      next: Next,
  ) -> Result<Response, AuthError> {
      let token = extract_bearer_token(&req)?;
      let claims = validate_jwt(token)?;
      // ...
  }
  ```

- [ ] **S1.2** Role-based access control
  - `read:packages` - basic queries
  - `write:packages` - mutations
  - `admin:*` - full access

- [ ] **S1.3** API Key support (za service-to-service)

### 3.2 Input Validation & Sanitization

- [ ] **S2.1** GraphQL Query Complexity Limiting
  ```rust
  let schema = Schema::build(Query, Mutation, Subscription)
      .limit_complexity(1000)
      .limit_depth(12)
      .finish();
  ```

- [ ] **S2.2** Cypher Injection Prevention
  - Audit svih GraphQueries metoda
  - Koristiti parametrizovane upite
  - Input validation za package IDs

- [ ] **S2.3** Rate Limiting Implementation
  - Per-IP limiting
  - Per-user limiting (authenticated)
  - Configurable limits

### 3.3 Secure Connections

- [ ] **S3.1** TLS za Memgraph
  ```yaml
  # docker-compose.yml
  memgraph:
    environment:
      - --bolt-cert-file=/certs/server.crt
      - --bolt-key-file=/certs/server.key
  ```

- [ ] **S3.2** TLS za Qdrant

- [ ] **S3.3** mTLS za inter-service communication

- [ ] **S3.4** CORS Configuration
  ```rust
  let cors = CorsLayer::new()
      .allow_origin(["https://yourdomain.com".parse().unwrap()])
      .allow_methods([Method::GET, Method::POST])
      .allow_headers([CONTENT_TYPE, AUTHORIZATION]);
  ```

### 3.4 Secrets Management

- [ ] **S4.1** Migrate from env vars to secrets
  - HashiCorp Vault integration ili
  - Kubernetes Secrets
  - AWS Secrets Manager

---

## 🟠 FAZA 4: CI/CD Pipeline (Sprint 4-5)

### 4.1 GitHub Actions Workflows

- [ ] **C1.1** `.github/workflows/ci.yml`
  ```yaml
  name: CI
  on: [push, pull_request]
  jobs:
    test:
      runs-on: ubuntu-latest
      services:
        memgraph:
          image: memgraph/memgraph:latest
        redpanda:
          image: redpandadata/redpanda:latest
      steps:
        - uses: actions/checkout@v4
        - uses: dtolnay/rust-toolchain@stable
        - run: cargo test --all
        - run: cargo clippy -- -D warnings
        - run: cargo fmt --check
  ```

- [ ] **C1.2** Frontend CI
  ```yaml
  frontend:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run build
      - run: npm run test
  ```

- [ ] **C1.3** E2E Tests workflow
  ```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - run: docker-compose up -d
      - run: npx playwright test
  ```

### 4.2 Code Quality

- [ ] **C2.1** Clippy configuration
  ```toml
  # .clippy.toml
  cognitive-complexity-threshold = 25
  ```

- [ ] **C2.2** Rustfmt configuration
  ```toml
  # rustfmt.toml
  edition = "2021"
  max_width = 100
  use_small_heuristics = "Max"
  ```

- [ ] **C2.3** Pre-commit hooks
  ```yaml
  # .pre-commit-config.yaml
  repos:
    - repo: local
      hooks:
        - id: cargo-fmt
        - id: cargo-clippy
        - id: cargo-test
  ```

### 4.3 Deployment Pipeline

- [ ] **C3.1** Docker image builds
  - Multi-stage builds za manje images
  - Cache optimization
  - Security scanning (trivy)

- [ ] **C3.2** Kubernetes manifests
  ```
  k8s/
  ├── base/
  │   ├── api-deployment.yaml
  │   ├── api-service.yaml
  │   ├── ingest-deployment.yaml
  │   └── ...
  └── overlays/
      ├── dev/
      ├── staging/
      └── production/
  ```

- [ ] **C3.3** Helm charts (alternativa)

---

## 🟠 FAZA 5: Frontend & UX Poboljšanja (Sprint 5-7)

### 5.1 Vizualizacija Grafa

- [ ] **F1.1** 3D Graph sa Babylon.js/WebGPU
  ```typescript
  // components/graph/Graph3D.tsx
  - Force-directed layout
  - Node coloring by ecosystem
  - Edge thickness by dependency count
  - Zoom/pan/rotate controls
  - Click to select node
  ```

- [ ] **F1.2** 2D Fallback sa Cytoscape.js
  - Za browsere bez WebGPU
  - Automatic detection
  - Same interaction patterns

- [ ] **F1.3** Graph Controls
  - Depth slider (1-5 levels)
  - Ecosystem filter checkboxes
  - Layout algorithm selector
  - Export as PNG/SVG

### 5.2 Search & Discovery

- [ ] **F2.1** Advanced Autocomplete
  ```typescript
  // Debounced search sa fuzzy matching
  - Recent searches
  - Popular packages
  - Ecosystem icons
  - Version badges
  ```

- [ ] **F2.2** Filter Panel
  - Ecosystem multi-select
  - Date range (published)
  - Dependency count range
  - Has breaking changes toggle

- [ ] **F2.3** Search Results Page
  - Paginated results
  - Sort options (name, popularity, date)
  - Quick actions (view graph, compare)

### 5.3 Package Detail View

- [ ] **F3.1** Overview Tab
  - Package info card
  - Version history timeline
  - Dependency count badges
  - External links (registry, repo)

- [ ] **F3.2** Dependencies Tab
  - Direct dependencies list
  - Transitive dependencies tree
  - Version constraint display

- [ ] **F3.3** Dependents Tab
  - Reverse dependencies list
  - Impact radius visualization
  - "Who uses this?" statistics

- [ ] **F3.4** Versions Tab
  - Version list with dates
  - Breaking change indicators
  - Diff between versions

### 5.4 Real-time Features

- [ ] **F4.1** Live Updates via WebSocket
  ```typescript
  // hooks/useVersionSubscription.ts
  const { data } = useSubscription(VERSION_EVENTS, {
    variables: { ecosystems: ['CARGO', 'NPM'] }
  });
  ```

- [ ] **F4.2** Notification Center
  - New version alerts
  - Breaking change warnings
  - Favorite package updates

- [ ] **F4.3** Activity Feed
  - Recent events across all ecosystems
  - Filterable by type
  - Infinite scroll

### 5.5 Accessibility & Performance

- [ ] **F5.1** Accessibility Audit
  - ARIA labels
  - Keyboard navigation
  - Screen reader support
  - Color contrast (WCAG AA)

- [ ] **F5.2** Performance Optimization
  - React Query caching
  - Virtual scrolling za liste
  - Image lazy loading
  - Bundle size analysis

- [ ] **F5.3** Responsive Design
  - Mobile-first approach
  - Tablet optimizations
  - Touch-friendly controls

### 5.6 E2E Frontend Tests

- [ ] **F6.1** Playwright test suite
  ```typescript
  test('search for package', async ({ page }) => {
    await page.goto('/explore');
    await page.fill('[data-testid="search-input"]', 'tokio');
    await page.click('[data-testid="search-button"]');
    await expect(page.locator('.package-card')).toHaveCount.greaterThan(0);
  });
  ```

---

## 🟡 FAZA 6: Skalabilnost & Performance (Sprint 7-9)

### 6.1 Memgraph Optimization

- [ ] **P1.1** Index optimization
  ```cypher
  CREATE INDEX ON :Package(id);
  CREATE INDEX ON :Package(name);
  CREATE INDEX ON :Package(ecosystem);
  CREATE INDEX ON :Version(id);
  CREATE INDEX ON :Version(publishedAt);
  ```

- [ ] **P1.2** Query optimization
  - EXPLAIN ANALYZE za slow queries
  - Query plan caching
  - Batch operations

- [ ] **P1.3** Memgraph Clustering
  - Replication setup
  - SYNC replikacija za HA
  - Failover testing

### 6.2 Qdrant Optimization

- [ ] **P2.1** Quantization configuration
  ```json
  {
    "quantization_config": {
      "scalar": {
        "type": "int8",
        "quantile": 0.99
      }
    }
  }
  ```

- [ ] **P2.2** Sharding strategy
  - Automatic sharding
  - Shard rebalancing

- [ ] **P2.3** Evaluate Memgraph Vector Index
  - Test performanse vs Qdrant
  - Možda eliminisati Qdrant

### 6.3 Kafka/Redpanda Tuning

- [ ] **P3.1** Partition strategy
  - Partition by ecosystem
  - Consumer group configuration

- [ ] **P3.2** Compression
  - Enable LZ4 compression
  - Batch size tuning

### 6.4 Caching Layer

- [ ] **P4.1** Redis/Valkey integration
  - Query result caching
  - Session caching
  - Rate limit counters

- [ ] **P4.2** Cache invalidation strategy
  - TTL-based
  - Event-based invalidation

### 6.5 Load Testing

- [ ] **P5.1** k6 load test scripts
  ```javascript
  // loadtest/graphql-queries.js
  import http from 'k6/http';
  
  export const options = {
    vus: 100,
    duration: '5m',
    thresholds: {
      http_req_duration: ['p(95)<500'],
    },
  };
  ```

- [ ] **P5.2** Baseline metrics
  - Document current latencies
  - Set performance targets
  - Track regressions

---

## 🟡 FAZA 7: Dokumentacija (Sprint 8-9)

### 7.1 API Dokumentacija

- [ ] **D1.1** OpenAPI/Swagger za REST endpoints

- [ ] **D1.2** GraphQL Schema Documentation
  ```graphql
  """
  Retrieves a package by its unique identifier.
  
  @param id - Package ID in format `ecosystem:name`
  @returns Package object or null if not found
  """
  type Query {
    package(id: ID!): Package
  }
  ```

- [ ] **D1.3** Interactive GraphQL Playground
  - Sample queries
  - Variable examples

### 7.2 Developer Documentation

- [ ] **D2.1** Architecture Decision Records (ADRs)
  ```markdown
  # ADR-001: Choice of Memgraph over Neo4j
  
  ## Status: Accepted
  
  ## Context
  We needed a graph database optimized for...
  
  ## Decision
  We chose Memgraph because...
  ```

- [ ] **D2.2** Development Setup Guide
  - Prerequisites
  - Local setup steps
  - Troubleshooting

- [ ] **D2.3** Contributing Guide
  - Code style
  - PR process
  - Review guidelines

### 7.3 User Documentation

- [ ] **D3.1** User Guide
  - Getting started
  - Feature tutorials
  - FAQ

- [ ] **D3.2** API Client Examples
  - cURL examples
  - JavaScript/TypeScript
  - Python
  - Rust

---

## 🟢 FAZA 8: Monitoring & Observability (Sprint 9-10)

### 8.1 Metrics

- [ ] **M1.1** Prometheus metrics
  ```rust
  // metrics.rs
  static QUERY_DURATION: Lazy<Histogram> = Lazy::new(|| {
      register_histogram!(
          "graphql_query_duration_seconds",
          "Duration of GraphQL queries"
      ).unwrap()
  });
  ```

- [ ] **M1.2** Grafana dashboards
  - API latency
  - Error rates
  - Kafka lag
  - Database connections

### 8.2 Tracing

- [ ] **M2.1** Jaeger integration
  - Distributed tracing
  - Span context propagation
  - Service maps

### 8.3 Alerting

- [ ] **M3.1** Alert rules
  - High error rate
  - Slow queries
  - Kafka consumer lag
  - Database connection failures

---

## 🟢 FAZA 9: Benchmarking & Competitive Analysis (Sprint 10)

### 9.1 Performance Benchmarks

- [ ] **B1.1** Query benchmarks
  | Query Type | Target | Current |
  |------------|--------|---------|
  | package lookup | <50ms | TBD |
  | reverseDependents (depth=2) | <200ms | TBD |
  | dependencyPath | <500ms | TBD |
  | impactRadius | <1s | TBD |

- [ ] **B1.2** Throughput benchmarks
  - Ingestion rate (packages/sec)
  - Query rate (QPS)
  - Concurrent users

### 9.2 Competitive Comparison

- [ ] **B2.1** Feature matrix
  | Feature | Ours | deps.dev | Snyk | Sonatype |
  |---------|------|----------|------|----------|
  | Real-time | ✅ | ❌ | ❌ | ❌ |
  | Graph viz | ✅ | ⚠️ | ✅ | ✅ |
  | API access | ✅ | ✅ | 💰 | 💰 |

---

## 📋 Quick Reference

### Priority Matrix

```
                    URGENCY
              High          Low
         ┌─────────────┬─────────────┐
    High │ FAZA 1-3    │ FAZA 6-7    │
IMPACT   │ (Do First)  │ (Schedule)  │
         ├─────────────┼─────────────┤
    Low  │ FAZA 4-5    │ FAZA 8-9    │
         │ (Delegate)  │ (Consider)  │
         └─────────────┴─────────────┘
```

### Estimated Timeline

| Faza | Sprints | Weeks | Status |
|------|---------|-------|--------|
| 1. Kritične Implementacije | 1-2 | 4 | 🔴 Not Started |
| 2. Testiranje | 2-3 | 4 | 🔴 Not Started |
| 3. Sigurnost | 3-4 | 4 | 🔴 Not Started |
| 4. CI/CD | 4-5 | 3 | 🟠 Not Started |
| 5. Frontend/UX | 5-7 | 6 | 🟠 In Progress |
| 6. Skalabilnost | 7-9 | 4 | 🟡 Not Started |
| 7. Dokumentacija | 8-9 | 3 | 🟡 Partial |
| 8. Monitoring | 9-10 | 3 | 🟢 Not Started |
| 9. Benchmarking | 10 | 2 | 🟢 Not Started |

**Total: ~33 weeks (8 months)**

---

## 🎯 Next Actions

1. [ ] **ODMAH**: Početi sa FAZA 1 - Analysis Service TODO-ovi
2. [ ] **OVA NEDELJA**: Setup basic unit tests infrastructure
3. [ ] **OVAJ SPRINT**: Eliminate all unwrap() calls
4. [ ] **SLEDEĆI SPRINT**: JWT Authentication implementation

---

*Poslednje ažuriranje: 2. Januar 2026*
