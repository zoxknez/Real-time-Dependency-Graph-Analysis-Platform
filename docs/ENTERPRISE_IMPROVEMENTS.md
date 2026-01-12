# 🏢 Enterprise Implementation Roadmap v2.0

> Izvodljiv, merljiv i bezbedan plan sa "Definition of Done" za svaki epic.

---

## 📊 Enterprise Maturity Assessment

| Component | Current | Target | Gap | Priority |
|-----------|---------|--------|-----|----------|
| Security (RBAC/Multi-tenant) | ⚠️ 40% | ⭐ 100% | 60% | P0 |
| Resilience (Circuit Breaker) | ⚠️ 30% | ⭐ 100% | 70% | P0 |
| Disaster Recovery | ⚠️ 20% | ⭐ 100% | 80% | P0 |
| Observability | ✅ 60% | ⭐ 100% | 40% | P1 |
| Governance/Compliance | ⚠️ 25% | ⭐ 100% | 75% | P2 |

---

## 🚨 Kritične Rupe (Must-Fix Pre Enterprise)

| Gap | Zašto je kritično | Prioritet |
|-----|-------------------|-----------|
| Timeouts + Idempotency | Circuit breaker bez timeouts ne radi | P0 |
| Per-Tenant Rate Limiting | DoS od jednog tenanta ruši sve | P0 |
| DB Tenant Isolation | Bez RLS/filtera = data leak | P0 |
| Secrets Rotation | SOC2 zahteva KMS + rotaciju | P0 |
| Restore Drills | DR bez testa nije DR | P0 |
| Supply-Chain Security | SBOM + image signing za SOC2 | P1 |

---

# 📋 PHASE 1: Foundation (Weeks 1-2)

## Epic 1.1: Resilience Stack

### Stories

#### Story 1.1.1: Circuit Breaker Implementation
**Acceptance Criteria:**
- [ ] Per-dependency breakers (Memgraph, Qdrant, Kafka, Redis) - NE globalni
- [ ] Per-operation breakers (search vs upsert)
- [ ] State transitions: CLOSED → OPEN → HALF_OPEN
- [ ] Configurable thresholds: failure_count, success_count, timeout_ms

**Test Plan:**
```rust
#[tokio::test]
async fn breaker_opens_after_threshold() {
    // 5 failures → state = OPEN
}

#[tokio::test]
async fn breaker_half_open_after_timeout() {
    // After timeout_ms → state = HALF_OPEN
}
```

**Observability:**
- `circuit_breaker_state{service,operation}` gauge (0=closed, 1=open, 2=half_open)
- `circuit_breaker_transitions_total{from,to}` counter
- Log: `WARN` on state change with trace_id

---

#### Story 1.1.2: Timeout + Retry + Backoff
**Acceptance Criteria:**
- [ ] Svi eksterni pozivi imaju timeout (default 5s, configurable)
- [ ] Retry samo na 5xx/network errors, NE na 4xx
- [ ] Jitter backoff: `base * 2^attempt + random(0, base)`
- [ ] Max 3 retries

**Implementacija:**
```rust
// packages/storage/src/resilience.rs
pub struct ResilienceConfig {
    pub timeout: Duration,
    pub max_retries: u32,
    pub base_delay: Duration,
    pub max_delay: Duration,
}

pub async fn with_resilience<F, T, E>(
    config: &ResilienceConfig,
    operation: F,
) -> Result<T, E>
where
    F: Fn() -> Future<Output = Result<T, E>>,
    E: IsRetryable,
{
    // timeout + retry + backoff + jitter
}
```

**Observability:**
- `request_retries_total{service,operation}` counter
- `request_timeout_total{service}` counter

---

#### Story 1.1.3: Bulkhead Pattern
**Acceptance Criteria:**
- [ ] Semaphore per dependency (max concurrent calls)
- [ ] Configurable limits per service
- [ ] Graceful rejection when full

**Observability:**
- `bulkhead_available{service}` gauge
- `bulkhead_rejected_total{service}` counter

---

#### Story 1.1.4: Fallback / Degraded Mode
**Acceptance Criteria:**
- [ ] Cache fallback za read operacije
- [ ] Stale read kada circuit open
- [ ] Degraded mode flag u health check

---

