# Inverse Dependencies Platform - Kompletan Roadmap

## 📋 Uvod

Projekat: **Real-time Dependency Graph Analysis Platform**  
Cilj: Analiza 100M+ paketa u realnom vremenu sa detektovanjem breaking changes-a  
Timeline: 14 nedelja (do 31. marta 2026)  
Status: Planiranje → Implementacija  

---

## 🔧 Verified Technology Stack (Januar 2026)

### Event Streaming & Message Queue
| Tehnologija | Verzija | Status | Release Date | Use Case |
|-------------|---------|--------|--------------|----------|
| **Redpanda** | v25.3.4 | Latest Stable | Jan 2026 (last week) | Event streaming, Kafka-compatible |
| Apache Kafka | Current | Legacy | N/A | Fallback option |

**Redpanda v25.3.4 Features:**
- Kafka-compatible protocol
- Shadow Linking za disaster recovery
- Tiered storage sa S3-compatible backends
- 10x brža od Kafke (marketing claim)
- Schema Registry compatibility
- Grafana dashboard generation

### Real-Time Stream Processing
| Tehnologija | Verzija | Status | Release Date | Use Case |
|-------------|---------|--------|--------------|----------|
| **RisingWave** | v2.7.0 | Latest Stable | 2 weeks ago | Stream processing, transformations |
| Apache Flink | Current | Legacy | N/A | Fallback option |

**RisingWave v2.7.0 Features:**
- Vector index sa Top-N lookups u streaming queries
- Paralelni PostgreSQL CDC backfill
- Native Apache Iceberg integration
- Sub-100ms latency za agregacije
- ALTER FRAGMENT PARALLELISM za dinamiku resursa
- LOAD PARQUET direktna podrška
- Redshift/Snowflake v2 sink connectors

### Graph Database & Knowledge Base
| Tehnologija | Verzija | Status | Release Date | Use Case |
|-------------|---------|--------|--------------|----------|
| **Memgraph** | v3.7.2 | Latest Stable | Dec 23, 2025 | Dependency graph, knowledge base |
| TigerGraph | v5.x | Alternative | N/A | Fallback za scaling |

**Memgraph v3.7.2 Features:**
- Built-in vector search (bez zasebne aplikacije)
- Parallel schema recovery (brži startup sa velikim indeksima)
- Fine-grained edge permissions (breaking change iz v3.6)
- Snapshots na replikama za distributed recovery
- STRICT_SYNC replication mode za zero-data-loss HA
- Cypher query language (Neo4j compatible subset)
- Full-text indexing na text properties
- Non-blocking index creation
- LOAD PARQUET FROM /path/to/file.parquet
- SSO sa self-signed certificates

**Breaking Change iz v3.7.1:**
```cypher
// OLD (v3.6):
REVOKE MANAGE_CREATE ON EDGE FROM user;

// NEW (v3.7.1+):
REVOKE MANAGE_CREATE ON EDGE FROM user, other_user;
```

### Vector Database & Semantic Search
| Tehnologija | Verzija | Status | Release Date | Use Case |
|-------------|---------|--------|--------------|----------|
| **Qdrant** | v1.16.3 | Latest Stable | 2 weeks ago | Vector search, embeddings |

**Qdrant v1.16.3 Features:**
- RocksDB → Gridstore migration complete
- Inline HNSW storage (efficient IO)
- ACORN-1 search algorithm (accurate over filtered subsets)
- AVX512 SIMD optimizations za binary quantization
- Conditional updates (primeni ako filter match-a)
- Tiered multitenancy sa tenant promotion
- <10ms latency achievable sa proper tuning
- Quantization enabled by default u appendable segments
- ASCII folding za full-text search

**Critical Bugfix v1.16.2:**
- WAL corruption breaking consensus/data persistence
- Must upgrade iz v1.16.1

### GPU-Accelerated Graph Computing
| Tehnologija | Verzija | Status | Release Date | Use Case |
|-------------|---------|--------|--------------|----------|
| **RAPIDS cuGraph** | v25.12.02 | Latest Stable | 3 weeks ago | Graph algorithms, GPU acceleration |

**cuGraph v25.12.02 Features:**
- Requires CUDA 12.2+ (breaking change enforced)
- Spectral clustering (production-ready)
- Temporal sampling APIs
- Distributed sampling sa metadata specification
- Fixed: sample result destructor hotfix
- PyTorch Geometric compatible
- Betweenness centrality performance improvements
- GNN workload support

### Code Analysis & Breaking Change Detection
| Tehnologija | Verzija | Status | Use Case |
|-------------|---------|--------|----------|
| **Tree-sitter** | 0.23+ | Stable | AST parsing, heuristic detection |

**Tree-sitter Features:**
- 50+ language support
- Fast incremental parsing
- Memoization optimization available
- Baseline za heuristic breaking change detection

### Backend & API Framework
| Tehnologija | Verzija | Status | Use Case |
|-------------|---------|--------|----------|
| **Rust/Axum** | Latest | Stable | API server, high-performance |
| **Tokio** | 1.x | Stable | Async runtime |
| **Serde** | Latest | Stable | Serialization/deserialization |

### Frontend & Visualization
| Tehnologija | Verzija | Status | Use Case |
|-------------|---------|--------|----------|
| **React** | 18.x+ | Latest | UI framework |
| **Babylon.js** | 7.x | Latest | 3D WebGPU visualization |
| **D3.js/Visx** | Latest | Stable | 2D fallback visualization |
| **Cytoscape.js** | Latest | Stable | Standard graph visualization |
| **TailwindCSS** | 3.x+ | Latest | Styling |

### Infrastructure & Persistence
| Tehnologija | Verzija | Status | Use Case |
|-------------|---------|--------|----------|
| **PostgreSQL** | 15+ | Stable | Metadata store |
| **Redis** | 7+ | Stable | Caching, sessions |
| **Kubernetes** | 1.31+ | Current | Container orchestration |
| **Istio** | 1.23+ | Current | Service mesh |
| **Helm** | 4.x | Current | Package management |
| **ArgoCD** | Latest | Current | GitOps deployment |

