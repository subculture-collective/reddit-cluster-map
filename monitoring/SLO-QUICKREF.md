# SLO Quick Reference Guide

Quick reference for monitoring and responding to Service Level Objectives.

## Quick Links

- **SLO Dashboard**: http://localhost:3000/d/reddit-cluster-map-slo
- **Prometheus Rules**: http://localhost:9090/rules
- **Prometheus Alerts**: http://localhost:9090/alerts
- **Full Documentation**: [docs/slos.md](../docs/slos.md)

## Current SLOs

| SLO | Target | Window | What It Measures |
|-----|--------|--------|------------------|
| **API Availability** | 99.5% | 30 days | Successful API responses (non-5xx) |
| **Graph Latency** | 99% < 500ms | 30 days | Graph endpoint response time |
| **Frontend Load** | 95% < 3s | 30 days | Initial page load time (proxy) |

## SLI Metrics (PromQL)

```promql
# Current SLO compliance (30-day)
slo:api_availability:ratio_rate30d
slo:graph_latency:ratio_rate30d
slo:frontend_load:ratio_rate30d

# Error budget remaining (0.0-1.0)
slo:api_availability:error_budget_remaining
slo:graph_latency:error_budget_remaining
slo:frontend_load:error_budget_remaining

# Burn rate (>1 = burning too fast)
slo:api_availability:burn_rate_1h
slo:api_availability:burn_rate_6h
```

## Alert Response

### Critical: Fast Burn Alert

**Alert**: `APIAvailabilityErrorBudgetFastBurn` or `GraphLatencyErrorBudgetFastBurn`

**Action**: Immediate investigation required

1. Check dashboard for current SLI and burn rate
2. Identify root cause (recent deploy, traffic spike, dependency failure)
3. Mitigate immediately (rollback, scale, circuit breakers)
4. Monitor burn rate - should decrease after mitigation
5. Document incident

**Time to budget exhaustion**: ~20 hours at 14.4x burn rate

### Warning: Slow Burn Alert

**Alert**: `APIAvailabilityErrorBudgetSlowBurn` or `GraphLatencyErrorBudgetSlowBurn`

**Action**: Investigate within business hours

1. Review error budget and burn rate trends
2. Check for patterns in logs and traces
3. Create issue to track investigation
4. Implement fix in next sprint if needed

**Time to budget exhaustion**: ~5 days at 6x burn rate

### Warning: Budget Low Alert

**Alert**: `APIAvailabilityErrorBudgetLow` or similar

**Action**: Consider feature freeze

1. Calculate remaining error budget in absolute terms
2. Review incident history for the period
3. If budget < 5%, freeze non-critical releases
4. Schedule SLO review meeting

## Common PromQL Queries

### Check Current SLO Status

```promql
# Are we meeting our SLOs?
slo:api_availability:ratio_rate30d > 0.995  # Should be true
slo:graph_latency:ratio_rate30d > 0.99       # Should be true
slo:frontend_load:ratio_rate30d > 0.95       # Should be true
```

### Error Budget Remaining

```promql
# How much budget do we have left?
slo:api_availability:error_budget_remaining * 100  # Percentage
```

### Time to Budget Exhaustion

```promql
# At current burn rate, when will budget run out?
30 / slo:api_availability:burn_rate_1h  # Days remaining at 1h rate
```

### Historical Compliance

```promql
# SLO compliance over last 7 days
avg_over_time(slo:api_availability:ratio_rate30d[7d])
```

## Dashboard Panels

### Gauges (Top Row)

- **Green**: Meeting SLO target
- **Yellow**: At risk (close to target)
- **Red**: Violating SLO

### Trend Charts

- **5m window**: Real-time performance
- **1h window**: Recent trend
- **1d window**: Daily pattern
- **30d window**: SLO compliance

### Burn Rate Charts

- **Above threshold line**: Alert condition
- **Below threshold**: Healthy consumption

## Monthly Review Checklist

- [ ] Review SLO compliance for each objective
- [ ] Analyze error budget consumption
- [ ] Review significant incidents
- [ ] Assess alert effectiveness
- [ ] Decide if SLO targets need adjustment
- [ ] Document action items

## Troubleshooting

### SLI shows NaN or empty

- **Cause**: No traffic or missing base metrics
- **Fix**: Verify `api_requests_total` is being collected

### Alert not firing when expected

- **Cause**: Alert `for` clause not satisfied
- **Fix**: Check Prometheus alerts page for pending/inactive status

### Error budget > 100%

- **Cause**: Performing better than SLO (good!)
- **Action**: Consider tightening SLO target if consistently over-achieving

### Dashboard shows "No Data"

- **Cause**: Prometheus not scraping or recording rules not loaded
- **Fix**: Check http://localhost:9090/targets and http://localhost:9090/rules

## File Locations

- **SLO Definitions**: `monitoring/slos.yaml`
- **Recording Rules**: `monitoring/prometheus/recording-rules/slo-recording-rules.yml`
- **Alert Rules**: `monitoring/prometheus/alerts/slo-alerts.yml`
- **Dashboard**: `monitoring/grafana/provisioning/dashboards/reddit-cluster-map-slo.json`
- **Documentation**: `docs/slos.md`

## Example Scenarios

### Scenario 1: Deployment Causes Spike in Errors

1. Alert fires: `APIAvailabilityErrorBudgetFastBurn`
2. Check dashboard: SLI dropped to 98%, burn rate 14.4x
3. Check recent events: Deployment 10 minutes ago
4. Action: Rollback deployment
5. Result: SLI recovers to 99.8%, burn rate returns to normal
6. Post-incident: Review what caused the errors

### Scenario 2: Gradual Performance Degradation

1. Alert fires: `GraphLatencyErrorBudgetSlowBurn`
2. Check dashboard: P95 latency increased from 300ms to 600ms
3. Check trends: Gradual increase over past 2 days
4. Investigation: Database query becoming slower as data grows
5. Action: Add database index, optimize query
6. Result: Latency returns to 400ms, SLI improves

### Scenario 3: Error Budget Depleted

1. Alert: `APIAvailabilityErrorBudgetLow` - only 5% remaining
2. Review shows multiple incidents consumed budget
3. Decision: Freeze feature releases for 1 week
4. Focus: Fix underlying reliability issues
5. Result: Budget recovers, resume feature work

## Best Practices

✅ **DO**:
- Monitor SLO dashboard daily
- Investigate slow burn alerts promptly
- Document incidents and learnings
- Adjust SLOs based on business needs
- Use error budgets to balance reliability and velocity

❌ **DON'T**:
- Ignore slow burn alerts
- Deploy features when budget is low
- Adjust SLOs without stakeholder approval
- Silence alerts without addressing root cause
- Set SLOs too strict or too lenient

## Quick Commands

```bash
# Start monitoring stack
cd backend && docker compose up -d

# View Prometheus logs
docker compose logs prometheus -f

# Check Prometheus config
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Check recording rules
docker compose exec prometheus promtool check rules /etc/prometheus/recording-rules/slo-recording-rules.yml

# Query SLI from command line
curl -s 'http://localhost:9090/api/v1/query?query=slo:api_availability:ratio_rate30d' | jq
```

---

**Last Updated**: 2026-02-12
**Version**: 1.0