## Epic 1.2: TenantContext Plumbing

### Stories

#### Story 1.2.1: JWT Claims Extraction
**Acceptance Criteria:**
- [ ] TenantContext se kreira iz JWT claims
- [ ] Podržani: tenant_id, org_id, user_id, permissions
- [ ] API key lookup kao alternativa

```rust
pub struct TenantContext {
    pub tenant_id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub permissions: HashSet<Permission>,
    pub rate_limit_tier: RateTier,
    pub request_id: Uuid,
}
```

#### Story 1.2.2: Request Extensions Integration
**Acceptance Criteria:**
- [ ] TenantContext u Axum Extensions
- [ ] Dostupan u svim handlerima
- [ ] Propagira se kroz async context

---

# 📋 PHASE 2: Multi-Tenancy & Security (Weeks 3-6)

## Epic 2.1: Database Tenant Isolation

### Definition of Done (P0 - STOP-SHIP)
- [ ] Svaka tabela sa tenant-sadržajem ima `tenant_id` + index
- [ ] Postgres RLS policies aktivne
- [ ] Integration test: "tenant A NE MOŽE videti tenant B"
- [ ] Audit log ima tenant_id

### Stories

#### Story 2.1.1: Schema Migration
```sql
-- Dodaj tenant_id svuda
ALTER TABLE packages ADD COLUMN tenant_id UUID NOT NULL;
ALTER TABLE versions ADD COLUMN tenant_id UUID NOT NULL;
CREATE INDEX idx_packages_tenant ON packages(tenant_id, id);

-- RLS Policy
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON packages
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

#### Story 2.1.2: Tenant Isolation Tests
```rust
#[tokio::test]
async fn tenant_a_cannot_see_tenant_b_packages() {
    let tenant_a = create_tenant().await;
    let tenant_b = create_tenant().await;
    
    let pkg = create_package(tenant_a).await;
    
    let result = query_packages(tenant_b).await;
    assert!(!result.contains(&pkg));
}
```

---

## Epic 2.2: RBAC Implementation

### Definition of Done (P0)
- [ ] Default DENY - sve eksplicitno dozvoljeno
- [ ] Svaki endpoint ima definisan `required_permissions`
- [ ] Permission check pre svakog resolver-a

### Permission Model
```rust
pub enum Permission {
    // Package operations
    PackageRead,
    PackageWrite,
    PackageDelete,
    
    // Graph operations
    GraphQuery,
    GraphMutate,
    
    // Admin
    TenantAdmin,
    SystemAdmin,
    AuditView,
}

pub struct UserMembership {
    user_id: Uuid,
    tenant_id: Uuid,
    org_id: Uuid,
    role: Role,
    custom_permissions: HashSet<Permission>,
}
```

### Middleware
```rust
pub async fn require_permission(
    ctx: &TenantContext,
    required: Permission,
) -> Result<(), AuthError> {
    if !ctx.permissions.contains(&required) {
        audit_log(AuditEventType::AccessDenied, ctx, required);
        return Err(AuthError::Forbidden);
    }
    Ok(())
}
```

---

## Epic 2.3: Rate Limiting Per-Tenant

### Stories

#### Story 2.3.1: Tier-Based Rate Limits
```rust
pub enum RateTier {
    Free { rpm: 100, daily: 1000 },
    Pro { rpm: 1000, daily: 50000 },
    Enterprise { rpm: 10000, daily: 1000000 },
}
```

#### Story 2.3.2: Per-Endpoint Limits
- `/graphql` - tier RPM
- `/graphql` mutations - 10% of tier
- WebSocket connections - tier / 10

**Observability:**
- `rate_limit_hits_total{tenant_id,tier,endpoint}`
- `rate_limit_remaining{tenant_id}`

---

# 📋 PHASE 3: Disaster Recovery (Weeks 7-8)

## Epic 3.1: Backup Infrastructure

### Definition of Done (P0)
- [ ] Automated backups za sve komponente
- [ ] Encryption at-rest (S3 SSE + KMS)
- [ ] Retention policy (30 days default)
- [ ] Cross-region replication

### Backup Schedule
| Component | Method | Frequency | RPO | Retention |
|-----------|--------|-----------|-----|-----------|
| PostgreSQL | pg_dump + WAL | 15min | 15min | 30 days |
| Memgraph | Snapshot | 1h | 1h | 7 days |
| Qdrant | Collection export | 4h | 4h | 7 days |
| Redis | RDB + AOF | 1h | 1h | 3 days |
| Kafka | Topic snapshots | Continuous | 0 | 7 days |

### CronJob
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-all
spec:
  schedule: "0 */6 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: idp-backup:latest
              env:
                - name: S3_BUCKET
                  valueFrom:
                    secretKeyRef:
                      name: backup-secrets
                      key: bucket
                - name: KMS_KEY_ID
                  valueFrom:
                    secretKeyRef:
                      name: backup-secrets
                      key: kms-key
```