### Observability Stack
| Tehnologija | Verzija | Status | Use Case |
|-------------|---------|--------|----------|
| **Prometheus** | 2.5x+ | Current | Metrics collection |
| **Grafana** | Latest | Current | Dashboards |
| **Jaeger/Tempo** | Latest | Current | Distributed tracing |
| **Loki** | Latest | Current | Log aggregation |

### Future ML Components (Phase 2.2+)
| Tehnologija | Model | Status | Use Case |
|-------------|-------|--------|----------|
| **CodeLlama** | 34B | Planning | Breaking change semantic analysis |
| **vLLM** | - | Planning | Inference serving |
| **UnSloth** | - | Optional | Faster fine-tuning |

---

## 📊 Memgraph Graph Model (Cypher)

### Node Types

```cypher
// Package node
(:Package {
  id: "npm:react",
  name: "react",
  ecosystem: "npm",
  url: "https://npmjs.com/package/react",
  created_at: 1234567890,
  maintainers: ["dan_abramov", "facebook"]
})

// Version node
(:Version {
  id: "npm:react:18.2.0",
  package_id: "npm:react",
  version: "18.2.0",
  released_at: 1234567890,
  checksum: "sha256:...",
  size_bytes: 12345,
  downloads_per_month: 50000000
})

// Breaking change node
(:BreakingChange {
  id: "bc:npm:react:18.2.0:001",
  version_id: "npm:react:18.2.0",
  type: "API_REMOVAL",
  title: "Removed deprecated findDOMNode API",
  description: "findDOMNode was deprecated in v16 and is now removed",
  severity: 0.95,
  confidence_score: 0.88,
  detected_at: 1234567890,
  manual_verified: true,
  detection_method: "AST_DIFF"
})

// Developer node
(:Developer {
  id: "dev:dan_abramov",
  username: "dan_abramov",
  full_name: "Dan Abramov",
  email: "dan@example.com",
  github_profile: "https://github.com/gaearon"
})

// Ecosystem node
(:Ecosystem {
  id: "npm",
  name: "npm",
  registry_url: "https://registry.npmjs.org",
  package_count: 2100000
})
```

### Edge Types

```cypher
// Dependency edge
(Package)-[:DEPENDS_ON {
  version_range: "^18.0.0",
  is_dev_dependency: false,
  is_optional: false,
  created_at: 1234567890
}]->(Package)

// Breaking change relation
(BreakingChange)-[:BREAKING_CHANGE_IN]->(Version)

// Impact tracking
(BreakingChange)-[:AFFECTS_VERSION {
  impacted_count: 450000,
  severity_score: 0.88,
  calculated_at: 1234567890
}]->(Version)

// Developer maintains
(Developer)-[:MAINTAINS {
  since: 1234567890,
  contributions: 5000
}]->(Package)

// Package belongs to ecosystem
(Package)-[:BELONGS_TO]->(Ecosystem)
```

### Indexes for Performance

```cypher
CREATE INDEX ON :Package(ecosystem, name);
CREATE INDEX ON :Version(package_id, version);
CREATE INDEX ON :BreakingChange(version_id, severity);
CREATE VECTOR_INDEX breaking_change_embeddings ON :BreakingChange(embedding) 
  WITH DIMENSION 1536;
CREATE FULL_TEXT INDEX breaking_change_descriptions ON :BreakingChange(description);
```

---

## 🌊 RisingWave Streaming Topology (SQL)

### Topics & Sources

```sql
-- Create Redpanda topics (Kafka-compatible)
-- Topics created via Redpanda CLI:
-- rpk topic create package-published
-- rpk topic create dependency-updated
-- rpk topic create breaking-changes-raw

-- Create sources in RisingWave
CREATE SOURCE package_published (
  package_id VARCHAR,
  name VARCHAR,
  ecosystem VARCHAR,
  version VARCHAR,
  license VARCHAR,
  repository_url VARCHAR,
  created_at TIMESTAMP
) WITH (
  connector = 'kafka',
  properties.bootstrap.servers = 'redpanda:29092',
  topic = 'package-published'
) FORMAT JSON;

CREATE SOURCE dependency_updated (
  dependent_id VARCHAR,
  dependent_version VARCHAR,
  dependency_id VARCHAR,
  dependency_version_range VARCHAR,
  is_dev_dependency BOOLEAN,
  updated_at TIMESTAMP
) WITH (
  connector = 'kafka',
  properties.bootstrap.servers = 'redpanda:29092',
  topic = 'dependency-updated'
) FORMAT JSON;

CREATE SOURCE breaking_changes_raw (
  package_id VARCHAR,
  version VARCHAR,
  breaking_change_id VARCHAR,
  change_type VARCHAR,
  title VARCHAR,
  description VARCHAR,
  confidence_score FLOAT,
  detected_at TIMESTAMP
) WITH (
  connector = 'kafka',
  properties.bootstrap.servers = 'redpanda:29092',
  topic = 'breaking-changes-raw'
) FORMAT JSON;
```

### Materialized Views (Real-Time Aggregations)

