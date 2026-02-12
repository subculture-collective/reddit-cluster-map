# Analytics and Monitoring Guide

This guide explains how to use the analytics and monitoring infrastructure for the Reddit Cluster Map project.

## Overview

The monitoring stack includes:
- **Prometheus** - Metrics collection and storage
- **Grafana** - Visualization and dashboards
- **Alert Rules** - Automated alerting for critical issues
- **SLO/SLI Tracking** - Service level objectives with error budget monitoring

For comprehensive SLO documentation, see [docs/slos.md](slos.md).

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│ API Server  │────▶│  Prometheus  │────▶│ Grafana  │
│ /metrics    │     │   (port 9090)│     │(port 3000)│
└─────────────┘     └──────────────┘     └──────────┘
       │                    │
       │                    │
       ▼                    ▼
  Exposes metrics     Stores & queries
  - Crawl stats       time-series data
  - API performance
  - DB operations
  - Graph metrics
```

## Quick Start

### Starting the Monitoring Stack

The monitoring services are included in the main docker-compose configuration:

```bash
cd backend
docker compose up -d
```

This will start:
- API server (port 8000)
- Prometheus (port 9090)
- Grafana (port 3000)
- Database and other services

### Accessing the Services

1. **Prometheus UI**: http://localhost:9090
   - View raw metrics
   - Test PromQL queries
   - Check alert status

2. **Grafana**: http://localhost:3000
   - Default credentials: admin / admin (or set via `GRAFANA_ADMIN_PASSWORD`)
   - Pre-configured dashboards
   - Custom query builder

3. **Metrics Endpoint**: http://localhost:8000/metrics
   - Raw Prometheus metrics in text format
   - Updated every 30 seconds by the metrics collector

## Available Metrics

### Crawler Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `crawler_jobs_total{status}` | Counter | Total crawl jobs by status (success/failed) |
| `crawler_job_duration_seconds{status}` | Histogram | Duration of crawl jobs |
| `crawler_http_requests_total{status}` | Counter | HTTP requests to Reddit API |
| `crawler_http_retries_total` | Counter | Number of HTTP retries |
| `crawler_rate_limit_waits_total` | Counter | Times crawler waited for rate limit |
| `crawler_posts_processed_total` | Counter | Posts processed by crawler |
| `crawler_comments_processed_total` | Counter | Comments processed by crawler |
| `crawl_jobs_pending` | Gauge | Current pending jobs |
| `crawl_jobs_processing` | Gauge | Currently processing jobs |
| `crawl_jobs_completed` | Gauge | Total completed jobs |
| `crawl_jobs_failed` | Gauge | Total failed jobs |

### Graph Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `graph_nodes_total{type}` | Gauge | Graph nodes by type (user/subreddit/post/comment) |
| `graph_links_total` | Gauge | Total graph links |
| `graph_precalculation_duration_seconds` | Histogram | Graph precalculation duration |
| `graph_precalculation_errors_total` | Counter | Precalculation errors |
| `communities_total` | Gauge | Detected communities |
| `community_detection_duration_seconds` | Histogram | Community detection duration |

### API Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `api_requests_total{endpoint,method,status}` | Counter | Total API requests |
| `api_request_duration_seconds{endpoint,method,status}` | Histogram | API request duration |
| `api_cache_hits_total{endpoint}` | Counter | Cache hits |
| `api_cache_misses_total{endpoint}` | Counter | Cache misses |

### Database Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `db_operation_duration_seconds{operation}` | Histogram | Database operation duration |
| `db_operation_errors_total{operation}` | Counter | Database errors |

### Circuit Breaker Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `circuit_breaker_state{component}` | Gauge | Circuit breaker state (0=closed, 1=open, 2=half-open) |
| `circuit_breaker_trips_total{component}` | Counter | Circuit breaker trips |

## Dashboards

### System Overview Dashboard

The main dashboard (`Reddit Cluster Map - System Overview`) provides:

1. **Key Performance Indicators (KPIs)**
   - Total graph nodes
   - Total graph links
   - Communities detected
   - Pending crawl jobs

2. **Graph Growth**
   - Nodes by type over time
   - Link growth

3. **Crawl Job Status**
   - Job queue status (pending/processing/completed/failed)
   - Job throughput
   - Content processing rate (posts/comments)

4. **API Performance**
   - Request rate by endpoint
   - Response time percentiles (p50, p95, p99)
   - Error rates

5. **Database Performance**
   - Operation duration
   - Error rates

### SLO Dashboard

The SLO dashboard (`Reddit Cluster Map - SLO Dashboard`) provides comprehensive Service Level Objective tracking:

1. **SLO Compliance Gauges**
   - API Availability (99.5% target)
   - Graph Endpoint Latency (99% < 500ms target)
   - Frontend Load Time (95% < 3s target)

2. **Error Budget Tracking**
   - Remaining error budget for each SLO
   - Visual indicators (green/yellow/red)

3. **SLI Trends**
   - Multi-window SLI performance (5m, 1h, 1d, 30d)
   - Historical compliance tracking

4. **Burn Rate Monitoring**
   - Fast burn rate (1-hour window)
   - Slow burn rate (6-hour window)
   - Alert threshold indicators

5. **Performance Metrics**
   - P95 latency trends
   - Active SLO alerts

For detailed SLO documentation, see [docs/slos.md](slos.md).

### Creating Custom Dashboards

1. Navigate to Grafana (http://localhost:3000)
2. Click "+" → "Dashboard"
3. Add panels with PromQL queries
4. Example queries:
   ```promql
   # Crawl success rate
   rate(crawler_jobs_total{status="success"}[5m]) 
   / 
   rate(crawler_jobs_total[5m])

   # Top slow endpoints
   topk(5, 
     histogram_quantile(0.95, 
       sum(rate(api_request_duration_seconds_bucket[5m])) by (le, endpoint)
     )
   )
   ```

## Alerts

### Alert Rules

Alerts are defined in two files:

**System Alerts** (`monitoring/prometheus/alerts/reddit-cluster-map.yml`):

| Alert | Condition | Severity | Description |
|-------|-----------|----------|-------------|
| HighAPIErrorRate | Error rate > 5% for 5m | warning | API errors exceed threshold |
| HighCrawlerErrorRate | Error rate > 10% for 10m | warning | Crawler failures too frequent |
| SlowAPIQueries | p95 > 2s for 5m | warning | API response times degraded |
| DatabaseOperationErrors | Error rate > 0.1/s | critical | Database errors detected |
| CircuitBreakerTripped | Any trips | warning | Circuit breaker activated |
| NoCrawlJobsProcessing | No processing for 30m | warning | Crawler may be stuck |
| HighFailedJobCount | Failed jobs > 100 | warning | Too many failed jobs |
| HighRateLimitWaits | Rate limit waits > 10/s for 10m | info | High Reddit API pressure |

**SLO Alerts** (`monitoring/prometheus/alerts/slo-alerts.yml`):

| Alert | Condition | Severity | Description |
|-------|-----------|----------|-------------|
| APIAvailabilityErrorBudgetFastBurn | Burn rate > 14.4x for 2m | critical | 5% monthly budget consumed in 1h |
| APIAvailabilityErrorBudgetSlowBurn | Burn rate > 6x for 15m | warning | 5% monthly budget consumed in 6h |
| APIAvailabilityErrorBudgetLow | Budget remaining < 10% | warning | Error budget running low |
| GraphLatencyErrorBudgetFastBurn | Burn rate > 14.4x for 2m | critical | Latency SLO at risk |
| GraphLatencyErrorBudgetSlowBurn | Burn rate > 6x for 15m | warning | Latency degrading |
| GraphLatencyErrorBudgetLow | Budget remaining < 10% | warning | Latency budget low |
| FrontendLoadTimeErrorBudgetFastBurn | Burn rate > 20x for 5m | warning | Frontend load time degrading |
| FrontendLoadTimeErrorBudgetSlowBurn | Burn rate > 10x for 30m | info | Frontend performance at risk |
| FrontendLoadTimeErrorBudgetLow | Budget remaining < 10% | info | Frontend budget low |

For details on SLO alerting strategy, see [docs/slos.md](slos.md).

### Viewing Alert Status

1. **In Prometheus**: http://localhost:9090/alerts
2. **In Grafana**: Add an "Alert list" panel to your dashboard

### Configuring Alert Notifications

To receive alert notifications:

1. Edit `monitoring/prometheus/prometheus.yml`
2. Configure alertmanager targets:
   ```yaml
   alerting:
     alertmanagers:
       - static_configs:
           - targets: ['alertmanager:9093']
   ```
3. Set up Alertmanager with notification channels (email, Slack, PagerDuty, etc.)

## PromQL Query Examples

### Crawl Performance
```promql
# Crawl throughput (jobs/sec)
rate(crawler_jobs_total[5m])

