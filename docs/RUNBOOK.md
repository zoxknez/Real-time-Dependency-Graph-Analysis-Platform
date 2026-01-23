# 📖 Operations Runbook

> **Verzija:** 1.0  
> **Datum:** Januar 2026  
> **Za:** DevOps / SRE tim

---

## 📋 Sadržaj

1. [Daily Operations](#daily-operations)
2. [Incident Response](#incident-response)
3. [Runbook: High API Latency](#runbook-high-api-latency)
4. [Runbook: Memgraph OOM](#runbook-memgraph-oom)
5. [Runbook: Kafka Consumer Lag](#runbook-kafka-consumer-lag)
6. [Runbook: Redis Connection Issues](#runbook-redis-connection-issues)
7. [Runbook: Database Connection Pool Exhaustion](#runbook-database-connection-pool-exhaustion)
8. [Runbook: Circuit Breaker Open](#runbook-circuit-breaker-open)
9. [Maintenance Procedures](#maintenance-procedures)

---

## Daily Operations

### Morning Checklist

```bash
# 1. Check all services are running
docker-compose ps

# 2. Check error rates (last hour)
curl -s http://localhost:9001/metrics | grep 'http_requests_total.*status="5'

# 3. Check consumer lag
docker exec idp-redpanda rpk group describe idp-consumer-group

# 4. Check Memgraph memory
docker exec idp-memgraph mgconsole -c "CALL mg.memory_info() YIELD used_memory RETURN used_memory / 1024 / 1024 AS used_mb"

# 5. Check disk space
df -h

# 6. Review alerts from last 24h
# (Check Grafana/PagerDuty/Slack)
```

### Weekly Tasks

- [ ] Review slow query logs
- [ ] Check certificate expiration dates
- [ ] Verify backup integrity
- [ ] Review security alerts
- [ ] Update dependency CVE scan

---

## Incident Response

### Severity Levels

| Level | Impact | Response Time | Example |
|-------|--------|---------------|---------|
| **SEV1** | Complete outage | 15 min | API down, no writes |
| **SEV2** | Major degradation | 30 min | High latency, partial failure |
| **SEV3** | Minor issue | 4 hours | Single feature broken |
| **SEV4** | Low impact | Next business day | UI glitch |

### Incident Commander Checklist

1. **Acknowledge** - Confirm you're on it
2. **Assess** - Determine severity and scope
3. **Communicate** - Update status page, notify stakeholders
4. **Mitigate** - Apply temporary fix if possible
5. **Resolve** - Implement permanent fix
6. **Document** - Write post-mortem

---

## Runbook: High API Latency

### Alert
`APILatencyHigh` - P95 latency > 500ms for 5 minutes

### Diagnosis

```bash
# 1. Check current latency
curl -w "@curl-format.txt" -s http://localhost:4001/health

# 2. Check for error spikes
curl -s http://localhost:9001/metrics | grep http_requests_duration

# 3. Check active connections
netstat -an | grep :4001 | wc -l

# 4. Check database pool
curl -s http://localhost:9001/metrics | grep db_pool

# 5. Check cache hit rate
curl -s http://localhost:9001/metrics | grep cache_hit
```

### Resolution Steps

**If cache hit rate is low (<70%):**
```bash
# Check Redis connection
redis-cli -h localhost ping

# Check Redis memory
redis-cli -h localhost INFO memory

# If Redis is down, restart
docker-compose restart redis
```

**If DB pool exhausted:**
```bash
# Check active queries
docker exec idp-postgres psql -U postgres -c "SELECT * FROM pg_stat_activity WHERE state = 'active'"

# Kill long-running queries
docker exec idp-postgres psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE duration > interval '30 seconds'"
```

**If Memgraph is slow:**
```bash
# Check memory pressure
docker exec idp-memgraph mgconsole -c "CALL mg.memory_info() YIELD *"

# Check for expensive queries
docker logs idp-memgraph 2>&1 | grep -i "slow\|timeout"
```

**Emergency: Scale up API replicas**
```bash
# Docker
docker-compose up -d --scale api=3

# Kubernetes
kubectl scale deployment api --replicas=5 -n idp
```

---

## Runbook: Memgraph OOM

### Alert
`MemgraphMemoryHigh` - Memory usage > 80%

### Diagnosis

```bash
# 1. Check current memory usage
docker exec idp-memgraph mgconsole -c "CALL mg.memory_info() YIELD used_memory, allocated_memory RETURN used_memory / 1024 / 1024 AS used_mb, allocated_memory / 1024 / 1024 AS allocated_mb"

# 2. Check node counts
docker exec idp-memgraph mgconsole -c "MATCH (n) RETURN labels(n) AS label, count(n) AS count ORDER BY count DESC LIMIT 10"

# 3. Check relationship counts
docker exec idp-memgraph mgconsole -c "MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY count DESC"
```

### Resolution Steps

**Immediate: Trigger eviction (if >75%)**
```bash
# Via API
curl -X POST "http://localhost:4002/admin/evict?threshold=75"

# Manual: Delete old versions
docker exec idp-memgraph mgconsole -c "
  MATCH (v:Version)
  WHERE v.published_at < datetime() - duration('P365D')
  WITH v LIMIT 10000
  DETACH DELETE v
  RETURN count(*) AS deleted
"
```

**Immediate: Delete low-popularity packages**
```bash
docker exec idp-memgraph mgconsole -c "
  MATCH (p:Package)
  WHERE p.popularity_score < 0.01
  AND NOT EXISTS((p)<-[:DEPENDS_ON]-())
  WITH p LIMIT 5000
  DETACH DELETE p
  RETURN count(*) AS deleted
"
```

**Long-term: Increase memory limit**
```yaml
# docker-compose.yml
memgraph:
  command: ["--memory-limit=16000"]  # 16GB
```

**Long-term: Shard by ecosystem**
Consider running separate Memgraph instances per ecosystem (npm, pypi, crates).

### Prevention

- Monitor memory trend daily
- Set up proactive eviction at 70%
- Archive old versions to PostgreSQL

---

## Runbook: Kafka Consumer Lag

### Alert
`KafkaConsumerLagHigh` - Lag > 1000 messages for 5 minutes

### Diagnosis

```bash
# 1. Check consumer group status
docker exec idp-redpanda rpk group describe idp-consumer-group

# 2. Check partition lag
docker exec idp-redpanda rpk topic consume package-events --offset end -n 1

# 3. Check consumer health
curl -s http://localhost:9001/metrics | grep kafka_consumer

# 4. Check for processing errors
docker logs idp-ingestion 2>&1 | tail -100 | grep -i error
```

### Resolution Steps

**If consumer is stuck:**
```bash
# Restart consumer
docker-compose restart ingestion

# Check if processing resumes
docker exec idp-redpanda rpk group describe idp-consumer-group
```

**If messages are failing:**
```bash
# Check DLQ
docker exec idp-redpanda rpk topic consume package-events-dlq -n 10

# Review error messages
docker logs idp-ingestion 2>&1 | grep "DLQ\|dead.letter"
```

**If producer is too fast:**
```bash
# Scale consumers
docker-compose up -d --scale ingestion=3

# Or reduce producer rate temporarily
```

**Emergency: Reset offset (DATA LOSS)**
```bash
# Reset to latest (skip backlog)
docker exec idp-redpanda rpk group seek idp-consumer-group --to end

# Reset to specific offset
docker exec idp-redpanda rpk group seek idp-consumer-group --to 12345
```

### Prevention

- Alert at 500 lag (warning), 1000 (critical)
- Auto-scale consumers based on lag
- Implement backpressure

---

## Runbook: Redis Connection Issues

### Alert
`RedisConnectionFailed` - Unable to connect to Redis

### Diagnosis

```bash
# 1. Check Redis is running
docker-compose ps redis

# 2. Check Redis logs
docker logs idp-redis --tail 100

# 3. Check memory
docker exec idp-redis redis-cli INFO memory

# 4. Check client connections
docker exec idp-redis redis-cli CLIENT LIST | wc -l
```

### Resolution Steps

**If Redis is down:**
```bash
# Restart Redis
docker-compose restart redis

# Verify connection
redis-cli -h localhost ping
```

**If too many connections:**
```bash
# Check connection sources
docker exec idp-redis redis-cli CLIENT LIST

# Kill idle connections
docker exec idp-redis redis-cli CLIENT KILL TYPE normal
```

**If OOM:**
```bash
# Check memory
docker exec idp-redis redis-cli INFO memory | grep used_memory_human

# Evict keys (if policy allows)
docker exec idp-redis redis-cli MEMORY DOCTOR
```

**Fallback: API continues without cache**
The API should degrade gracefully:
- Cache misses will hit database directly
- Rate limiting falls back to in-memory
- Monitor DB load increase

---

## Runbook: Database Connection Pool Exhaustion

### Alert
`DBPoolExhausted` - No available connections in pool

### Diagnosis

```bash
# 1. Check current connections
docker exec idp-postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity"

# 2. Check max connections
docker exec idp-postgres psql -U postgres -c "SHOW max_connections"

# 3. Check long-running queries
docker exec idp-postgres psql -U postgres -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query
  FROM pg_stat_activity
  WHERE state = 'active'
  ORDER BY duration DESC
  LIMIT 10
"

# 4. Check waiting queries
docker exec idp-postgres psql -U postgres -c "
  SELECT * FROM pg_stat_activity WHERE wait_event_type IS NOT NULL
"
```

### Resolution Steps

**Kill long-running queries:**
```bash
docker exec idp-postgres psql -U postgres -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE duration > interval '60 seconds'
  AND state = 'active'
"
```

**Increase pool size temporarily:**
```bash
# Set environment variable
export DB_POOL_MAX_SIZE=50

# Restart API
docker-compose restart api
```

**Increase max_connections (PostgreSQL):**
```bash
# Edit postgresql.conf
docker exec idp-postgres psql -U postgres -c "ALTER SYSTEM SET max_connections = 300"

# Restart PostgreSQL
docker-compose restart postgres
```

### Prevention

- Monitor pool utilization
- Set connection timeout
- Use connection pooler (PgBouncer) for scale

---

## Runbook: Circuit Breaker Open

### Alert
`CircuitBreakerOpen` - Service circuit breaker tripped

### Diagnosis

```bash
# Check circuit breaker state via metrics
curl -s http://localhost:9001/metrics | grep circuit_breaker

# Check which service is failing
docker logs idp-api 2>&1 | grep -i "circuit\|breaker"
```

### Resolution Steps

**Identify failing dependency:**
```bash
# Common dependencies:
# - Redis (cache)
# - Memgraph (graph queries)
# - Qdrant (vector search)
# - External API (embeddings)

# Check each service health
curl -s http://localhost:6379/ping  # Redis
curl -s http://localhost:7687      # Memgraph
curl -s http://localhost:6333/collections # Qdrant
```

**Fix the underlying service:**
```bash
# Restart failing service
docker-compose restart <service-name>

# Verify it's healthy
docker-compose ps
```

**Wait for circuit to close:**
The circuit breaker will automatically:
1. Enter **half-open** state after cooldown (30s default)
2. Allow probe requests
3. Close if probes succeed

**Force reset (not recommended):**
```bash
# Restart API to reset circuit breaker state
docker-compose restart api
```

---

## Maintenance Procedures

### Rolling Restart

```bash
# Kubernetes
kubectl rollout restart deployment api -n idp

# Docker (one at a time)
for i in 1 2 3; do
  docker-compose up -d --no-deps --scale api=$i api
  sleep 30
  docker-compose up -d --no-deps --scale api=$((i-1)) api
done
```

### Database Maintenance

```bash
# Vacuum PostgreSQL
docker exec idp-postgres psql -U postgres -c "VACUUM ANALYZE"

# Reindex
docker exec idp-postgres psql -U postgres -c "REINDEX DATABASE idp"
```

### Log Rotation

```bash
# Docker logs (configure in daemon.json)
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
```

### Backup Verification

```bash
# Weekly: Restore backup to test environment
pg_restore -h test-db -U postgres -d idp_test backup.dump

# Verify data integrity
psql -h test-db -U postgres -d idp_test -c "SELECT count(*) FROM packages"
```

---

## Contact Information

| Role | Contact | Escalation |
|------|---------|------------|
| On-call Engineer | PagerDuty | First responder |
| Platform Lead | @platform-team | SEV1-2 incidents |
| Database Admin | @dba-team | DB issues |
| Security | @security-team | Security incidents |

---

> **Last Updated:** Januar 2026  
> **Maintained by:** Platform Team