```sql
-- MV: Breaking changes sa high confidence
CREATE MATERIALIZED VIEW breaking_changes_stream AS
SELECT
  breaking_change_id,
  package_id,
  version,
  change_type,
  title,
  description,
  confidence_score,
  detected_at,
  NOW() as ingested_at
FROM breaking_changes_raw
WHERE confidence_score > 0.8
  AND detected_at > NOW() - INTERVAL '30 days';

-- MV: Impacted packages (downstream analysis)
CREATE MATERIALIZED VIEW impacted_packages AS
SELECT
  bc.package_id as breaking_change_package,
  d.dependent_id as impacted_package,
  COUNT(*) as breaking_change_count,
  MAX(bc.confidence_score) as max_severity,
  AVG(bc.confidence_score) as avg_severity,
  MAX(bc.detected_at) as latest_detection
FROM breaking_changes_stream bc
JOIN dependency_updated d 
  ON bc.package_id = d.dependency_id
  AND bc.version OVERLAPS d.dependency_version_range
GROUP BY bc.package_id, d.dependent_id;

-- MV: Package version tracking
CREATE MATERIALIZED VIEW package_version_tracking AS
SELECT
  package_id,
  version,
  COUNT(*) as total_dependents,
  MAX(created_at) as released_at,
  ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY created_at DESC) as version_rank
FROM package_published
GROUP BY package_id, version;

-- MV: Real-time impact propagation
CREATE MATERIALIZED VIEW impact_propagation AS
WITH RECURSIVE impact_chain AS (
  -- Base: Direct breaking changes
  SELECT
    bc.package_id as source_package,
    d.dependent_id as impacted_package,
    1 as hop_distance,
    bc.confidence_score,
    ARRAY[bc.package_id, d.dependent_id] as chain
  FROM breaking_changes_stream bc
  JOIN dependency_updated d ON bc.package_id = d.dependency_id
  
  UNION ALL
  
  -- Recursive: Transitive impacts
  SELECT
    ic.source_package,
    d.dependent_id,
    ic.hop_distance + 1,
    ic.confidence_score * 0.95,
    ic.chain || d.dependent_id
  FROM impact_chain ic
  JOIN dependency_updated d ON ic.impacted_package = d.dependency_id
  WHERE ic.hop_distance < 5
    AND ic.confidence_score * 0.95 > 0.3
)
SELECT
  source_package,
  impacted_package,
  hop_distance,
  confidence_score,
  chain,
  NOW() as calculated_at
FROM impact_chain;
```

### Sinks (Data Export)

```sql
-- Export breaking changes to Memgraph
CREATE SINK breaking_changes_to_memgraph AS
SELECT
  breaking_change_id,
  package_id,
  version,
  change_type,
  title,
  description,
  confidence_score,
  detected_at
FROM breaking_changes_stream
WITH (
  connector = 'jdbc',
  jdbc.driver.name = 'org.memgraph.Driver',
  jdbc.url = 'jdbc:memgraph://memgraph:7687',
  table = 'breaking_changes'
);

-- Export impact scores to Memgraph
CREATE SINK impact_scores_to_memgraph AS
SELECT
  breaking_change_package,
  impacted_package,
  breaking_change_count,
  max_severity,
  avg_severity,
  latest_detection
FROM impacted_packages
WITH (
  connector = 'jdbc',
  jdbc.driver.name = 'org.memgraph.Driver',
  jdbc.url = 'jdbc:memgraph://memgraph:7687',
  table = 'impact_scores'
);
```

---

## 🔌 REST API Specifikacija (Rust Axum)

### Endpoints Architecture

```
Base URL: https://api.inverse-deps.io/v1
Authentication: Bearer JWT Token
Rate Limit: 1000 requests/min (Pro tier)
```

### Package Endpoints

```http
GET /api/v1/packages/{package_name}
Description: Retrieve package metadata and statistics
Path Parameters:
  - package_name: "react" | "numpy" | "spring-boot"
Query Parameters:
  - ecosystem: "npm" | "pypi" | "maven" | "cargo" (optional)
  - include_stats: boolean (default: true)

Response: 200 OK
{
  "id": "npm:react",
  "name": "react",
  "ecosystem": "npm",
  "url": "https://npmjs.com/package/react",
  "maintainers": ["dan_abramov", "facebook"],
  "total_versions": 143,
  "current_version": "18.2.0",
  "downloads_per_month": 50000000,
  "breaking_changes_count": 12,
  "dependents_count": 2400000,
  "risk_score": 0.45,
  "last_updated": "2025-12-28T14:22:00Z"
}
```

```http
GET /api/v1/packages/{package_name}/versions/{version}
Description: Get specific version details and breaking changes
Path Parameters:
  - package_name: string
  - version: "18.2.0" | "^18.0.0"

Response: 200 OK
{
  "id": "npm:react:18.2.0",
  "package_id": "npm:react",
  "version": "18.2.0",
  "released_at": "2025-12-20T10:15:00Z",
  "size_bytes": 12345,
  "downloads": 50000000,
  "breaking_changes": [
    {
      "id": "bc:001",
      "type": "API_REMOVAL",
      "title": "Removed findDOMNode",
      "description": "...",
      "severity": 0.95,
      "confidence": 0.88,
      "manual_verified": true
    }
  ],
  "dependencies": [
    {
      "id": "npm:react-dom:^18.0.0",
      "version_range": "^18.0.0",
      "is_dev_dependency": false
    }
  ]
}
```

```http
GET /api/v1/packages/{package_name}/reverse-deps
Description: What packages depend on this one
Query Parameters:
  - limit: 100
  - offset: 0
  - sort_by: "downloads" | "dependents" | "risk" (default: dependents)

Response: 200 OK
{
  "source_package": "npm:react",
  "dependents_count": 2400000,
  "top_dependents": [
    {
      "package_id": "npm:next",
      "dependents_count": 500000,
      "affected_by_breaking_changes": 3,
      "max_severity": 0.95,
      "install_count": 45000000
    }
  ]
}
```

```http
GET /api/v1/breaking-changes/{change_id}
Description: Detailed breaking change information
Path Parameters:
  - change_id: string

Response: 200 OK
{
  "id": "bc:npm:react:18.2.0:001",
  "package_id": "npm:react",
  "version": "18.2.0",
  "type": "API_REMOVAL",
  "title": "Removed deprecated findDOMNode API",
  "description": "The findDOMNode method...",
  "severity": 0.95,
  "confidence": 0.88,
  "detection_method": "AST_DIFF",
  "manual_verified": true,
  "impacted_packages": 450000,
  "migration_guide": "https://...",
  "related_issue": "https://github.com/facebook/react/issues/...",
  "detected_at": "2025-12-20T14:22:00Z"
}
```

```http
POST /api/v1/analyze/impact
Description: What-if analysis - impact of breaking change
Request Body:
{
  "package_id": "npm:react",
  "version": "19.0.0",
  "assume_breaking_changes": [
    {
      "type": "API_REMOVAL",
      "title": "Remove legacy Context API"
    }
  ]
}

Response: 200 OK
{
  "source_package": "npm:react",
  "scenario_version": "19.0.0",
  "estimated_impacted": 1200000,
  "severity_distribution": {
    "critical": 120000,
    "high": 450000,
    "medium": 630000
  },
  "top_affected_packages": [
    {
      "package": "npm:redux",
      "estimated_impacted_dependents": 200000
    }
  ],
  "calculated_at": "2025-12-28T14:22:00Z"
}
```