# Success rate percentage
100 * (
  rate(crawler_jobs_total{status="success"}[5m]) 
  / 
  rate(crawler_jobs_total[5m])
)

# Average job duration
rate(crawler_job_duration_seconds_sum[5m]) 
/ 
rate(crawler_job_duration_seconds_count[5m])
```

### API Performance
```promql
# Requests per second by endpoint
sum(rate(api_requests_total[5m])) by (endpoint)

# Error rate percentage
100 * (
  sum(rate(api_requests_total{status=~"5.."}[5m])) 
  / 
  sum(rate(api_requests_total[5m]))
)

# 99th percentile latency
histogram_quantile(0.99, 
  sum(rate(api_request_duration_seconds_bucket[5m])) by (le, endpoint)
)
```

### Graph Growth
```promql
# Node growth rate
deriv(graph_nodes_total[1h])

# Total content items
sum(graph_nodes_total{type=~"post|comment"})
```

## Troubleshooting

### Metrics Not Appearing

1. Check if API server is running: `curl http://localhost:8000/health`
2. Verify metrics endpoint: `curl http://localhost:8000/metrics`
3. Check Prometheus targets: http://localhost:9090/targets
4. Ensure services are on same network: `docker network inspect backend_web`

### High Memory Usage

Prometheus stores time-series data in memory. To reduce usage:

