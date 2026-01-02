# Load Testing

This directory contains k6 load testing scripts for the Dependency Graph API.

## Prerequisites

Install k6:
```bash
# Windows (scoop)
scoop install k6

# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6
```

## Test Scripts

### 1. GraphQL Queries (`graphql-queries.js`)

Tests the main GraphQL API endpoints:
- Package queries
- Search functionality  
- Reverse dependents
- Impact radius
- Graph statistics
- Version history

```bash
# Run with default settings (localhost:8080)
k6 run graphql-queries.js

# Run against different environment
k6 run -e API_URL=https://api.example.com graphql-queries.js

# Run with custom VU count
k6 run --vus 50 --duration 2m graphql-queries.js
```

### 2. WebSocket Subscriptions (`websocket-subscriptions.js`)

Tests real-time subscription functionality:
- New version events
- Breaking change alerts
- Live statistics
- Package events

```bash
# Run WebSocket tests
k6 run websocket-subscriptions.js

# Test mixed HTTP + WebSocket load
k6 run -e SCENARIO=mixed websocket-subscriptions.js
```

### 3. Rate Limiting (`rate-limiting.js`)

Tests rate limiting behavior:
- Free tier limits (100 req/min)
- Pro tier limits (1000 req/min)
- Burst handling
- Rate limit recovery

```bash
# Run rate limit tests
k6 run rate-limiting.js

# Test specific scenario
k6 run -e SCENARIO=free rate-limiting.js
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:8080` | API base URL |
| `SCENARIO` | varies | Test scenario to run |

### Thresholds

Default performance thresholds:
- 95th percentile response time < 500ms
- 99th percentile response time < 1000ms  
- Error rate < 1%
- Package query p95 < 200ms
- Search query p95 < 300ms

## Output

### Console Summary

After each run, k6 displays a summary:

```
     ✓ package query status 200
     ✓ package query has data
     ✓ search status 200

     checks.........................: 99.12% ✓ 8924      ✗ 79
     data_received..................: 15 MB  125 kB/s
     data_sent......................: 2.1 MB 18 kB/s
     http_req_duration..............: avg=45.2ms min=12ms med=38ms max=890ms p(95)=125ms p(99)=340ms
```

### JSON Output

Export results to JSON:
```bash
k6 run --out json=results.json graphql-queries.js
```

### InfluxDB + Grafana

Stream metrics to InfluxDB for visualization:
```bash
k6 run --out influxdb=http://localhost:8086/k6 graphql-queries.js
```

## CI Integration

Example GitHub Actions workflow:

```yaml
name: Load Tests
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Start services
        run: docker-compose up -d
        
      - name: Wait for API
        run: |
          timeout 60 bash -c 'until curl -s http://localhost:8080/health; do sleep 2; done'
          
      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update && sudo apt-get install k6
          
      - name: Run load tests
        run: k6 run tests/load/graphql-queries.js
        
      - name: Upload results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: load-test-results
          path: results.json
```

## Performance Baselines

Expected performance characteristics:

| Query Type | p50 | p95 | p99 |
|------------|-----|-----|-----|
| Package lookup | 15ms | 50ms | 100ms |
| Search | 30ms | 100ms | 200ms |
| Reverse dependents (depth=2) | 50ms | 150ms | 300ms |
| Impact radius | 100ms | 300ms | 500ms |
| Graph stats | 20ms | 80ms | 150ms |

## Troubleshooting

### High Error Rate

1. Check API logs for errors
2. Verify database connectivity
3. Check rate limiting configuration
4. Ensure sufficient resources

### Slow Response Times

1. Check database query performance
2. Review caching configuration
3. Monitor CPU/memory usage
4. Check network latency

### WebSocket Failures

1. Verify WebSocket endpoint is accessible
2. Check for proxy/load balancer timeouts
3. Review subscription limits
