# Observability

This directory contains monitoring, alerting, and dashboard configurations.

## Structure

```
observability/
├── dashboards/          # Grafana dashboards (JSON)
├── alerts/              # Prometheus alerting rules
├── runbooks/            # Incident response runbooks
└── log-pipelines/       # Log processing configs
```

## Dashboards

| Dashboard | Description |
|-----------|-------------|
| `platform-overview.json` | High-level platform health |
| `ingestion-metrics.json` | Crawler and producer metrics |
| `storage-writers.json` | Graph/Vector writer performance |
| `api-gateway.json` | API latency and error rates |

## Alerts

Key alerts defined:
- `HighKafkaLag` - Consumer lag > 10k messages
- `HighErrorRate` - Error rate > 1% for 5 minutes
- `P95LatencyHigh` - API p95 > 500ms
- `StoragePressure` - Disk usage > 80%

## SLOs

| Metric | Target |
|--------|--------|
| API Availability | 99.9% |
| API p95 Latency | < 200ms |
| Event Processing Delay | < 5 seconds |
| Graph Query p95 | < 300ms |