1. Adjust retention period in `prometheus.yml`:
   ```yaml
   global:
     retention: 15d  # Default: 15 days
   ```

2. Or via command line in docker-compose.yml:
   ```yaml
   command:
     - '--storage.tsdb.retention.time=7d'
   ```

### Dashboard Not Loading

1. Check Grafana logs: `docker compose logs grafana`
2. Verify datasource configuration: Grafana → Configuration → Data Sources
3. Test datasource connection in Grafana UI

### Alert Not Firing

1. Check alert rules syntax: http://localhost:9090/rules
2. Verify alert evaluation: http://localhost:9090/alerts
3. Check Prometheus logs: `docker compose logs prometheus`

## Performance Considerations

### Metric Collection Interval

The metrics collector runs every 30 seconds by default. To adjust:

```go
// In internal/server/server.go
metricsCollector := metrics.NewCollector(q, 60*time.Second) // 60 seconds
```

### Prometheus Scrape Interval

Configured in `prometheus.yml`:
```yaml
global:
  scrape_interval: 15s  # Adjust as needed
```

Lower intervals provide more granular data but increase storage and CPU usage.

### Query Optimization

For large datasets, use recording rules in Prometheus to pre-calculate expensive queries:

```yaml
groups:
  - name: reddit_recording_rules
    interval: 30s
    rules:
      - record: job:crawler_success_rate:rate5m
        expr: |
          rate(crawler_jobs_total{status="success"}[5m]) 
          / 
          rate(crawler_jobs_total[5m])
```

**SLO Recording Rules**: The application includes pre-configured recording rules for Service Level Indicators:
- Located in `monitoring/prometheus/recording-rules/slo-recording-rules.yml`
- 24 rules calculating SLI metrics at multiple time windows (5m, 1h, 6h, 1d, 30d)
- Error budget remaining and burn rate calculations
- See [docs/slos.md](slos.md) for details

## Exporting Data

### Prometheus Data Export

Export metrics for offline analysis:

```bash
# Query API
curl 'http://localhost:9090/api/v1/query?query=crawler_jobs_total'

# Export time series
curl 'http://localhost:9090/api/v1/query_range?query=crawler_jobs_total&start=..&end=..&step=15s'
```

### Grafana Export

1. Dashboard JSON: Dashboard → Settings → JSON Model
2. CSV Export: Panel → Inspect → Data → Download CSV

### BigQuery/Parquet Export (Optional)

For data warehouse integration, consider:

1. Prometheus remote write to BigQuery
2. Scheduled export jobs using prometheus-to-bigquery tools
3. Parquet export via Prometheus snapshot API

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Best Practices](https://grafana.com/docs/grafana/latest/best-practices/)