```http
GET /api/v1/search/packages
Description: Full-text + semantic search across packages
Query Parameters:
  - q: string (required)
  - type: "name" | "description" | "breaking_changes" (default: all)
  - ecosystem: "npm" | "pypi" | "maven" | "cargo" (optional)
  - limit: 50
  - offset: 0

Response: 200 OK
{
  "query": "state management",
  "results_count": 1250,
  "results": [
    {
      "id": "npm:redux",
      "name": "redux",
      "ecosystem": "npm",
      "match_type": "semantic",
      "score": 0.98,
      "summary": "Predictable state container..."
    }
  ]
}
```

---

## 🏗️ Arhitektura Komponenti

### Sistem Komponenti

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND LAYER                           │
│  React 18.x + Babylon.js 7.x (3D) + D3.js (2D)             │
│  - Dashboard za breaking changes                            │
│  - Package dependency explorer (100K+ nodes @ 60fps)        │
│  - Impact analyzer (what-if scenarios)                      │
└───────────────────┬─────────────────────────────────────────┘
                    │ HTTP/WebSocket
┌───────────────────▼─────────────────────────────────────────┐
│                    API GATEWAY                              │
│  Rust Axum + Tokio + GraphQL                               │
│  - Request routing                                          │
│  - JWT authentication                                       │
│  - Rate limiting                                            │
│  - Response caching (Redis)                                 │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┬──────────────┐
        │           │           │              │
   ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌─────▼──────┐
   │Memgraph │ │Qdrant  │ │Redis   │ │PostgreSQL  │
   │(Graph)  │ │(Vector)│ │(Cache) │ │(Metadata)  │
   └────┬────┘ └────┬───┘ └────┬───┘ └─────┬──────┘
        │           │           │          │
        └───────────┼───────────┴──────────┘
                    │
        ┌───────────▼────────────┐
        │  INGESTION PIPELINE    │
        │                        │
        │  RisingWave (Stream)   │
        │  - Transformations     │
        │  - Aggregations        │
        │  - MVs (Real-time)     │
        └───────────┬────────────┘
                    │
        ┌───────────▼────────────┐
        │  DETECTION ENGINE      │
        │                        │
        │  Tree-sitter (AST)     │
        │  - Breaking change     │
        │  - Confidence scoring  │
        │  - Heuristics          │
        └───────────┬────────────┘
                    │
        ┌───────────▼────────────┐
        │  MESSAGE BROKER        │
        │                        │
        │  Redpanda v25.3.4      │
        │  (Kafka-compatible)    │
        └───────────┬────────────┘
                    │
        ┌───────────▼────────────┐
        │  EXTERNAL DATA SOURCES │
        │                        │
        │  npm Registry          │
        │  PyPI Registry         │
        │  Maven Central         │
        │  Cargo.io              │
        └────────────────────────┘
