# Docker Infrastructure Setup

## Requirements

- **Docker Compose v2+** (required for `condition: service_healthy`)
- Minimum 8GB RAM recommended
- 20GB free disk space for volumes

## Quick Start

```bash
# Start all core services
docker-compose up -d

# Start with monitoring (Prometheus + Grafana)
docker-compose --profile monitoring up -d

# Start application services (requires infrastructure)
docker-compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.apps.yml up -d

# Check service health
docker-compose ps

# View logs
docker-compose logs -f [service-name]

# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes all data)
docker-compose down -v
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Critical variables for production:**
- `POSTGRES_PASSWORD` - Change from default
- `GF_SECURITY_ADMIN_PASSWORD` - Grafana admin password
- `EXTERNAL_HOST` - Set to your public IP/domain for remote access
- `PUBLIC_GRAPHQL_ENDPOINT` - Public GraphQL URL for the frontend
- `PUBLIC_WS_ENDPOINT` - Public WebSocket URL for subscriptions
- `PUBLIC_AGENT_STREAM_ENDPOINT` - Public agent stream endpoint
- If using the bundled reverse proxy, set the public endpoints to `/graphql`, `/graphql/ws`, and `/agent/stream`
- `GEMINI_API_KEY` - Your Gemini API key
- `GEMINI_FLASH_MODEL` - Fast model (default: `gemini-3-flash-preview`)
- `GEMINI_THINKING_MODEL` - Reasoning model (default: `gemini-3-pro-preview`)
- `GEMINI_LIVE_EPHEMERAL_TOKEN` - Optional. Pre-generated token for Live API demo endpoint (`/live/token`)

## Services

| Service | Port(s) | Purpose | Health Check |
|---------|---------|---------|--------------|
| **Redpanda** | 19092, 18082, 18081 | Kafka-compatible messaging | `rpk cluster health` |
| **Redpanda Console** | 18080 | Kafka UI | - |
| **RisingWave** | 4566, 5691 | Stream processing SQL | Dashboard health endpoint |
| **Memgraph** | 7687, 7444 | Graph database | HTTP API |
| **Memgraph Lab** | 3002 | Graph UI | - |
| **Qdrant** | 6333, 6334 | Vector database | TCP port check |
| **PostgreSQL** | 5432 | Metadata & audit | `pg_isready` |
| **Redis** | 6379 | Caching | `PING` |
| **Jaeger** | 16686, 4317, 4318 | Distributed tracing | - |
| **Prometheus** | 9090 | Metrics (monitoring profile) | - |
| **Grafana** | 3001 | Dashboards (monitoring profile) | - |

## Resource Limits

Default limits (configurable via `.env`):
- Redpanda: 1GB
- Memgraph: 2GB
- Qdrant: 1GB
- RisingWave: 2GB
- PostgreSQL: 512MB
- Redis: 512MB (with 256MB max memory)
- Jaeger: 512MB

## Logging

All services use JSON file logging with rotation:
- Core services: 10MB × 3 files
- UI services: 5MB × 2 files

View logs:
```bash
docker-compose logs -f --tail=100 memgraph
```

## Healthchecks

All core services have robust healthchecks:
- **Memgraph**: HTTP API check (port 7444)
- **Qdrant**: TCP health check on port 6333
- **RisingWave**: Dashboard health endpoint
- **Redpanda**: `rpk cluster health`
- **PostgreSQL**: `pg_isready`
- **Redis**: `PING` command

## Troubleshooting

### Services won't start
```bash
# Check Docker Compose version
docker-compose version  # Should be v2.x

# Check available resources
docker system df

# View detailed logs
docker-compose logs [service-name]
```

### Port conflicts
If ports are already in use, modify them in `docker-compose.yml`:
```yaml
ports:
  - "NEW_PORT:CONTAINER_PORT"
```

### Memory issues
Reduce resource limits in `.env`:
```bash
MEMGRAPH_MEMORY_LIMIT=1g
QDRANT_MEMORY_LIMIT=512m
```

### Healthcheck failures
Wait longer for services to initialize:
```bash
docker-compose up -d
sleep 30
docker-compose ps
```

## Production Deployment

For production/demo deployments:

1. **Set EXTERNAL_HOST**:
   ```bash
   export EXTERNAL_HOST=your-domain.com
   ```

2. **Use strong passwords**:
   ```bash
   export POSTGRES_PASSWORD=$(openssl rand -base64 32)
   export GF_SECURITY_ADMIN_PASSWORD=$(openssl rand -base64 32)
   ```

3. **Limit exposed ports** - Only expose what's needed externally

4. **Start the production bundle** (includes reverse proxy):
   ```bash
   docker compose -f docker/docker-compose.prod.yml up -d
   ```

5. **Enable monitoring** (optional):
   ```bash
   docker-compose --profile monitoring up -d
   ```

6. **Set up backups** for volumes:
   ```bash
   docker run --rm -v idp_postgres_data:/data -v $(pwd):/backup \
     alpine tar czf /backup/postgres-backup.tar.gz /data
   ```

## Minimal Profile (Development)

For quick testing with minimal resources:

```yaml
# Add to docker-compose.yml
profiles:
  - minimal

# Then run:
docker-compose --profile minimal up -d
```

This starts only: Memgraph, Redis, PostgreSQL

## Init Scripts

Place initialization scripts in:
- `./infra/postgres/init/*.sql` - Auto-executed on first PostgreSQL start
- `./infra/memgraph/queries/*.py` - Custom Memgraph query modules

## Monitoring Access

With monitoring profile enabled:
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin / [your password])
- **Jaeger UI**: http://localhost:16686
- **Redpanda Console**: http://localhost:18080
- **Memgraph Lab**: http://localhost:3002

## Version Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Redpanda | v26.1.5 | Kafka-compatible |
| RisingWave | v2.8.1 | PostgreSQL protocol (playground mode) |
| Memgraph | 3.9.0 | MAGE algorithms included |
| Qdrant | v1.17.0 | Vector search |
| PostgreSQL | 17.9-alpine | Latest stable |
| Redis | 8.6.0-alpine | Latest stable |

## Support

For issues:
1. Check service logs: `docker-compose logs [service]`
2. Verify healthchecks: `docker-compose ps`
3. Check resource usage: `docker stats`