---

## Epic 3.2: Restore Procedures

### Definition of Done (P0)
- [ ] 1-click restore script
- [ ] Dokumentovan runbook
- [ ] Weekly automated restore test na staging
- [ ] Izmeren RTO (target < 30min)

### Restore Runbook
```bash
#!/bin/bash
# scripts/restore/full-restore.sh

set -e

echo "🔄 Starting full restore..."

# 1. PostgreSQL
pg_restore --dbname=$PG_URI $BACKUP_PATH/postgres-latest.dump

# 2. Memgraph
mgconsole < $BACKUP_PATH/memgraph-latest.cypherl

# 3. Qdrant
curl -X POST "http://qdrant:6333/collections/packages/snapshots/recover" \
  -d '{"location": "'$BACKUP_PATH'/qdrant-packages.snapshot"}'

# 4. Verify
./scripts/verify-restore.sh

echo "✅ Restore complete in $(elapsed)s"
```

### Weekly Restore Test (Staging)
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: restore-drill
spec:
  schedule: "0 3 * * 0"  # Every Sunday 3 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: restore-test
              image: idp-restore:latest
              command: ["./scripts/restore/test-restore.sh"]
```

---

# 📋 PHASE 4: Observability (Weeks 9-11)

## Epic 4.1: Distributed Tracing

### Stories
- [ ] OpenTelemetry SDK integration
- [ ] Trace propagation kroz Kafka
- [ ] Correlation: request_id + trace_id + tenant_id
- [ ] Structured logging (JSON)

### Log Format
```json
{
  "timestamp": "2026-01-12T06:30:00Z",
  "level": "INFO",
  "message": "Package query completed",
  "trace_id": "abc123",
  "span_id": "def456",
  "request_id": "req-789",
  "tenant_id": "tenant-xyz",
  "duration_ms": 45
}
```

---

## Epic 4.2: SLO/SLI Framework

### SLO Targets
| Service | Availability | Latency P99 | Error Rate |
|---------|-------------|-------------|------------|
| API Gateway | 99.9% | 200ms | 0.1% |
| GraphQL Queries | 99.5% | 500ms | 0.5% |
| Ingestion Pipeline | 99.0% | 5s | 1.0% |
| WebSocket | 99.5% | 100ms | 0.5% |

### Burn Rate Alerting
```yaml
# High burn rate (2x budget in 1h) → page
- alert: SLOBurnRateHigh
  expr: |
    (rate(http_requests_total{status=~"5.."}[1h]) 
    / rate(http_requests_total[1h])) > (14.4 * 0.001)
  labels:
    severity: critical

# Medium burn rate (6x budget in 6h) → ticket
- alert: SLOBurnRateMedium
  expr: |
    (rate(http_requests_total{status=~"5.."}[6h]) 
    / rate(http_requests_total[6h])) > (6 * 0.001)
  labels:
    severity: warning
```

---

# 📋 PHASE 5: Chaos Engineering (Weeks 12-13)

## Epic 5.1: Chaos Mesh Setup

### Prerequisites
- [ ] SLO alerting MORA biti stabilan pre chaos testova
- [ ] Samo staging prvo, prod canary later

### Steady-State Validation
```yaml
# Chaos test MORA imati pre/post condition
apiVersion: chaos-mesh.org/v1alpha1
kind: Workflow
metadata:
  name: api-resilience-test
spec:
  templates:
    - name: validate-steady-state
      container:
        image: chaos-validator
        command: ["./check-error-rate.sh", "--threshold=0.001"]
    
    - name: inject-failure
      chaos:
        kind: PodChaos
        spec:
          action: pod-kill
          selector:
            labelSelectors:
              app: api
    
    - name: validate-recovery
      container:
        image: chaos-validator
        command: ["./check-recovery.sh", "--timeout=60s"]