```

---

## 📅 Implementation Timeline (14 Nedelje)

### Faza 1: Infrastructure & Data Foundation (Nedelje 1-3)

#### Week 1-2: Development Environment Setup
- [ ] Create GitHub monorepo structure
  - `/apps` - Microservices (api, ingestion, detection)
  - `/packages` - Shared libraries (types, utils, clients)
  - `/services` - Infrastructure components
  - `/infra` - Kubernetes manifests
  
- [ ] Docker Compose environment
  - Redpanda v25.3.4 (3-node cluster)
  - RisingWave v2.7.0 (development setup)
  - Memgraph v3.7.2 (main + 2 replicas)
  - Qdrant v1.16.3
  - PostgreSQL 15
  - Redis 7
  - Observability stack (Prometheus, Grafana, Jaeger)

- [ ] CI/CD Pipeline (GitHub Actions)
  - Lint checks (Clippy, Python black, TypeScript ESLint)
  - Unit tests
  - Docker builds
  - Deployment automation

#### Week 3: Schema & Event Definition
- [ ] Event schema design (Protobuf)
  - `PackagePublished` - 12 fields
  - `DependencyUpdated` - 8 fields
  - `BreakingChangeDetected` - 10 fields
  - `ImpactScoreCalculated` - 6 fields

- [ ] Memgraph schema implementation
  - Node creation: Package, Version, BreakingChange, Developer, Ecosystem
  - Edge creation: DEPENDS_ON, BREAKING_CHANGE_IN, AFFECTS_VERSION
  - Index creation (property, full-text, vector)

- [ ] PostgreSQL schema
  - `packages` table
  - `versions` table
  - `breaking_changes` table
  - `impact_scores` table
  - `api_audit_logs` table

**Deliverables:** Running development environment, schema ready for data

---

### Faza 2: Detection & Ingestion Pipeline (Nedelje 4-9)

#### Week 4-5: Tree-sitter Integration & Breaking Change Detection
- [ ] Tree-sitter AST parsing
  - Multi-language support (JavaScript, Python, Java, Rust)
  - AST diff algorithm implementation
  - Function signature change detection
  - API removal detection

- [ ] Heuristic scoring system
  - Confidence scoring (0.0 - 1.0)
  - Change type classification (API_REMOVAL, TYPE_CHANGE, SIGNATURE_CHANGE, BEHAVIOR_CHANGE)
  - Risk assessment matrix

- [ ] Detection pipeline (Rust)
  ```rust
  pub async fn detect_breaking_changes(
    old_ast: &Tree,
    new_ast: &Tree,
    package: &str,
    version: &str
  ) -> Vec<BreakingChange> {
    // Implementation
  }
  ```

#### Week 6-7: RisingWave Pipeline
- [ ] Redpanda topic creation & configuration
  - Topic retention: 30 days
  - Replication factor: 3
  - Partitions: 10
  
- [ ] RisingWave source creation
  - `package_published` source
  - `dependency_updated` source
  - `breaking_changes_raw` source

- [ ] Materialized views implementation
  - `breaking_changes_stream` (confidence > 0.8)
  - `impacted_packages` (downstream count)
  - `package_version_tracking` (latest versions)
  - `impact_propagation` (recursive 5 hops)

- [ ] Data sink to Memgraph
  - JDBC connector configuration
  - Auto-schema mapping
  - Error handling & retries

#### Week 8-9: Package Registry Ingestion
- [ ] npm Registry scraper
  - 2.1M packages (~2TB download)
  - Incremental updates (weekly)
  - Rate limiting: 10 req/s

- [ ] PyPI Registry scraper
  - 500K packages (~500GB)
  - Dependency resolution
  - Version snapshot

- [ ] Maven Central & Cargo.io adapters
  - Maven Central: 50M+ artifacts
  - Cargo.io: 100K+ crates

**Deliverables:** Real-time breaking change detection, 2.6M+ packages ingested

---

### Faza 3: Graph & Algorithm Layer (Nedelje 10-12)

#### Week 10: Memgraph Optimization & Query Tuning
- [ ] Index optimization
  - Query plan analysis
  - Hot path identification
  - Cache warming strategies

- [ ] Cypher query library
  ```cypher
  // Find transitive dependents (up to 3 hops)
  MATCH (bc:BreakingChange)-[:BREAKING_CHANGE_IN]->(v:Version)
        <-[:DEPENDS_ON*1..3]-(impacted:Package)
  RETURN DISTINCT impacted.name, bc.severity
  LIMIT 10000
  ```

#### Week 11: RAPIDS cuGraph Integration
- [ ] GPU setup (CUDA 12.2+ validation)
- [ ] Graph algorithms
  - PageRank (personalized per package)
  - Betweenness Centrality (criticality scoring)
  - Eigenvector Centrality (influence propagation)
  - Connected Components (ecosystem islands)

- [ ] Performance benchmarks
  - 100M edges processing time
  - GPU memory optimization

#### Week 12: Vector Search Integration
- [ ] Qdrant collection setup
  - Breaking change description embeddings
  - Collection size: 10M vectors (1536 dimensions)
  - Quantization: int8 (4x compression)

- [ ] Semantic search implementation
  - Description similarity matching
  - Migration guide suggestions
  - Related changes clustering

**Deliverables:** Sub-second graph queries, semantic search operational

---

### Faza 4: API & Frontend (Nedelje 13-17)

#### Week 13-14: REST API Implementation (Rust Axum)
- [ ] Core endpoints (6 total)
  - Package lookup & reverse dependencies
  - Breaking change details
  - What-if impact analysis
  - Full-text search

- [ ] Caching strategy (Redis)
  - Package metadata: 1 hour TTL
  - Breaking changes: 6 hour TTL
  - Search results: 30 min TTL

- [ ] Rate limiting & authentication
  - JWT token validation
  - Per-user quota (1000 req/min default)
  - API key management

#### Week 15-16: Frontend Development (React + Babylon.js)
- [ ] Dashboard layout
  - Latest breaking changes
  - Trending packages
  - Impact statistics

- [ ] Dependency explorer (3D visualization)
  - Force-directed layout (WebGPU)
  - 100K+ nodes at 60fps target
  - Level-of-detail (LOD) rendering
  - Frustum culling optimization

- [ ] Impact analyzer (what-if tool)
  - Scenario builder
  - Real-time calculation
  - Export results

#### Week 17: Integration & Testing
- [ ] End-to-end testing
  - API integration tests
  - Frontend component tests
  - Visual regression testing

- [ ] Load testing
  - 1000 concurrent users
  - 10K requests/sec sustained

**Deliverables:** Production-ready API & UI

---

### Faza 5: Security & Production Hardening (Nedelje 18-20)

#### Week 18: Security Implementation
- [ ] API security
  - CORS configuration
  - Request validation & sanitization
  - SQL injection prevention (prepared statements)
  - Rate limiting refinement

- [ ] Data encryption
  - TLS/SSL for all connections
  - Database encryption at rest
  - Secrets management (HashiCorp Vault)

- [ ] Access control
  - Role-based access control (RBAC)
  - API scopes & permissions
  - Audit logging

#### Week 19: Infrastructure Hardening
- [ ] Kubernetes security
  - Network policies
  - Pod security standards
  - RBAC for cluster access

- [ ] Monitoring & alerting
  - Alert thresholds
  - PagerDuty integration
  - Dashboard setup

#### Week 20: Deployment & Operations
- [ ] Kubernetes cluster provisioning
  - 3 control plane nodes
  - 10+ worker nodes
  - Storage classes (Persistent Volumes)

- [ ] ArgoCD deployment
  - GitOps workflow
  - Blue-green deployments
  - Automatic rollback on failure

- [ ] Production runbooks
  - Scaling procedures
  - Backup & recovery
  - Incident response

**Deliverables:** Production deployment, operational readiness

---

## ⚠️ Risk Management Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| RisingWave instability (new tech) | Medium (40%) | High | Test with Apache Flink as fallback; staged rollout |
| Tree-sitter accuracy limits | Medium (50%) | Medium | Implement LLM layer (Phase 2.2); manual verification |
| Memory pressure on Memgraph (100M+ nodes) | Medium (35%) | High | Sharding strategy; partition by ecosystem; cuGraph for scaling |
| Vector embedding cost | Low (20%) | Medium | Pre-compute & cache embeddings; batch updates |
| Registry API rate limits | Low (15%) | Low | Implement exponential backoff; respect rate headers |
| Breaking change detection false positives | Medium (45%) | Low | Confidence thresholding; community feedback loop |
| GPU availability in prod | Low (25%) | Medium | Optional feature; fallback to CPU algorithms |
| Data staleness (npm updates every second) | Medium (60%) | Low | Incremental updates; eventual consistency model |

---

## 💰 Cost Estimation Model

### Development Phase (Weeks 1-20)

| Component | Cost | Notes |
|-----------|------|-------|
| **Infrastructure** | | |
| AWS EC2 (dev cluster) | $1,500/month | t3.large × 5 nodes, 20 weeks = $7,500 |
| RDS PostgreSQL (managed) | $400/month | db.t3.large, 20 weeks = $2,000 |
| S3 storage (datasets) | $200/month | 1TB packages dump = $1,000 |
| **Services** | | |
| GitHub Actions minutes | $500 | ~50K minutes overage |
| Monitoring (Datadog trial) | $0 | Self-hosted Prometheus/Grafana |
| **Licenses** | | |
| IDE licenses (per dev) | $0 | VS Code + JetBrains Community |
| Total Dev Phase | **$11,000** | Fixed 20-week budget |

### MVP Phase (1-3 Months Post-Launch)

| Component | Monthly Cost | Notes |
|-----------|--------------|-------|
| **Kubernetes Cluster** | | |
| GCP GKE (3 control planes) | $800 | Auto-scaled, ~10 worker nodes |
| Node pools | $3,000 | 10 × n1-standard-4 ~$0.19/hour |
| Storage (Persistent Volumes) | $400 | Distributed SSD storage |
| **Data Services** | | |
| Memgraph (self-hosted) | $0 | Open-source; container cost included |
| Qdrant (self-hosted) | $0 | Open-source; container cost included |
| PostgreSQL (Cloud SQL) | $400 | db.f1-micro base + compute |
| Redis (Cloud Memorystore) | $300 | 5GB standard |
| **Networking** | | |
| Load balancer | $18 | GCP HTTP(S) LB |
| Egress costs | $200 | ~1TB/month outbound data |
| **Observability** | | |
| Logging (BigQuery integration) | $100 | 100GB/month ingestion |
| Monitoring (GCP Cloud Monitoring) | $0 | Free tier sufficient |
| **Total MVP** | **$5,200/month** | |

### Production Phase (Scaling)

| Component | Monthly Cost | Scale Notes |
|-----------|--------------|-------------|
| **Kubernetes** | | |
| GKE Standard (HA setup) | $1,200 | 3x control planes |
| Worker nodes (auto-scaling) | $8,000 | 50-200 nodes (peak: $15,000) |
| Storage (10TB) | $2,000 | High-performance SSD tier |
| **Data Services** | | |
| Memgraph cluster (3 nodes) | $0 | Self-hosted (licensing not required for <1B nodes) |
| Qdrant cluster (3 nodes) | $0 | Self-hosted |
| PostgreSQL (HA) | $1,500 | Cloud SQL High Availability |
| Redis cluster (3 nodes) | $1,200 | Cluster mode with replication |
| **Networking** | | |
| Load balancing (multi-region) | $200 | Global HTTP(S) LB |
| CDN (Cloudflare) | $200 | Caching + DDoS protection |
| Egress (100TB/month) | $10,000 | Internet egress at scale |
| **Observability** | | |
| Datadog (APM + Logs) | $3,000 | ~10M events/day ingestion |
| Incident response (PagerDuty) | $500 | Standard plan |
| **Total Production** | **$28,000/month** | Scales with traffic |

---

## 📊 ROI Projections (Year 1)

### Revenue Scenarios

**Scenario A: Freemium SaaS**
- Free tier: 1000 API calls/day (unlimited users)
- Pro tier: $99/month (100K API calls/day)
- Enterprise tier: Custom pricing ($5K-50K/month)

*Assumptions:*
- 10K free users (0% conversion)
- 100 Pro users by month 12
- 5 Enterprise customers by month 12

*Revenue: $12K/month by month 12*
*Break-even: Month 18*

---

### Scenario B: Enterprise Licensing
- Per-ecosystem license: $25K-100K/year
- npm: $25K/year
- PyPI: $25K/year
- Maven Central: $50K/year
- Cargo.io: $25K/year

*Revenue: $125K/year (4 ecosystems)*
*Break-even: Month 8*

---

### Scenario C: API Marketplace
- Charge developers per breaking change detection
- Base fee: $5K/month + $0.01 per breaking change detected
- 50K+ breaking changes/month detected

*Monthly revenue: $5K + (50K × $0.01) = $5.5K*
*Revenue: $66K/year*
*Break-even: Month 10*

---

## 🎯 Success Metrics & Key Performance Indicators (KPIs)

### Availability & Reliability
- **API Uptime:** 99.9% SLA (9 nines not required for MVP)
- **MTTR (Mean Time To Recovery):** < 15 minutes
- **MTTF (Mean Time To Failure):** > 720 hours (1 month)
- **Breaking Change Detection Latency:** < 5 minutes from commit
- **Database Query P99:** < 100ms (Memgraph)

### Accuracy Metrics
- **Breaking Change Detection Recall:** > 85% (heuristic-only)
- **False Positive Rate:** < 5% confidence scoring
- **Package Ingestion Completeness:** > 98% (npm, PyPI)
- **Dependency Resolution Accuracy:** > 95%

### Performance Benchmarks
- **API Response Time (P95):** < 200ms
- **Search Query Time (P95):** < 500ms
- **Graph Traversal (3-hop):** < 100ms
- **3D Visualization Load:** < 2 seconds (100K nodes)
- **Concurrent Users:** 1000+ at steady state

### Business Metrics
- **API Calls/Day:** 1M+ (MVP), 100M+ (Production)
- **Active Users:** 100+ (MVP), 10K+ (Production)
- **Package Coverage:** 2.6M+ (all ecosystems)
- **Breaking Changes Detected/Month:** 50K+
- **Customer Acquisition Cost:** < $50 (Enterprise deals)

### Cost Efficiency
- **Cost per API Call:** $0.001 (Target)
- **Infrastructure Cost per User:** $0.50/month (MVP)
- **Database Cost per 1M Calls:** $50 (optimized)

---

## 📐 Database Schema Details

### PostgreSQL Schema (Metadata Layer)

```sql
-- Packages table
CREATE TABLE packages (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  ecosystem VARCHAR(50) NOT NULL,
  description TEXT,
  repository_url VARCHAR(512),
  license VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ecosystem_name (ecosystem, name),
  INDEX idx_created_at (created_at)
);

