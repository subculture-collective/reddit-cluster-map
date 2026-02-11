# Load Testing with k6

This guide covers the k6-based load testing infrastructure for the Reddit Cluster Map backend API.

## Overview

The load testing suite uses [k6](https://k6.io/), a modern open-source load testing tool, to:

- Verify API performance under various load conditions
- Establish performance baselines and SLOs
- Identify bottlenecks and resource constraints
- Detect memory leaks and performance degradation over time
- Test cache effectiveness under concurrent load

## Test Scenarios

Four test scenarios provide comprehensive coverage:

| Test | VUs | Duration | Purpose |
|------|-----|----------|---------|
| **Smoke** | 1 | 30s | Quick sanity check - verify all endpoints work |
| **Load** | 50 | 5min | Normal traffic - establish performance baselines |
| **Stress** | 0→200 | 2min | Find breaking points - identify max capacity |
| **Soak** | 10 | 30min | Memory leak detection - sustained load stability |

## Tested Endpoints

The load tests cover these key API endpoints:

- `/health` - Health check
- `/api/graph` - Primary graph data endpoint (most critical)
- `/api/search` - Node search functionality
- `/api/communities` - Community detection results
- `/api/communities/{id}` - Individual community drill-down
- `/api/crawl/status` - Crawler status
- `/api/export` - Data export functionality

## Performance SLOs

Our Service Level Objectives (latency targets):

| Endpoint | P50 Target | P95 Target | Error Rate |
|----------|-----------|-----------|------------|
| `/api/graph` | < 250ms | < 500ms | < 1% |
| `/api/search` | < 50ms | < 100ms | < 1% |
| `/api/communities` | < 150ms | < 300ms | < 1% |
| `/api/crawl/status` | < 25ms | < 50ms | < 1% |
| `/health` | < 25ms | < 50ms | < 1% |

These thresholds are enforced in the k6 tests and will cause test failures if violated.

## Prerequisites

### Running with Docker (Recommended)

All you need is:
- Docker and Docker Compose
- Backend services running (`make up`)

k6 runs in a container - no local installation required.

### Running Locally (Alternative)

If you prefer to run k6 locally:
1. Install k6: https://k6.io/docs/get-started/installation/
2. Set environment variables:
   ```bash
   export API_BASE_URL=http://localhost:8000
   export ADMIN_TOKEN=your_admin_token_here
   ```

## Running Tests

### Quick Start

From the repository root:

```bash
# Ensure services are running
make up

# Run smoke test (30 seconds)
make loadtest-smoke

# Run load test (5 minutes)
make loadtest-load

# Run all tests sequentially (~40 minutes)
make loadtest
```

### Individual Test Commands

```bash
# Smoke test - quick validation
make loadtest-smoke

# Load test - establish baselines
make loadtest-load

# Stress test - find limits
make loadtest-stress

# Soak test - detect memory leaks (30 minutes!)
make loadtest-soak
```

### Using k6 Directly

From `backend/loadtest/`:

```bash
# With Docker
docker run --rm --network=web \
  -v $(pwd):/scripts \
  -e API_BASE_URL=http://api:8000 \
  grafana/k6 run /scripts/smoke.js

# With local k6 install
k6 run smoke.js
```

## Test Results

### Console Output

k6 provides real-time statistics during test execution and a detailed summary at the end:

```
✓ graph: status is 200
✓ graph: valid JSON

scenarios: (100.00%) 1 scenario, 50 max VUs, 5m30s max duration
default: 50 looping VUs for 5m0s (gracefulStop: 30s)

     data_received..................: 2.5 GB  8.3 MB/s
     data_sent......................: 1.2 MB  4.0 kB/s
     http_req_blocked...............: avg=1.2ms    p(95)=3.5ms
     http_req_duration..............: avg=120ms    p(95)=280ms
     http_reqs......................: 15000   50/s
     vus............................: 50      min=50 max=50
     vus_max........................: 50      min=50 max=50
```

### JSON Export

Results are automatically saved to `backend/loadtest/results/` as timestamped JSON files:

```
results/
├── smoke-2026-02-11T21-45-00.json
├── load-2026-02-11T21-48-30.json
├── stress-2026-02-11T22-15-00.json
└── soak-2026-02-11T22-50-00.json
```

These files contain:
- Request metrics (latency percentiles, throughput, error rates)
- Check results (passed/failed assertions)
- Custom tags and groups
- Full test configuration

Use JSON results to:
- Track performance changes over time
- Generate custom reports
- Integrate with CI/CD pipelines
- Compare different configurations

### View Recent Results

```bash
make loadtest-results
```

## Monitoring During Tests

### Prometheus + Grafana

For real-time system metrics during load tests:

1. Start monitoring stack:
   ```bash
   make monitoring-up
   ```

2. Open Grafana: http://localhost:3000
   - Default credentials: admin/admin

3. View dashboards during tests:
   - HTTP request rates and latencies
   - Database connection pool usage
   - Cache hit/miss ratios
   - Memory and CPU usage
   - Active goroutines

4. Open Prometheus: http://localhost:9090
   - Query custom metrics
   - Explore API-specific metrics

### Key Metrics to Watch

During load tests, monitor:

- **API Latency**: `http_request_duration_seconds`
- **Request Rate**: `http_requests_total`
- **Error Rate**: `http_request_errors_total`
- **Cache Stats**: `api_cache_size_bytes`, `api_cache_items`
- **Database Connections**: `db_connections_active`
- **Memory Usage**: Container memory via Docker stats
- **CPU Usage**: Container CPU via Docker stats

### Live Metrics (Shell)

```bash
# Monitor API container resources
docker stats reddit-cluster-api

# Watch API logs
make logs-api

# Watch database logs
make logs-db
```

## Interpreting Results

### Successful Test

A passing test shows:

```
✓ All checks passed
✓ All thresholds met
http_req_failed: 0.05% (under 1% threshold)
http_req_duration p(95): 280ms (under 500ms threshold)
```

### Common Issues

#### High P95/P99 Latencies

**Symptoms:**
- P95 > 500ms for graph endpoint
- P99 significantly higher than P95

**Likely Causes:**
- Database query performance
- Missing indexes
- Large result sets
- Inefficient joins

**Solutions:**
- Run `EXPLAIN ANALYZE` on slow queries
- Add appropriate indexes
- Optimize graph precalculation
- Implement query result pagination

#### Increasing Latency Over Time (Soak Test)

**Symptoms:**
- Response times grow steadily during soak test
- Memory usage increases continuously

**Likely Causes:**
- Memory leak in application code
- Database connection leak
- Cache growing unbounded
- Goroutine leak

**Solutions:**
- Profile with `pprof` endpoints (`/debug/pprof/heap`)
- Check for unclosed database connections
- Review cache TTL and eviction policies
- Monitor goroutine count

#### High Error Rates

**Symptoms:**
- http_req_failed > 1%
- HTTP 5xx errors

**Likely Causes:**
- Insufficient resources (CPU, memory)
- Database connection pool exhaustion
- Application crashes/panics
- Timeout issues

**Solutions:**
- Check container logs: `make logs-api`
- Increase resource limits in docker-compose.yml
- Adjust database connection pool settings
- Review and adjust timeout configurations

#### Cache Ineffectiveness

**Symptoms:**
- Similar performance with and without cache
- Low cache hit rate in Prometheus metrics

**Likely Causes:**
- Cache TTL too short
- Query parameters too varied (poor cache key design)
- Cache size too small
- Cache warming not implemented

**Solutions:**
- Increase `CACHE_TTL_SECONDS`
- Increase `CACHE_MAX_SIZE_MB`
- Normalize query parameters
- Implement cache prewarming

## Baseline Performance

These baselines are from a development environment:

**Environment:**
- CPU: 4 cores
- RAM: 8GB  
- Database: PostgreSQL 17
- Graph: ~10k nodes, ~25k links
- Cache: 512MB, 60s TTL

### Smoke Test

```
Duration: 30s
VUs: 1

http_req_duration
  avg:  45ms
  p50:  40ms
  p95:  85ms
  p99: 120ms

http_reqs: 150 (5/s)
http_req_failed: 0%

✓ All checks passed
```

### Load Test

```
Duration: 5m
VUs: 50 (sustained)

http_req_duration
  avg: 120ms
  p50:  95ms
  p95: 280ms
  p99: 450ms

http_reqs: 15,000 (50/s sustained)
data_received: 2.5GB
http_req_failed: 0.1%

✓ All thresholds met
```

### Stress Test

```
Duration: 2m
VUs: 0→200 (ramping)

http_req_duration
  avg: 450ms
  p50: 380ms
  p95: 850ms
  p99: 1.2s

Peak RPS: 120/s
http_req_failed: 2.3%

✗ Some P95 thresholds exceeded (expected)
```

### Soak Test

```
Duration: 30m
VUs: 10 (sustained)

http_req_duration (stable throughout)
  avg: 110ms
  p50:  92ms
  p95: 265ms
  p99: 420ms

http_reqs: 90,000 (50/s sustained)
http_req_failed: 0.05%

Memory: Stable (no leaks detected)
✓ All thresholds met
✓ No performance degradation
```

## CI Integration

### GitHub Actions

Load tests can be integrated into CI pipelines:

```yaml
# .github/workflows/loadtest.yml
name: Load Tests

on:
  workflow_dispatch:
  schedule:
    - cron: '0 2 * * 0'  # Weekly on Sunday at 2 AM

jobs:
  loadtest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Start services
        run: make up && make migrate-up
      
      - name: Wait for services
        run: sleep 30
      
      - name: Run smoke test
        run: make loadtest-smoke
      
      - name: Run load test
        run: make loadtest-load
      
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: backend/loadtest/results/*.json
```

### Regression Testing

Compare results over time:

```bash
# Generate comparison report (custom script)
./scripts/compare-loadtest-results.sh \
  results/load-2026-02-01.json \
  results/load-2026-02-11.json
```

## Best Practices

### Before Running Tests

1. **Ensure stable baseline:**
   - Run tests on a clean database with consistent data
   - Warm up the cache with a few requests first
   - Close unnecessary background processes

2. **Monitor resources:**
   - Start Grafana/Prometheus before tests
   - Keep htop/docker stats open
   - Check disk space for results

3. **Set realistic expectations:**
   - Development hardware ≠ production hardware
   - Tests measure relative performance, not absolute
   - Baseline results are environment-specific

### During Tests

1. **Don't interfere:**
   - Avoid making API calls manually
   - Don't restart services mid-test
   - Let long tests (soak) complete fully

2. **Watch for issues:**
   - Monitor error rates in real-time
   - Check for service crashes
   - Watch memory trends in soak tests

3. **Document observations:**
   - Note any anomalies
   - Record environmental factors
   - Capture Grafana screenshots for reports

### After Tests

1. **Review results:**
   - Check all thresholds
   - Compare with baselines
   - Investigate failures

2. **Update baselines:**
   - After major changes, re-establish baselines
   - Document new baselines in this file
   - Adjust thresholds if needed

3. **Take action:**
   - File issues for performance regressions
   - Prioritize optimization work
   - Celebrate improvements! 🎉

## Troubleshooting

### k6 Container Issues

```bash
# Clean up k6 containers
docker compose -f backend/docker-compose.yml \
  -f backend/docker-compose.loadtest.yml down k6

# Rebuild k6 service
docker compose -f backend/docker-compose.yml \
  -f backend/docker-compose.loadtest.yml pull k6
```

### Network Connectivity

```bash
# Test API connectivity from k6 network
docker run --rm --network=web curlimages/curl:latest \
  curl -v http://api:8000/health
```

### Script Validation

```bash
# Validate all test scripts
cd backend/loadtest
./validate.sh
```

### High Resource Usage

If tests consistently fail due to resources:

1. Reduce VU counts in test scripts
2. Shorten test durations
3. Increase Docker resource limits:
   ```bash
   # Edit docker-compose.yml
   services:
     api:
       deploy:
         resources:
           limits:
             cpus: '2'
             memory: 4G
   ```

## Advanced Usage

### Custom Test Scenarios

Create new test scripts based on `smoke.js`:

```javascript
// backend/loadtest/custom.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API_BASE_URL, commonParams } from './common.js';

export const options = {
    vus: 25,
    duration: '2m',
};

export default function() {
    // Your custom test logic
}
```

Run with:
```bash
docker run --rm --network=web \
  -v $(pwd)/backend/loadtest:/scripts \
  grafana/k6 run /scripts/custom.js
```

### Environment-Specific Tests

Override API URL for different environments:

```bash
# Test staging
API_BASE_URL=https://staging-api.example.com make loadtest-smoke

# Test production (be careful!)
API_BASE_URL=https://api.example.com make loadtest-smoke
```

### Distributed Load Testing

For very high load, use k6 Cloud or distributed execution:

```bash
# Run on multiple machines
k6 run --out cloud script.js
```

See: https://k6.io/docs/cloud/

## Further Reading

- [k6 Documentation](https://k6.io/docs/)
- [k6 Best Practices](https://k6.io/docs/testing-guides/test-types/)
- [Performance Testing Guides](https://k6.io/docs/testing-guides/)
- [k6 Cloud](https://k6.io/cloud/) - SaaS load testing platform

## Support

For issues or questions:

1. Check this documentation
2. Review test script comments in `backend/loadtest/`
3. Consult k6 documentation
4. Open an issue on GitHub