```

### Game Day Drill (Quarterly)
- [ ] Scenario: Memgraph failover
- [ ] Scenario: Network partition
- [ ] Scenario: High load spike
- [ ] Zapisnik za SOC2 evidence

---

# 📋 PHASE 6: API Versioning (Weeks 14-16)

## Epic 6.1: Schema Evolution

### Versioning Process
1. **Introduced** - Novi field dodat
2. **Deprecated** - Označen sa @deprecated + sunset datum
3. **Sunset** - Uklonjen iz schema

```graphql
type Query {
  # Deprecated - use packageByCoordinate
  package(id: ID!): Package 
    @deprecated(reason: "Use packageByCoordinate. Sunset: 2026-07-01")
  
  # New
  packageByCoordinate(
    ecosystem: Ecosystem!
    name: String!
  ): Package
}
```

### Usage Monitoring
```promql
# Track deprecated field usage
graphql_field_usage_total{field="package", deprecated="true"}
```

---

# 📋 PHASE 7: Compliance (Weeks 17-20)

## Epic 7.1: SOC2/GDPR Controls

### Required Controls
| Control | Implementation | Evidence |
|---------|----------------|----------|
| Data Classification | Labels na svim tabelama | Schema docs |
| Retention Policy | Auto-delete CronJob | Execution logs |
| Access Review | Quarterly report | Audit log export |
| Right to Forget | GDPR deletion API | API logs |
| Immutable Audit | S3 Object Lock | S3 settings |

### Data Retention CronJob
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: data-retention
spec:
  schedule: "0 4 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: retention
              image: data-retention:latest
              command:
                - /bin/sh
                - -c
                - |
                  # Delete audit logs older than 2 years
                  psql -c "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '2 years'"
                  # Archive to cold storage first
```

---

# 📋 PHASE 8: Advanced Deployment (Weeks 21-24)

## Epic 8.1: Feature Flags

### Integration (Unleash)
```rust
use unleash_client::Unleash;

pub async fn is_enabled(
    unleash: &Unleash,
    feature: &str,
    context: &TenantContext,
) -> bool {
    unleash.is_enabled(feature, Some(&UnleashContext {
        user_id: Some(context.user_id.to_string()),
        properties: hashmap!{
            "tenant_id" => context.tenant_id.to_string(),
            "tier" => context.rate_limit_tier.to_string(),
        },
    }))
}
```

---

## Epic 8.2: Blue-Green Deployments

### Prerequisites
- [ ] Feature flags za kill switch
- [ ] Expand/Contract DB migrations
- [ ] Read/write compatibility test

### Argo Rollout
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: api
spec:
  replicas: 3
  strategy:
    blueGreen:
      activeService: api-active
      previewService: api-preview
      autoPromotionEnabled: false
      prePromotionAnalysis:
        templates:
          - templateName: success-rate
        args:
          - name: service
            value: api-preview
```

---

# 📅 Timeline Summary

```
Week 1-2:   ████ Circuit Breaker + Resilience Stack
Week 3-6:   ████████ Multi-Tenancy + RBAC + Rate Limiting
Week 7-8:   ████ Disaster Recovery + Restore Tests
Week 9-11:  ██████ Observability (Tracing + SLOs)
Week 12-13: ████ Chaos Engineering
Week 14-16: ██████ API Versioning
Week 17-20: ████████ Compliance (SOC2/GDPR)
Week 21-24: ████████ Feature Flags + Blue-Green
```

**Total: 24 weeks to 100% enterprise maturity**

---

# ✅ Already Implemented

- JWT Authentication
- Distributed Rate Limiting (basic)
- Audit Logging
- Security Headers
- Input Validation
- Query Complexity Limits
- Retry with Backoff (partial)
- HPA + PDB
- SBOM Generation
- TLS Ingress

---

# 🎯 Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| MTTR | Unknown | < 15min |
| Deployment Frequency | Weekly | Daily |
| Change Failure Rate | Unknown | < 5% |
| SLO Compliance | N/A | > 99% |
| Security Audit Score | N/A | Pass |