-- Versions table
CREATE TABLE versions (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES packages(id),
  version VARCHAR(100) NOT NULL,
  released_at TIMESTAMP NOT NULL,
  size_bytes BIGINT,
  checksum VARCHAR(256),
  download_count BIGINT DEFAULT 0,
  breaking_change_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(package_id, version),
  INDEX idx_package_version (package_id, version),
  INDEX idx_released_at (released_at)
);

-- Breaking changes table
CREATE TABLE breaking_changes (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(255) UNIQUE NOT NULL,
  version_id INTEGER NOT NULL REFERENCES versions(id),
  change_type VARCHAR(50) NOT NULL, -- API_REMOVAL, TYPE_CHANGE, etc.
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity FLOAT DEFAULT 0.5,
  confidence_score FLOAT DEFAULT 0.5,
  detection_method VARCHAR(50), -- AST_DIFF, MANUAL, LLM
  manual_verified BOOLEAN DEFAULT FALSE,
  embedding_vector VECTOR(1536), -- For Qdrant sync
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_version_type (version_id, change_type),
  INDEX idx_confidence (confidence_score)
);

-- API audit logs
CREATE TABLE api_audit_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  api_key_prefix VARCHAR(10),
  endpoint VARCHAR(255),
  method VARCHAR(10),
  status_code INTEGER,
  response_time_ms INTEGER,
  request_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_created_at (created_at)
);
```

### Memgraph Cypher Schema (Graph Layer)

```cypher
-- Create constraints
CREATE CONSTRAINT ON (p:Package) ASSERT p.id IS UNIQUE;
CREATE CONSTRAINT ON (v:Version) ASSERT v.id IS UNIQUE;
CREATE CONSTRAINT ON (bc:BreakingChange) ASSERT bc.id IS UNIQUE;

