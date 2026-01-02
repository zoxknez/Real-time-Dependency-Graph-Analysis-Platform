# IDP Helm Chart

Enterprise-grade Helm chart for deploying the Inverse Dependency Platform to Kubernetes.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.10+
- cert-manager (for TLS)
- nginx-ingress (or compatible ingress controller)
- External secrets operator (recommended for production)

## Quick Start

### Add dependencies

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm dependency update
```

### Install (Development)

```bash
helm install idp . -n idp-dev --create-namespace
```

### Install (Staging)

```bash
helm install idp . -n idp-staging --create-namespace \
  -f values-staging.yaml \
  --set global.image.tag=develop
```

### Install (Production)

```bash
helm install idp . -n idp-production --create-namespace \
  -f values-production.yaml \
  --set global.image.tag=v1.0.0
```

## Configuration

### Global Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.environment` | Environment name | `production` |
| `global.image.registry` | Image registry | `ghcr.io/example/idp` |
| `global.image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `global.image.tag` | Image tag | `latest` |

### API Service

| Parameter | Description | Default |
|-----------|-------------|---------|
| `api.enabled` | Enable API service | `true` |
| `api.replicaCount` | Number of replicas | `3` |
| `api.autoscaling.enabled` | Enable HPA | `true` |
| `api.resources.requests.cpu` | CPU request | `250m` |
| `api.resources.requests.memory` | Memory request | `512Mi` |

### Frontend Service

| Parameter | Description | Default |
|-----------|-------------|---------|
| `frontend.enabled` | Enable frontend | `true` |
| `frontend.replicaCount` | Number of replicas | `2` |

### Worker Services

Each worker service (ingestion, graphWriter, vectorWriter, analysis, syncer) has similar configuration options.

### Dependencies

| Parameter | Description | Default |
|-----------|-------------|---------|
| `redis.enabled` | Deploy Redis in-cluster | `true` |
| `memgraph.enabled` | Deploy Memgraph in-cluster | `false` |
| `memgraph.external.host` | External Memgraph host | `""` |

## Security Features

- **Pod Security**: Non-root containers, read-only filesystems
- **Network Policies**: Default-deny with explicit allow rules
- **RBAC**: Minimal permissions service account
- **Secret Management**: Support for external-secrets operator

## Monitoring

- Prometheus ServiceMonitor for metrics scraping
- PrometheusRule for alerting
- Grafana dashboards (see /dashboards directory)

## Upgrading

```bash
helm upgrade idp . -n idp-production \
  -f values-production.yaml \
  --set global.image.tag=v1.1.0
```

## Uninstalling

```bash
helm uninstall idp -n idp-production
```

## Development

### Lint

```bash
helm lint .
```

### Template (dry-run)

```bash
helm template idp . -f values-staging.yaml
```

### Test

```bash
helm test idp -n idp-staging
```
