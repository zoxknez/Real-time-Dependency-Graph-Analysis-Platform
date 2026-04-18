# 🚀 IDP Platform - Deployment Guide

> **Version**: 1.0.0  
> **Last Updated**: 18. April 2026  
> **Target**: Production Deployment

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Single Region Deployment](#single-region-deployment)
3. [Multi-Region Deployment](#multi-region-deployment)
4. [Configuration](#configuration)
5. [Monitoring Setup](#monitoring-setup)
6. [Security Hardening](#security-hardening)
7. [Troubleshooting](#troubleshooting)

---

## 🔧 Prerequisites

### Infrastructure Requirements

#### Minimum (Single Region):
- **Kubernetes Cluster**: v1.25+
- **Nodes**: 5 nodes (4 vCPU, 16GB RAM each)
- **Storage**: 500GB persistent storage
- **Network**: 1Gbps bandwidth

#### Recommended (Production):
- **Kubernetes Cluster**: v1.27+
- **Nodes**: 10 nodes (8 vCPU, 32GB RAM each)
- **Storage**: 2TB persistent storage with SSD
- **Network**: 10Gbps bandwidth
- **Load Balancer**: External load balancer

#### Multi-Region:
- **Regions**: 3+ regions (US, EU, APAC)
- **Nodes per Region**: 10 nodes (8 vCPU, 32GB RAM)
- **Storage per Region**: 2TB SSD
- **Cross-Region Bandwidth**: 1Gbps+

### Software Requirements

```bash
# Required tools
kubectl >= 1.25
helm >= 3.10
docker >= 20.10
git >= 2.30

# Optional but recommended
k9s >= 0.27
kubectx >= 0.9
stern >= 1.22
```

### Access Requirements

- Kubernetes cluster admin access
- Container registry access
- DNS management access
- SSL certificate management
- Cloud provider credentials (AWS/GCP/Azure)

---

## 🌍 Single Region Deployment

### Step 1: Prepare Environment

```bash
# Clone repository
git clone https://github.com/your-org/idp.git
cd idp

# Set environment
export ENVIRONMENT=production
export REGION=us-east-1
export NAMESPACE=idp-prod

# Create namespace
kubectl create namespace $NAMESPACE
```

### Step 2: Configure Secrets

```bash
# Create secrets file
cat > secrets.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: idp-secrets
  namespace: $NAMESPACE
type: Opaque
stringData:
  # Database passwords
  postgres-password: "$(openssl rand -base64 32)"
  redis-password: "$(openssl rand -base64 32)"
  
  # API keys
  gemini-api-key: "your-gemini-api-key"
  
  # JWT secret
  jwt-secret: "$(openssl rand -base64 64)"
  
  # Connection strings
  postgres-url: "postgresql://idp:password@postgres:5432/idp"
  redis-url: "redis://:password@redis:6379"
EOF

# Apply secrets
kubectl apply -f secrets.yaml
```

### Step 3: Configure Values

```bash
# Create custom values file
cat > values-production.yaml <<EOF
global:
  imageRegistry: "registry.idp.com"
  environment: production

api:
  replicaCount: 3
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 4000m
      memory: 8Gi
  
  cache:
    enabled: true
    l1MaxSize: 10000
    l2Ttl: 300
    strategy: "WriteAround"
    compression: true
  
  circuitBreaker:
    enabled: true
    failureThreshold: 0.5
    timeout: 30
  
  streaming:
    enabled: true
    batchSize: 100

redis:
  enabled: true
  architecture: replication
  replica:
    replicaCount: 2

postgresql:
  enabled: true
  primary:
    persistence:
      size: 50Gi

kafka:
  enabled: true
  replicaCount: 3

memgraph:
  enabled: true
  persistence:
    size: 100Gi

qdrant:
  enabled: true
  persistence:
    size: 50Gi

monitoring:
  enabled: true
  prometheus:
    retention: 15d
  grafana:
    enabled: true
EOF
```

### Step 4: Deploy with Helm

```bash
# Add Helm dependencies
helm dependency update deploy/helm/idp

# Install IDP Platform
helm install idp deploy/helm/idp \
  --namespace $NAMESPACE \
  --values values-production.yaml \
  --timeout 15m \
  --wait

# Verify deployment
kubectl get pods -n $NAMESPACE
kubectl get svc -n $NAMESPACE
```

### Step 5: Configure Ingress

```bash
# Create ingress
cat > ingress.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: idp-ingress
  namespace: $NAMESPACE
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.idp.com
    - idp.com
    secretName: idp-tls
  rules:
  - host: api.idp.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: idp-api
            port:
              number: 8080
  - host: idp.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: idp-frontend
            port:
              number: 3000
EOF

kubectl apply -f ingress.yaml
```

### Step 6: Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n $NAMESPACE

# Check services
kubectl get svc -n $NAMESPACE

# Check ingress
kubectl get ingress -n $NAMESPACE

# Test API endpoint
curl https://api.idp.com/health

# Test frontend
curl https://idp.com
```

---

## 🌐 Multi-Region Deployment

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              Global Load Balancer (GeoDNS)              │
└────────────┬────────────────────────────┬────────────────┘
             │                            │
    ┌────────▼────────┐          ┌───────▼─────────┐
    │   Region: US    │◄────────►│  Region: EU     │
    │   (Primary)     │          │  (Secondary)    │
    └────────┬────────┘          └────────┬────────┘
             │                            │
    ┌────────▼────────┐          ┌───────▼─────────┐
    │  IDP Platform   │          │  IDP Platform   │
    │  (Full Stack)   │          │  (Full Stack)   │
    └─────────────────┘          └─────────────────┘
```

### Step 1: Deploy Primary Region (US)

```bash
# Set region
export REGION=us-east-1
export NAMESPACE=idp-us

# Create namespace
kubectl create namespace $NAMESPACE

# Deploy with multi-region values
helm install idp-us deploy/helm/idp \
  --namespace $NAMESPACE \
  --values deploy/helm/idp/values-multiregion.yaml \
  --set global.region=$REGION \
  --set global.isPrimary=true \
  --timeout 20m \
  --wait
```

### Step 2: Deploy Secondary Region (EU)

```bash
# Switch to EU cluster
kubectl config use-context eu-cluster

# Set region
export REGION=eu-west-1
export NAMESPACE=idp-eu

# Create namespace
kubectl create namespace $NAMESPACE

# Deploy
helm install idp-eu deploy/helm/idp \
  --namespace $NAMESPACE \
  --values deploy/helm/idp/values-multiregion.yaml \
  --set global.region=$REGION \
  --set global.isPrimary=false \
  --timeout 20m \
  --wait
```

### Step 3: Configure Cross-Region Replication

#### Memgraph Replication

```bash
# On primary region
kubectl exec -it memgraph-0 -n idp-us -- \
  mgconsole -e "
    CREATE REPLICATION LINK eu_replica 
    TO 'memgraph-eu.idp.internal:7687' 
    WITH USER 'replicator' PASSWORD 'password';
  "

# Verify replication
kubectl exec -it memgraph-0 -n idp-us -- \
  mgconsole -e "SHOW REPLICATION LINKS;"
```

#### Redis Replication

```bash
# Configure Redis Sentinel
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-sentinel-config
  namespace: idp-us
data:
  sentinel.conf: |
    sentinel monitor mymaster redis-master 6379 2
    sentinel down-after-milliseconds mymaster 5000
    sentinel parallel-syncs mymaster 1
    sentinel failover-timeout mymaster 10000
EOF
```

#### Kafka MirrorMaker

```bash
# Deploy MirrorMaker
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-mirrormaker
  namespace: idp-us
spec:
  replicas: 2
  selector:
    matchLabels:
      app: kafka-mirrormaker
  template:
    metadata:
      labels:
        app: kafka-mirrormaker
    spec:
      containers:
      - name: mirrormaker
        image: confluentinc/cp-kafka:7.5.0
        command:
        - kafka-mirror-maker
        - --consumer.config=/config/consumer.properties
        - --producer.config=/config/producer.properties
        - --whitelist=".*"
        volumeMounts:
        - name: config
          mountPath: /config
      volumes:
      - name: config
        configMap:
          name: mirrormaker-config
EOF
```

### Step 4: Configure GeoDNS

#### Using Cloudflare

```bash
# Create DNS records
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "api.idp.com",
    "content": "US_LOAD_BALANCER_IP",
    "proxied": true,
    "ttl": 1,
    "priority": 10
  }'

curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "api.idp.com",
    "content": "EU_LOAD_BALANCER_IP",
    "proxied": true,
    "ttl": 1,
    "priority": 20
  }'

# Configure load balancing
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/load_balancers" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "api.idp.com",
    "default_pools": ["us-pool", "eu-pool"],
    "fallback_pool": "us-pool",
    "steering_policy": "geo",
    "session_affinity": "cookie"
  }'
```

### Step 5: Verify Multi-Region Setup

```bash
# Test from different regions
curl -H "X-Region: us" https://api.idp.com/health
curl -H "X-Region: eu" https://api.idp.com/health

# Check replication lag
kubectl exec -it memgraph-0 -n idp-us -- \
  mgconsole -e "SHOW REPLICATION STATUS;"

# Monitor cross-region traffic
kubectl logs -f -l app=kafka-mirrormaker -n idp-us
```

---

## ⚙️ Configuration

### Environment Variables

```bash
# API Configuration
RUST_LOG=info,api=debug
ENVIRONMENT=production
RATE_LIMIT_RPM=1000
MAX_COMPLEXITY=1000
QUERY_TIMEOUT_SECS=30

# Cache Configuration
CACHE_L1_MAX_SIZE=10000
CACHE_L2_TTL=300
CACHE_STRATEGY=WriteAround
CACHE_COMPRESSION=true

# Circuit Breaker Configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD=0.5
CIRCUIT_BREAKER_TIMEOUT=30
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=5
CIRCUIT_BREAKER_MAX_CONCURRENT=100

# Streaming Configuration
STREAM_BATCH_SIZE=100
STREAM_MAX_ITEMS=10000
STREAM_BUFFER_SIZE=1000

# Database URLs
MEMGRAPH_URI=bolt://memgraph:7687
REDIS_URL=redis://redis:6379
POSTGRES_URL=postgresql://user:pass@postgres:5432/idp
KAFKA_BROKERS=kafka:9092
QDRANT_URL=http://qdrant:6333
```

### Resource Limits

```yaml
# Production resource recommendations
api:
  requests:
    cpu: 1000m
    memory: 2Gi
  limits:
    cpu: 4000m
    memory: 8Gi

memgraph:
  requests:
    cpu: 4000m
    memory: 8Gi
  limits:
    cpu: 16000m
    memory: 32Gi

qdrant:
  requests:
    cpu: 2000m
    memory: 4Gi
  limits:
    cpu: 8000m
    memory: 16Gi
```

---

## 📊 Monitoring Setup

### Prometheus Configuration

```bash
# Deploy Prometheus
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi
```

### Grafana Dashboards

```bash
# Import IDP dashboards
kubectl create configmap idp-dashboards \
  --from-file=observability/dashboards/ \
  --namespace monitoring

# Configure Grafana datasource
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-datasources
  namespace: monitoring
data:
  datasources.yaml: |
    apiVersion: 1
    datasources:
    - name: Prometheus
      type: prometheus
      url: http://prometheus:9090
      isDefault: true
EOF
```

### Alerting

```bash
# Configure AlertManager
kubectl apply -f observability/alerts/
```

---

## 🔒 Security Hardening

### Network Policies

```bash
# Apply network policies
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: idp-network-policy
  namespace: idp-prod
spec:
  podSelector:
    matchLabels:
      app: idp
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: idp-prod
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 6379  # Redis
    - protocol: TCP
      port: 5432  # PostgreSQL
    - protocol: TCP
      port: 7687  # Memgraph
EOF
```

### Pod Security Standards

```bash
# Apply pod security standards
kubectl label namespace idp-prod \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/warn=restricted
```

### TLS/SSL Configuration

```bash
# Install cert-manager
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true

# Create ClusterIssuer
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@idp.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

---

## 🔧 Troubleshooting

### Common Issues

#### 1. Pods Not Starting

```bash
# Check pod status
kubectl get pods -n idp-prod

# Describe pod
kubectl describe pod <pod-name> -n idp-prod

# Check logs
kubectl logs <pod-name> -n idp-prod

# Common fixes:
# - Check resource limits
# - Verify secrets exist
# - Check image pull secrets
```

#### 2. Database Connection Issues

```bash
# Test PostgreSQL connection
kubectl run -it --rm debug --image=postgres:15 --restart=Never -- \
  psql -h postgres -U idp -d idp

# Test Redis connection
kubectl run -it --rm debug --image=redis:7 --restart=Never -- \
  redis-cli -h redis ping

# Test Memgraph connection
kubectl run -it --rm debug --image=memgraph/memgraph:3.9.0 --restart=Never -- \
  mgconsole --host memgraph --port 7687
```

#### 3. High Memory Usage

```bash
# Check memory usage
kubectl top pods -n idp-prod

# Check Memgraph memory
kubectl exec -it memgraph-0 -n idp-prod -- \
  mgconsole -e "SHOW STORAGE INFO;"

# Restart if needed
kubectl rollout restart deployment/idp-api -n idp-prod
```

#### 4. Circuit Breaker Open

```bash
# Check circuit breaker metrics
kubectl port-forward svc/idp-api 9090:9090 -n idp-prod
curl http://localhost:9090/metrics | grep circuit_breaker

# Check error logs
kubectl logs -l app=idp-api -n idp-prod | grep ERROR

# Reset circuit breaker (restart pods)
kubectl rollout restart deployment/idp-api -n idp-prod
```

### Health Checks

```bash
# API health
curl https://api.idp.com/health

# Readiness check
curl https://api.idp.com/ready

# Memgraph memory
curl https://api.idp.com/memgraph/memory

# Prometheus metrics
curl https://api.idp.com/metrics
```

---

## 📚 Additional Resources

- [Architecture Documentation](./ARCHITECTURE.md)
- [Advanced Features Guide](./ADVANCED_FEATURES.md)
- [API Reference](./API.md)
- [Runbook](./RUNBOOK.md)
- [Security Guide](./SECURITY.md)

---

**Version**: 1.0.0  
**Last Updated**: 18. April 2026  
**Maintained by**: IDP Platform Team