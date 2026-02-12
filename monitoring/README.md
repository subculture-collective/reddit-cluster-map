# Monitoring Configuration

This directory contains the monitoring configuration for the Reddit Cluster Map project, including Prometheus metrics collection, Grafana dashboards, alerting rules, and Service Level Objective (SLO) tracking.

## Structure

```
monitoring/
├── slos.yaml                    # SLO definitions and targets
├── SLO-QUICKREF.md             # Quick reference for SLO/SLI
├── prometheus/
│   ├── prometheus.yml          # Main Prometheus configuration
│   ├── alerts/
│   │   ├── reddit-cluster-map.yml  # System alert rules
│   │   └── slo-alerts.yml          # SLO error budget alerts
│   └── recording-rules/
│       └── slo-recording-rules.yml # SLI pre-calculation rules
└── grafana/
    └── provisioning/
        ├── datasources/
        │   └── prometheus.yml      # Prometheus datasource config
        └── dashboards/
            ├── default.yml         # Dashboard provider config
            ├── reddit-cluster-map-overview.json  # Main system dashboard
            └── reddit-cluster-map-slo.json       # SLO dashboard
```

## Quick Start

The monitoring stack is integrated into the main docker-compose setup:

```bash
cd backend
docker compose up -d
```

Access the services:
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)
- **API Metrics**: http://localhost:8000/metrics
- **SLO Dashboard**: http://localhost:3000/d/reddit-cluster-map-slo

## Service Level Objectives (SLOs)

The application monitors three key SLOs:

| SLO | Target | What It Measures |
|-----|--------|------------------|
| API Availability | 99.5% | Non-5xx responses over 30 days |
| Graph Latency | 99% < 500ms | Graph endpoint response time |
| Frontend Load | 95% < 3s | Initial page load time |

### SLO Files

- **slos.yaml**: Formal SLO definitions, targets, and error budget policies
- **recording-rules/slo-recording-rules.yml**: 24 Prometheus recording rules for SLI calculation
- **alerts/slo-alerts.yml**: 9 error budget burn rate alerts
- **dashboards/reddit-cluster-map-slo.json**: SLO dashboard with gauges, trends, and burn rates
- **SLO-QUICKREF.md**: Quick reference for daily SLO monitoring

### Documentation

- **Full SLO Guide**: [docs/slos.md](../docs/slos.md)
- **Quick Reference**: [SLO-QUICKREF.md](SLO-QUICKREF.md)
- **Monitoring Guide**: [docs/monitoring.md](../docs/monitoring.md)

## Configuration Files

### Prometheus

- **prometheus.yml**: Scrape configuration for API server metrics and rule file loading
- **alerts/reddit-cluster-map.yml**: System alert rules for:
  - High error rates (API and crawler)
  - Slow queries
  - Database errors
  - Circuit breaker trips
  - Crawl job issues
- **alerts/slo-alerts.yml**: SLO-specific alerts for:
  - Fast burn (5% monthly budget in 1h - critical)
  - Slow burn (5% monthly budget in 6h - warning)
  - Budget low (< 10% remaining - warning)
- **recording-rules/slo-recording-rules.yml**: Pre-calculated SLI metrics at 5m, 1h, 6h, 1d, 30d windows

### Grafana

- **datasources/prometheus.yml**: Auto-configures Prometheus as datasource
- **dashboards/default.yml**: Dashboard provider configuration
- **dashboards/reddit-cluster-map-overview.json**: Main system dashboard with:
  - KPI metrics (nodes, links, communities, jobs)
  - Graph growth charts
  - Crawl job status and throughput
  - API performance and error rates
  - Database operation metrics
- **dashboards/reddit-cluster-map-slo.json**: SLO tracking dashboard with:
  - SLO compliance gauges (99.5%, 99%, 95% targets)
  - Error budget remaining indicators
  - SLI trend charts across multiple time windows
  - Error budget burn rate visualizations
  - P95 latency tracking
  - Active SLO alerts panel

