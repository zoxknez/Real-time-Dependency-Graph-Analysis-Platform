# 📚 IDP Platform - Production Runbook

> **Last Updated**: 2026-04-18  
> **Version**: 1.0.0  
> **Maintainer**: Platform Team

This runbook provides operational procedures for the Inverse Dependencies Platform (IDP) in production environments.

---

## 🎯 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Deployment Procedures](#deployment-procedures)
3. [Monitoring & Alerting](#monitoring--alerting)
4. [Incident Response](#incident-response)
5. [Troubleshooting Guide](#troubleshooting-guide)
6. [Maintenance Procedures](#maintenance-procedures)
7. [Disaster Recovery](#disaster-recovery)
8. [Contacts & Escalation](#contacts--escalation)

---

## 🏗️ Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Load Balancer (Nginx)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ↓               ↓               ↓
    ┌────────┐     ┌─────────┐    ┌──────────┐
    │   API  │     │Frontend │    │ Ingestion│
    └────┬───┘     └─────────┘    └────┬─────┘
         │                              │
    ┌────┴──────────────────────────────┴────┐
    │           Kafka/Redpanda                │
    └────┬──────────────────────────────┬────┘
         │                              │
    ┌────┴────┐                    ┌────┴────┐
    │ Graph   │                    │ Vector  │
    │ Writer  │                    │ Writer  │
    └────┬────┘                    └────┬────┘
         │                              │
    ┌────┴────┐                    ┌────┴────┐
    │Memgraph │                    │ Qdrant  │
    └─────────┘                    └─────────┘
```

### Service Ports

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| API Gateway | 8000 | HTTP/WS | GraphQL API |
| Frontend | 3000 | HTTP | Web UI |
| Memgraph | 7687 | Bolt | Graph queries |
| Qdrant | 6333/6334 | REST/gRPC | Vector search |
| Redis | 6379 | Redis | Caching |
| PostgreSQL | 5432 | PostgreSQL | Metadata |
| Redpanda | 19092 | Kafka | Event streaming |
| Prometheus | 9090 | HTTP | Metrics |
| Grafana | 3001 | HTTP | Dashboards |
| Jaeger | 16686 | HTTP | Tracing |

---

## 🚀 Deployment Procedures

### Pre-Deployment Checklist

- [ ] Review changes in staging environment
- [ ] Run full test suite (`make test`)
- [ ] Check security scan results (`cargo audit`)
- [ ] Verify database migrations
- [ ] Review resource limits
- [ ] Notify team in #deployments channel
- [ ] Create deployment ticket
- [ ] Schedule maintenance window (if needed)

### Standard Deployment (Zero-Downtime)

```bash
# 1. Pull latest changes
git pull origin main

# 2. Build new Docker images
docker-compose -f docker-compose.yml -f docker-compose.apps.yml build

# 3. Run database migrations (if any)
docker-compose exec postgres psql -U idp -d inverse_deps -f /migrations/new_migration.sql

# 4. Deploy services one by one (rolling update)
docker-compose up -d --no-deps --build api
sleep 30  # Wait for health check
docker-compose up -d --no-deps --build frontend
sleep 30
docker-compose up -d --no-deps --build ingestion
sleep 30
docker-compose up -d --no-deps --build graph-writer
sleep 30
docker-compose up -d --no-deps --build vector-writer

# 5. Verify deployment
./scripts/smoke-test.sh

# 6. Monitor logs for errors
docker-compose logs -f --tail=100
```

### Rollback Procedure

```bash
# 1. Identify last known good version
git log --oneline -10

# 2. Checkout previous version
git checkout <commit-hash>

# 3. Rebuild and deploy
docker-compose -f docker-compose.yml -f docker-compose.apps.yml up -d --build

# 4. Verify rollback
./scripts/smoke-test.sh

# 5. Notify team
echo "Rolled back to version <commit-hash>" | slack-notify #incidents
```

### Emergency Hotfix

```bash
# 1. Create hotfix branch
git checkout -b hotfix/critical-fix main

# 2. Make minimal changes
# ... edit files ...

# 3. Test locally
make test

# 4. Commit and push
git commit -m "hotfix: critical bug fix"
git push origin hotfix/critical-fix

# 5. Deploy directly to production (skip staging)
# ... follow standard deployment ...

# 6. Create post-mortem ticket
```

---

## 📊 Monitoring & Alerting

### Key Metrics to Watch

#### API Gateway
- **Request Rate**: `rate(idp_graphql_requests_total[5m])`
- **Error Rate**: `rate(idp_graphql_requests_total{status="error"}[5m])`
- **P99 Latency**: `histogram_quantile(0.99, idp_graphql_duration_seconds_bucket)`
- **Active Subscriptions**: `idp_active_subscriptions`
- **Cache Hit Rate**: `idp_cache_hits_total / (idp_cache_hits_total + idp_cache_misses_total)`

#### Ingestion
- **Packages Ingested**: `rate(idp_packages_ingested_total[5m])`
- **Consumer Lag**: `kafka_consumer_lag{job="ingestion"}`
- **Error Rate**: `rate(idp_ingestion_errors_total[5m])`

#### Storage Writers
- **Graph Writer Lag**: `kafka_consumer_lag{job="graph-writer"}`
- **Vector Writer Lag**: `kafka_consumer_lag{job="vector-writer"}`
- **DLQ Messages**: `idp_dlq_messages_total`

#### Databases
- **Memgraph Memory**: `memgraph_memory_usage_bytes / memgraph_memory_limit_bytes`
- **Qdrant Collection Size**: `qdrant_collection_vectors_count`
- **Redis Memory**: `redis_memory_used_bytes`
- **PostgreSQL Connections**: `pg_stat_database_numbackends`

### Grafana Dashboards

1. **Platform Overview** - http://localhost:3001/d/platform-overview
2. **API Gateway** - http://localhost:3001/d/api-gateway
3. **Ingestion Pipeline** - http://localhost:3001/d/ingestion
4. **Storage Writers** - http://localhost:3001/d/writers

### Alert Severity Levels

| Level | Response Time | Escalation |
|-------|--------------|------------|
| **Critical** | Immediate | Page on-call engineer |
| **Warning** | 15 minutes | Slack notification |
| **Info** | Best effort | Log only |

---

## 🚨 Incident Response

### Incident Response Process

1. **Acknowledge** - Acknowledge alert in PagerDuty/Slack
2. **Assess** - Check dashboards and logs
3. **Mitigate** - Apply immediate fix or rollback
4. **Communicate** - Update status page and team
5. **Resolve** - Verify fix and close incident
6. **Post-Mortem** - Document learnings

### Common Incidents

#### API Service Down

**Symptoms**: `up{job="api"} == 0`

**Investigation**:
```bash
# Check service status
docker-compose ps api

# Check logs
docker-compose logs --tail=100 api

# Check health endpoint
curl http://localhost:8000/health
```

**Resolution**:
```bash
# Restart service
docker-compose restart api

# If that fails, rebuild
docker-compose up -d --build api
```

#### High Error Rate

**Symptoms**: Error rate > 5%

**Investigation**:
```bash
# Check error logs
docker-compose logs api | grep ERROR

# Check Memgraph connectivity
docker-compose exec api curl -f bolt://memgraph:7687

# Check Redis connectivity
docker-compose exec api redis-cli -h redis ping
```

**Resolution**:
```bash
# If database connection issue, restart database
docker-compose restart memgraph

# If code issue, rollback
git checkout <previous-version>
docker-compose up -d --build api
```

#### High Latency

**Symptoms**: P99 latency > 2s

**Investigation**:
```bash
# Check slow queries in Memgraph
docker-compose exec memgraph mgconsole
> SHOW QUERIES;

# Check cache hit rate
curl http://localhost:8000/metrics | grep cache_hits

# Check system resources
docker stats
```

**Resolution**:
```bash
# Clear cache if stale
docker-compose exec redis redis-cli FLUSHDB

# Restart Memgraph if memory pressure
docker-compose restart memgraph

# Scale API horizontally
docker-compose up -d --scale api=3
```

#### Ingestion Stopped

**Symptoms**: No packages ingested for 15+ minutes

**Investigation**:
```bash
# Check ingestion service
docker-compose logs --tail=100 ingestion

# Check Kafka connectivity
docker-compose exec ingestion kafka-topics --list --bootstrap-server redpanda:9092

# Check external registry APIs
curl -I https://registry.npmjs.org/
curl -I https://pypi.org/
```

**Resolution**:
```bash
# Restart ingestion service
docker-compose restart ingestion

# If Kafka issue, restart Redpanda
docker-compose restart redpanda

# Check for rate limiting
docker-compose logs ingestion | grep "rate limit"
```

#### Memgraph Memory Pressure

**Symptoms**: Memory usage > 85%

**Investigation**:
```bash
# Check memory stats
docker-compose exec memgraph mgconsole
> SHOW STORAGE INFO;

# Check node/edge counts
> MATCH (n) RETURN count(n);
> MATCH ()-[r]->() RETURN count(r);
```

**Resolution**:
```bash
# Increase memory limit in docker-compose.yml
# memgraph:
#   deploy:
#     resources:
#       limits:
#         memory: 2g  # Increase from 1g

# Restart with new limit
docker-compose up -d memgraph

# Or trigger garbage collection
docker-compose exec memgraph mgconsole
> FREE MEMORY;
```

---

## 🔧 Troubleshooting Guide

### Debug Commands

```bash
# View all service statuses
docker-compose ps

# View logs for specific service
docker-compose logs -f <service-name>

# Execute command in container
docker-compose exec <service-name> <command>

# Check resource usage
docker stats

# Inspect network
docker network inspect idp-network

# Check disk usage
df -h
docker system df
```

### Common Issues

#### "Connection refused" errors

**Cause**: Service not ready or network issue

**Fix**:
```bash
# Wait for health checks
docker-compose ps

# Check service logs
docker-compose logs <service>

# Verify network connectivity
docker-compose exec api ping memgraph
```

#### "Out of memory" errors

**Cause**: Container memory limit exceeded

**Fix**:
```bash
# Increase memory limit in docker-compose.yml
# Restart service
docker-compose up -d <service>
```

#### Kafka consumer lag growing

**Cause**: Processing slower than ingestion

**Fix**:
```bash
# Scale consumers
docker-compose up -d --scale graph-writer=2

# Check for slow queries
# Optimize batch sizes
```

---

## 🔄 Maintenance Procedures

### Database Backup

```bash
# Backup Memgraph
docker-compose exec memgraph mgconsole
> DUMP DATABASE;

# Backup PostgreSQL
docker-compose exec postgres pg_dump -U idp inverse_deps > backup.sql

# Backup Redis (if needed)
docker-compose exec redis redis-cli SAVE
```

### Log Rotation

```bash
# Rotate Docker logs
docker-compose logs --no-log-prefix > logs/$(date +%Y%m%d).log
docker-compose down && docker-compose up -d
```

### Certificate Renewal

```bash
# Renew Let's Encrypt certificates
certbot renew --nginx

# Reload Nginx
docker-compose exec nginx nginx -s reload
```

---

## 💾 Disaster Recovery

### Backup Strategy

- **Frequency**: Daily automated backups
- **Retention**: 30 days
- **Location**: S3 bucket (encrypted)
- **RTO**: 4 hours
- **RPO**: 24 hours

### Recovery Procedure

```bash
# 1. Restore infrastructure
terraform apply

# 2. Restore databases
docker-compose exec postgres psql -U idp -d inverse_deps < backup.sql

# 3. Restore Memgraph
docker-compose exec memgraph mgconsole < memgraph_backup.cypher

# 4. Restart services
docker-compose up -d

# 5. Verify data integrity
./scripts/verify-data.sh
```

---

## 📞 Contacts & Escalation

### On-Call Rotation

| Week | Primary | Secondary |
|------|---------|-----------|
| Current | @engineer1 | @engineer2 |
| Next | @engineer3 | @engineer4 |

### Escalation Path

1. **L1**: On-call engineer (PagerDuty)
2. **L2**: Team lead (@team-lead)
3. **L3**: Engineering manager (@eng-manager)
4. **L4**: CTO (@cto)

### External Contacts

- **Cloud Provider**: support@cloud-provider.com
- **Gemini API**: support@google.com
- **Security Team**: security@company.com

---

## 📝 Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-18 | 1.0.0 | Initial runbook |

---

## 📚 Additional Resources

- [Architecture Documentation](./ARCHITECTURE.md)
- [API Documentation](./API.md)
- [Security Guide](./SECURITY.md)
- [Development Guide](./DEVELOPMENT.md)