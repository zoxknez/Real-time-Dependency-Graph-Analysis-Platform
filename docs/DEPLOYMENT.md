# 🚀 Deployment Guide

> **Verzija:** 1.0  
> **Datum:** Januar 2026  
> **Status:** Production-Ready

---

## 📋 Sadržaj

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Local Development](#local-development)
4. [Docker Deployment](#docker-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Database Migrations](#database-migrations)
7. [Health Checks](#health-checks)
8. [Monitoring & Observability](#monitoring--observability)
9. [Scaling Guidelines](#scaling-guidelines)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- Docker 24.0+ with Docker Compose v2
- Rust 1.85+ (for local development)
- Node.js 20+ (for frontend)
- kubectl (for Kubernetes deployment)
- Helm 3.12+ (for Kubernetes deployment)

### Required Services
| Service | Version | Purpose |
|---------|---------|---------|
| PostgreSQL | 16.2+ | Primary data store, audit logs |
| Memgraph | 2.14.1+ | Graph database |
| Qdrant | 1.16+ | Vector database |
| Redis | 7.2+ | Cache, rate limiting, pub/sub |
| Redpanda | 24.1+ | Event streaming (Kafka-compatible) |

---

## Environment Configuration

### Required Environment Variables

```bash
# ═══════════════════════════════════════════════════════════════
# SECURITY (Required in Production)
# ═══════════════════════════════════════════════════════════════
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
CORS_ORIGINS=https://your-domain.com,https://app.your-domain.com

# ═══════════════════════════════════════════════════════════════
# DATABASE CONNECTIONS
# ═══════════════════════════════════════════════════════════════
DATABASE_URL=postgresql://user:pass@postgres:5432/idp?sslmode=require
MEMGRAPH_URI=bolt://memgraph:7687
QDRANT_URL=http://qdrant:6334
REDIS_URL=redis://redis:6379

# ═══════════════════════════════════════════════════════════════
# KAFKA/REDPANDA
# ═══════════════════════════════════════════════════════════════
KAFKA_BROKERS=redpanda:9092

# ═══════════════════════════════════════════════════════════════
# EMBEDDINGS (Optional - defaults to mock)
# ═══════════════════════════════════════════════════════════════
EMBEDDING_PROVIDER=tei  # Options: mock, openai, tei, hybrid
TEI_URL=http://tei:80
OPENAI_API_KEY=sk-...   # Only if using OpenAI

# ═══════════════════════════════════════════════════════════════
# OBSERVABILITY
# ═══════════════════════════════════════════════════════════════
RUST_LOG=info,api=debug,sqlx=warn
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317

# ═══════════════════════════════════════════════════════════════
# RUNTIME CONFIGURATION
# ═══════════════════════════════════════════════════════════════
ENVIRONMENT=production  # development, staging, production
API_PORT=4001
METRICS_PORT=9001

# FRONTEND PUBLIC ENDPOINTS
# ═══════════════════════════════════════════════════════════════
# If using the bundled Caddy reverse proxy, you can set:
# PUBLIC_GRAPHQL_ENDPOINT=/graphql
# PUBLIC_WS_ENDPOINT=/graphql/ws
# PUBLIC_AGENT_STREAM_ENDPOINT=/agent/stream
PUBLIC_GRAPHQL_ENDPOINT=https://your-domain.com/graphql
PUBLIC_WS_ENDPOINT=wss://your-domain.com/graphql/ws
PUBLIC_AGENT_STREAM_ENDPOINT=https://your-domain.com/agent/stream
PUBLIC_SEARCH_MODE=semantic
```

### Optional Environment Variables

```bash
# Rate Limiting
RATE_LIMIT_REQUESTS_PER_SECOND=100
RATE_LIMIT_BURST=200

# GraphQL Limits
GRAPHQL_MAX_DEPTH=10
GRAPHQL_MAX_COMPLEXITY=500
GRAPHQL_QUERY_TIMEOUT_SECONDS=30

# Connection Pools
DB_POOL_MAX_SIZE=20
REDIS_POOL_SIZE=10

# Cache TTL
CACHE_TTL_SECONDS=300
NEGATIVE_CACHE_TTL_SECONDS=60
```

---

## Local Development

### Quick Start

```bash
# 1. Clone and setup
git clone <repo-url>
cd randomapp

# 2. Start infrastructure
docker-compose up -d

# 3. Run migrations
cargo run -p ingestion -- migrate

# 4. Start services (in separate terminals)
cargo run -p api
cargo run -p ingestion
cargo run -p graph-writer
cargo run -p vector-writer

# 5. Start frontend
cd apps/frontend
npm install
npm run dev
```

### Development with Hot Reload

```bash
# Install cargo-watch
cargo install cargo-watch

# Run API with hot reload
cargo watch -x 'run -p api'
```

---

## Docker Deployment

### Production Docker Compose

```bash
# Start all services (production bundle, includes reverse proxy)
docker compose -f docker/docker-compose.prod.yml up -d

# Check status
docker compose -f docker/docker-compose.prod.yml ps

# View logs
docker-compose logs -f api
```

### Building Images

```bash
# Build all images
docker-compose -f docker-compose.yml -f docker-compose.apps.yml build

# Build specific image
docker build -f deploy/docker/Dockerfile.api -t idp-api:latest .
```

### Docker Resource Limits (Recommended)

```yaml
# docker-compose.override.yml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 1G

  memgraph:
    deploy:
      resources:
        limits:
          memory: 8G  # Critical for graph operations

  qdrant:
    deploy:
      resources:
        limits:
          memory: 4G
```

---

## Kubernetes Deployment

### Using Helm

```bash
# Add Helm repo (if published)
helm repo add idp https://charts.your-domain.com
helm repo update

# Install
helm install idp deploy/helm/idp \
  --namespace idp \
  --create-namespace \
  --values deploy/helm/idp/values-production.yaml \
  --set secrets.jwtSecret=$JWT_SECRET \
  --set secrets.dbPassword=$DB_PASSWORD

# Upgrade
helm upgrade idp deploy/helm/idp \
  --namespace idp \
  --values deploy/helm/idp/values-production.yaml
```

### Manual Kubernetes Deployment

```bash
# Create namespace
kubectl create namespace idp

# Create secrets
kubectl create secret generic idp-secrets \
  --namespace idp \
  --from-literal=jwt-secret=$JWT_SECRET \
  --from-literal=db-password=$DB_PASSWORD

# Apply manifests
kubectl apply -f deploy/k8s/ -n idp

# Check status
kubectl get pods -n idp
kubectl get svc -n idp
```

### Horizontal Pod Autoscaling

```yaml
# deploy/k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

---

## Database Migrations

### PostgreSQL

```bash
# Run migrations
cargo run -p ingestion -- migrate

# Or using sqlx-cli
sqlx migrate run --database-url $DATABASE_URL
```

### Memgraph Schema

```bash
# Apply schema
docker exec -i idp-memgraph mgconsole < infra/memgraph/schema.cypher

# Verify indexes
docker exec idp-memgraph mgconsole -c "SHOW INDEX INFO;"
```

### Qdrant Collections

Collections are auto-created by vector-writer on startup. To manually create:

```bash
curl -X PUT "http://localhost:6333/collections/packages" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    }
  }'
```

---

## Health Checks

### Endpoints

| Service | Health Endpoint | Ready Endpoint |
|---------|-----------------|----------------|
| API | `GET /health` | `GET /ready` |
| GraphQL | `GET /graphql/health` | - |
| Metrics | `GET :9001/metrics` | - |

### Health Check Script

```bash
#!/bin/bash
# scripts/healthcheck.sh

SERVICES=("api:4001" "graph-writer:4002" "vector-writer:4003")

for service in "${SERVICES[@]}"; do
  name="${service%%:*}"
  port="${service##*:}"
  
  if curl -sf "http://localhost:$port/health" > /dev/null; then
    echo "✅ $name is healthy"
  else
    echo "❌ $name is unhealthy"
    exit 1
  fi
done

echo "All services healthy!"
```

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 4001
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 4001
  initialDelaySeconds: 5
  periodSeconds: 5
```

---

## Monitoring & Observability

### Prometheus Metrics

All services expose metrics on port 9001:

```bash
# Scrape config for Prometheus
- job_name: 'idp-api'
  static_configs:
    - targets: ['api:9001']
  
- job_name: 'idp-ingestion'
  static_configs:
    - targets: ['ingestion:9001']
```

### Key Metrics to Monitor

| Metric | Alert Threshold | Description |
|--------|-----------------|-------------|
| `http_requests_duration_seconds_p95` | > 500ms | API latency |
| `graphql_query_duration_seconds_p99` | > 2s | GraphQL performance |
| `cache_hit_ratio` | < 0.7 | Cache effectiveness |
| `memgraph_memory_usage_percent` | > 80% | Graph DB memory |
| `kafka_consumer_lag` | > 1000 | Event processing lag |

### Grafana Dashboards

Import dashboards from `observability/dashboards/`:
- `api-gateway.json` - API metrics
- `ingestion-metrics.json` - Ingestion pipeline
- `memgraph-dashboard.json` - Graph database

### Distributed Tracing

Jaeger UI available at `http://localhost:16686` (development) or configure OTLP endpoint for production.

---

## Scaling Guidelines

### Horizontal Scaling

| Component | Scalable | Notes |
|-----------|----------|-------|
| API | ✅ Yes | Stateless, scale freely |
| Ingestion | ✅ Yes | Partition by ecosystem |
| Graph-Writer | ⚠️ Limited | Single writer recommended |
| Vector-Writer | ✅ Yes | Partition by package prefix |
| Frontend | ✅ Yes | Static, CDN recommended |

### Vertical Scaling Requirements

| Component | Min RAM | Recommended | Max Tested |
|-----------|---------|-------------|------------|
| Memgraph | 4GB | 16GB | 64GB |
| Qdrant | 2GB | 8GB | 32GB |
| PostgreSQL | 1GB | 4GB | 16GB |
| Redis | 512MB | 2GB | 8GB |
| API | 512MB | 2GB | 4GB |

### Performance Tuning

```bash
# PostgreSQL
max_connections = 200
shared_buffers = 4GB
effective_cache_size = 12GB
work_mem = 256MB

# Redis
maxmemory 2gb
maxmemory-policy allkeys-lru

# Memgraph
--memory-limit=8000  # MB
```

---

## Troubleshooting

### Common Issues

#### API Won't Start

```bash
# Check environment
cargo run -p api 2>&1 | head -50

# Common causes:
# - Missing JWT_SECRET in production
# - Database not reachable
# - Port already in use
```

#### Memgraph OOM

```bash
# Check memory usage
docker exec idp-memgraph mgconsole -c "CALL mg.memory_info() YIELD *"

# Trigger eviction (if implemented)
curl -X POST http://localhost:4002/admin/evict?threshold=75
```

#### Kafka Consumer Lag

```bash
# Check consumer group
docker exec idp-redpanda rpk group describe idp-consumer-group

# Reset offset (caution!)
docker exec idp-redpanda rpk group seek idp-consumer-group --to end
```

#### Cache Issues

```bash
# Check Redis connection
redis-cli -h localhost ping

# Clear cache (development only!)
redis-cli -h localhost FLUSHDB
```

### Logs

```bash
# All services
docker-compose logs -f

# Specific service with filtering
docker-compose logs -f api 2>&1 | grep -E "(ERROR|WARN)"

# JSON parsing (if using structured logs)
docker-compose logs api | jq '.level,.message'
```

### Debug Mode

```bash
# Enable debug logging
RUST_LOG=debug cargo run -p api

# Trace all SQL queries
RUST_LOG=sqlx=trace cargo run -p api
```

---

## Security Checklist

Before going to production:

- [ ] JWT_SECRET is set (min 32 chars, random)
- [ ] CORS_ORIGINS is restricted to your domains
- [ ] Database passwords are strong and unique
- [ ] TLS enabled for all external connections
- [ ] GraphQL introspection disabled
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] Secrets stored in vault/KMS (not env files)

---

## Backup & Recovery

### PostgreSQL

```bash
# Backup
pg_dump -h localhost -U postgres idp > backup.sql

# Restore
psql -h localhost -U postgres idp < backup.sql
```

### Memgraph

```bash
# Snapshot
docker exec idp-memgraph mgconsole -c "CREATE SNAPSHOT;"

# List snapshots
ls -la /var/lib/memgraph/snapshots/
```

### Qdrant

```bash
# Backup collection
curl -X POST "http://localhost:6333/collections/packages/snapshots"
```

---

> **Need Help?** Check [DEVELOPMENT.md](./DEVELOPMENT.md) for development setup or [ARCHITECTURE.md](./ARCHITECTURE.md) for system design.