-- Property indexes (fast lookups)
CREATE INDEX ON :Package(ecosystem, name);
CREATE INDEX ON :Version(package_id, version);
CREATE INDEX ON :BreakingChange(severity);

-- Full-text index on descriptions
CREATE FULL_TEXT INDEX breaking_change_descriptions 
  ON :BreakingChange(description);

-- Vector index for semantic search
CREATE VECTOR_INDEX breaking_change_embeddings 
  ON :BreakingChange(embedding) 
  WITH {dimension: 1536, metric: 'cosine'};

-- Cypher query library (most common queries)
-- Query 1: Find packages affected by breaking changes
MATCH (bc:BreakingChange)-[:BREAKING_CHANGE_IN]->(v:Version)
      -[:VERSION_OF]->(pkg:Package),
      (pkg)-[:DEPENDS_ON*1..3]-(impacted:Package)
WHERE bc.confidence_score > 0.8
RETURN impacted.name, COUNT(bc) as impact_count
ORDER BY impact_count DESC
LIMIT 100;

-- Query 2: Find critical packages (PageRank > 0.9)
MATCH (p:Package)
WHERE p.pagerank > 0.9
RETURN p.name, p.pagerank, COUNT{(p)<-[:DEPENDS_ON]-()}
ORDER BY p.pagerank DESC;

-- Query 3: Recursive impact propagation
MATCH path = (source:Package)-[:DEPENDS_ON*1..5]->(impacted:Package)
WHERE source.name = "react"
RETURN COUNT(DISTINCT impacted) as total_impacted,
       MAX(length(path)) as max_hop_distance;
```

---

## 🐳 Docker Compose Configuration

```yaml
# docker-compose.yml (Production-ready)
version: '3.9'

services:
  # Message Broker - Redpanda v25.3.4
  redpanda-1:
    image: vectorized/redpanda:v25.3.4
    container_name: redpanda-1
    ports:
      - "9092:9092"
      - "29092:29092"
    environment:
      REDPANDA_ADVERTISE_KAFKA_API: "redpanda-1:29092"
      REDPANDA_ADVERTISE_RPC_API: "redpanda-1:33145"
    volumes:
      - redpanda-1:/var/lib/redpanda/data
    networks:
      - inverse-deps
    healthcheck:
      test: rpk cluster health
      interval: 10s
      timeout: 5s
      retries: 5

  redpanda-2:
    image: vectorized/redpanda:v25.3.4
    container_name: redpanda-2
    depends_on:
      - redpanda-1
    environment:
      REDPANDA_ADVERTISE_KAFKA_API: "redpanda-2:29092"
      REDPANDA_ADVERTISE_RPC_API: "redpanda-2:33145"
      REDPANDA_SEED_SERVERS: "redpanda-1:33145"
    volumes:
      - redpanda-2:/var/lib/redpanda/data
    networks:
      - inverse-deps

  redpanda-3:
    image: vectorized/redpanda:v25.3.4
    container_name: redpanda-3
    depends_on:
      - redpanda-1
    environment:
      REDPANDA_ADVERTISE_KAFKA_API: "redpanda-3:29092"
      REDPANDA_ADVERTISE_RPC_API: "redpanda-3:33145"
      REDPANDA_SEED_SERVERS: "redpanda-1:33145"
    volumes:
      - redpanda-3:/var/lib/redpanda/data
    networks:
      - inverse-deps

  # Stream Processing - RisingWave v2.7.0
  risingwave:
    image: ghcr.io/risingwavelabs/risingwave:v2.7.0
    container_name: risingwave
    depends_on:
      - redpanda-1
      - postgres
    ports:
      - "4566:4566"
      - "5691:5691"
    environment:
      RISINGWAVE_ADVERTISE_ADDR: "risingwave:5691"
      RISINGWAVE_ADVERTISE_METRIC_ADDR: "risingwave:1250"
      RISINGWAVE_BACKEND: "inmemory"
    command: >
      risingwave single-node
      --listen-addr 0.0.0.0:5691
      --advertise-addr risingwave:5691
      --frontend-listen-addr 0.0.0.0:4566
      --meta-store-backend inmemory
    volumes:
      - ./risingwave-config.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - inverse-deps
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5691"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Graph Database - Memgraph v3.7.2
  memgraph-1:
    image: memgraph/memgraph:3.7.2
    container_name: memgraph-1
    ports:
      - "7687:7687"
      - "7444:7444"
    environment:
      MEMGRAPH_REPLICATION_MODE: "true"
      MEMGRAPH_REPLICATION_REPLICA_ID: "1"
    volumes:
      - memgraph-1:/var/lib/memgraph
    networks:
      - inverse-deps
    healthcheck:
      test: ["CMD", "memgraph", "--version"]
      interval: 10s
      timeout: 5s
      retries: 5

  memgraph-2:
    image: memgraph/memgraph:3.7.2
    container_name: memgraph-2
    depends_on:
      - memgraph-1
    ports:
      - "7688:7687"
    environment:
      MEMGRAPH_REPLICATION_MODE: "true"
      MEMGRAPH_REPLICATION_REPLICA_ID: "2"
      MEMGRAPH_REPLICATION_MAIN_REPLICA_HOST: "memgraph-1:10000"
    volumes:
      - memgraph-2:/var/lib/memgraph
    networks:
      - inverse-deps

  memgraph-3:
    image: memgraph/memgraph:3.7.2
    container_name: memgraph-3
    depends_on:
      - memgraph-1
    ports:
      - "7689:7687"
    environment:
      MEMGRAPH_REPLICATION_MODE: "true"
      MEMGRAPH_REPLICATION_REPLICA_ID: "3"
      MEMGRAPH_REPLICATION_MAIN_REPLICA_HOST: "memgraph-1:10000"
    volumes:
      - memgraph-3:/var/lib/memgraph
    networks:
      - inverse-deps

  # Vector Database - Qdrant v1.16.3
  qdrant:
    image: qdrant/qdrant:v1.16.3
    container_name: qdrant
    ports:
      - "6333:6333"
    environment:
      QDRANT_API_KEY: "qdrant-api-key-dev"
      QDRANT_READ_ONLY_MODE: "false"
    volumes:
      - qdrant:/qdrant/storage
    networks:
      - inverse-deps
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Relational Database - PostgreSQL 15
  postgres:
    image: postgres:15-alpine
    container_name: postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: inverse_deps
      POSTGRES_PASSWORD: dev_password_change_in_prod
      POSTGRES_DB: inverse_deps_db
    volumes:
      - postgres:/var/lib/postgresql/data
      - ./postgres-init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - inverse-deps
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U inverse_deps"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Cache Layer - Redis 7
  redis:
    image: redis:7-alpine
    container_name: redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis:/data
    networks:
      - inverse-deps
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Observability - Prometheus
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus:/prometheus
    networks:
      - inverse-deps

  # Observability - Grafana
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana:/var/lib/grafana
    networks:
      - inverse-deps