## Customization

### Adding New Metrics

1. Define metrics in `backend/internal/metrics/metrics.go`
2. Instrument code to record metrics
3. Metrics automatically appear at `/metrics` endpoint

### Adding New Alerts

Edit `prometheus/alerts/reddit-cluster-map.yml`:

```yaml
- alert: MyNewAlert
  expr: my_metric > threshold
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Alert description"
    description: "Detailed description with {{ $value }}"
```

### Adding Recording Rules

Edit `prometheus/recording-rules/` files:

```yaml
- record: job:my_metric:rate5m
  expr: rate(my_metric[5m])
```

### Creating New Dashboards

1. Create/export dashboard in Grafana UI
2. Save JSON to `grafana/provisioning/dashboards/`
3. Restart Grafana or wait for auto-reload

### Defining New SLOs

1. Add SLO to `slos.yaml`
2. Create recording rules for SLI calculation
3. Add error budget burn rate alerts
4. Update SLO dashboard with new panels
5. Document in `docs/slos.md`

## Validation

Validate configurations before deploying:

```bash
# Check Prometheus config
docker run --rm -v "$(pwd)/prometheus:/prometheus" \
  --entrypoint promtool prom/prometheus:latest \
  check config /prometheus/prometheus.yml

# Check recording rules
docker run --rm -v "$(pwd)/prometheus:/prometheus" \
  --entrypoint promtool prom/prometheus:latest \
  check rules /prometheus/recording-rules/slo-recording-rules.yml

# Check alert rules
docker run --rm -v "$(pwd)/prometheus:/prometheus" \
  --entrypoint promtool prom/prometheus:latest \
  check rules /prometheus/alerts/slo-alerts.yml
```

## Documentation

- **[docs/monitoring.md](../docs/monitoring.md)**: Complete monitoring guide
  - Full metrics reference
  - PromQL query examples
  - Alert configuration
  - Troubleshooting
  - Performance tuning
  - Data export options

- **[docs/slos.md](../docs/slos.md)**: Comprehensive SLO guide
  - SLO definitions and rationale
  - SLI metrics reference
  - Error budget management
  - Alerting strategy
  - Dashboard usage
  - Monthly/quarterly/annual review process
  - Incident response runbook

- **[SLO-QUICKREF.md](SLO-QUICKREF.md)**: Quick SLO reference
  - Current SLO targets
  - Common PromQL queries
  - Alert response procedures
  - Troubleshooting tips

## Key Concepts

### Error Budget

The error budget is the maximum amount of unreliability allowed while still meeting the SLO:

```
Error Budget = (1 - SLO Target) × Total Requests
```

Example: 99.5% availability SLO = 0.5% error budget = ~3.6 hours downtime per month

### Burn Rate

Burn rate indicates how fast the error budget is being consumed relative to the target:

- **Burn Rate = 1.0**: Consuming at target rate (healthy)
- **Burn Rate > 1.0**: Consuming faster than target (alert condition)
- **Burn Rate < 1.0**: Performing better than SLO

Example: 14.4x burn rate means exhausting monthly budget in ~2 hours

### Multi-Window Alerting

Uses multiple time windows to balance sensitivity and precision:

- **Fast burn (1h window)**: Detects severe degradation quickly (critical alerts)
- **Slow burn (6h window)**: Detects gradual degradation (warning alerts)
- Combines with short-term checks to reduce false positives

## Monitoring Best Practices

✅ **DO**:
- Check SLO dashboard daily
- Investigate all burn rate alerts
- Review error budget weekly
- Document incidents and learnings
- Use error budgets to prioritize work
- Adjust SLOs based on business needs

❌ **DON'T**:
- Ignore slow burn alerts
- Deploy when error budget is low
- Silence alerts without fixing root cause
- Set unrealistic SLO targets
- Change SLOs without stakeholder approval
