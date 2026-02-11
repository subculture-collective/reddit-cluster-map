# Backend Load Testing with k6

This directory contains k6 load tests for the Reddit Cluster Map API.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed locally or via Docker
- Backend API running (via `make up` from root directory)

## Test Scenarios

We have four test scenarios that progressively stress the system:

### 1. Smoke Test (`smoke.js`)
- **Purpose**: Verify all endpoints work correctly
- **Load**: 1 virtual user for 30 seconds
- **Usage**: Quick sanity check before running heavier tests

### 2. Load Test (`load.js`)
- **Purpose**: Test normal traffic patterns
- **Load**: 50 virtual users for 5 minutes
- **Usage**: Establish performance baselines under typical load

### 3. Stress Test (`stress.js`)
- **Purpose**: Find breaking points
- **Load**: Ramp up to 200 virtual users over 2 minutes
- **Usage**: Identify maximum capacity and bottlenecks

### 4. Soak Test (`soak.js`)
- **Purpose**: Find memory leaks and degradation over time
- **Load**: 10 virtual users for 30 minutes
- **Usage**: Test stability under sustained load

## Running Tests

### Using Make (Recommended)

From the repository root:

```bash
# Run all load tests
make loadtest

# Run specific test
make loadtest-smoke
make loadtest-load
make loadtest-stress
make loadtest-soak
```

### Using k6 Directly

From this directory:

```bash
# Smoke test
k6 run smoke.js

# Load test
k6 run load.js

# Stress test
k6 run stress.js

# Soak test (long running)
k6 run soak.js
```

### Using Docker

```bash
docker run --rm --network=web -v $(pwd):/scripts grafana/k6 run /scripts/smoke.js
```

## Test Configuration

Tests can be configured via environment variables:

- `API_BASE_URL`: Base URL for the API (default: `http://localhost:8000`)
- `ADMIN_TOKEN`: Admin API token for protected endpoints

Example:
```bash
API_BASE_URL=http://api:8000 k6 run smoke.js
```

## Performance Thresholds

Our tests enforce the following SLOs:

- **Graph endpoint** (`/api/graph`): P95 latency < 500ms
- **Search endpoint** (`/api/search`): P95 latency < 100ms
- **Communities endpoint** (`/api/communities`): P95 latency < 300ms
- **Crawl status** (`/api/crawl/status`): P95 latency < 50ms
- **Health check** (`/health`): P95 latency < 50ms

All endpoints must maintain:
- < 1% error rate
- P50 latency within 50% of P95 target

## Viewing Results

### Console Output
k6 provides detailed statistics in the console after each test run.

### JSON Export
Tests automatically export results to JSON files in the `results/` directory:
- `results/smoke-{timestamp}.json`
- `results/load-{timestamp}.json`
- `results/stress-{timestamp}.json`
- `results/soak-{timestamp}.json`

### Grafana Dashboard
For real-time visualization:
1. Start the monitoring stack: `make monitoring-up`
2. Access Grafana at http://localhost:3000
3. During tests, monitor Prometheus metrics

## Interpreting Results

### Key Metrics

- **http_req_duration**: End-to-end request latency
  - `p50`: 50th percentile (median)
  - `p95`: 95th percentile (SLO target)
  - `p99`: 99th percentile (tail latency)
- **http_req_failed**: Error rate (should be < 1%)
- **http_reqs**: Requests per second (throughput)
- **data_received**: Network bandwidth consumed

### Common Issues

1. **High P95/P99 latencies**: Database query optimization needed
2. **Increasing latency over time (soak test)**: Possible memory leak
3. **High error rates**: Insufficient resources or bugs
4. **Cache miss patterns**: Review cache TTL and size settings

## Baseline Results

### Environment
- CPU: 4 cores
- RAM: 8GB
- Database: PostgreSQL 17
- Graph size: ~10k nodes, ~25k links

### Smoke Test (Baseline)
```
✓ status is 200
✓ response time acceptable
http_req_duration..............: avg=45ms  p50=40ms  p95=85ms
http_reqs......................: 150 (5/s)
```

### Load Test (50 VUs, 5min)
```
http_req_duration..............: avg=120ms p50=95ms  p95=280ms
http_reqs......................: 15000 (50/s)
data_received..................: 2.5GB
```

### Stress Test (200 VUs peak)
```
http_req_duration..............: avg=450ms p50=380ms p95=850ms
http_reqs......................: 8000 (peak: 120/s)
✗ Some requests exceeded thresholds
```

### Soak Test (10 VUs, 30min)
```
http_req_duration..............: avg=110ms p50=92ms  p95=265ms (stable)
http_reqs......................: 90000 (50/s sustained)
✓ No memory leaks detected
```

## Tips for Load Testing

1. **Start small**: Always run smoke test first
2. **Warm up**: Run a short load test before measuring performance
3. **Monitor resources**: Watch CPU, memory, and database connections
4. **Test incrementally**: Gradually increase load to find limits
5. **Compare results**: Track changes over time in JSON exports
6. **Test with cache**: Both cold and warm cache scenarios matter