volumes:
  redpanda-1:
  redpanda-2:
  redpanda-3:
  memgraph-1:
  memgraph-2:
  memgraph-3:
  qdrant:
  postgres:
  redis:
  prometheus:
  grafana:

networks:
  inverse-deps:
    driver: bridge
```

---

## 🚀 GitOps Workflow & Deployment Strategy

### Repository Structure

```
inverse-dependencies/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml (lint, test, build)
│   │   ├── docker-build.yml
│   │   └── deploy.yml (ArgoCD trigger)
│   └── CODEOWNERS
├── apps/
│   ├── api/ (Rust Axum)
│   │   ├── src/
│   │   ├── Cargo.toml
│   │   └── Dockerfile
│   ├── detection/ (Tree-sitter)
│   │   ├── src/
│   │   ├── Cargo.toml
│   │   └── Dockerfile
│   ├── ingestion/ (RisingWave connector)
│   │   ├── src/
│   │   ├── Cargo.toml
│   │   └── Dockerfile
│   └── frontend/ (React)
│       ├── src/
│       ├── package.json
│       └── Dockerfile
├── packages/
│   ├── types/ (Shared types)
│   ├── clients/ (API clients)
│   └── utils/ (Shared utilities)
├── services/
│   ├── postgres/
│   │   └── migrations/
│   ├── redis/
│   │   └── config/
│   ├── qdrant/
│   │   └── collections/
│   └── memgraph/
│       └── cypher/
├── infra/
│   ├── helm/
│   │   └── inverse-deps/
│   │       ├── Chart.yaml
│   │       ├── values.yaml
│   │       └── templates/
│   ├── k8s/
│   │   ├── namespaces.yml
│   │   ├── persistent-volumes.yml
│   │   ├── network-policies.yml
│   │   └── ingress.yml
│   └── argocd/
│       ├── applications.yml
│       └── kustomization.yml
├── docker-compose.yml (local dev)
├── Makefile (automation)
├── README.md
└── DEPLOYMENT.md
```

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Rust toolchain
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Clippy (Rust lint)
        run: cargo clippy --all -- -D warnings
      - name: Unit tests
        run: cargo test --all
      - name: Python lint (isort, black, mypy)
        run: |
          pip install isort black mypy
          isort --check-only .
          black --check .
      - name: TypeScript lint
        run: |
          cd apps/frontend
          npm install
          npm run lint

  docker-build:
    needs: lint-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: docker/setup-buildx-action@v2
      - name: Build and push API
        uses: docker/build-push-action@v4
        with:
          context: ./apps/api
          push: true
          tags: ghcr.io/${{ github.repository }}/api:${{ github.sha }}
      - name: Build and push detection
        uses: docker/build-push-action@v4
        with:
          context: ./apps/detection
          push: true
          tags: ghcr.io/${{ github.repository }}/detection:${{ github.sha }}

  deploy:
    needs: docker-build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - name: Deploy via ArgoCD
        run: |
          argocd app sync inverse-deps \
            --auth-token ${{ secrets.ARGOCD_TOKEN }} \
            --server ${{ secrets.ARGOCD_SERVER }}
```

---

## ⏸️ PAUSE - Čekaj komande za nastavak

Četvrti deo od 140+ redova je gotov. Sledeći deo će sadržati:
- Kubernetes deployment manifests
- Environment configurations
- Security best practices
- Monitoring & alerting setup
- Phase-specific checklist

👉 **Reci "dalje" za Fazu 5 (Finalni deo sa K8s + Security + Complete Checklist)**
