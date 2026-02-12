# Service Level Objectives (SLOs) and SLIs

This document defines the Service Level Objectives (SLOs) and Service Level Indicators (SLIs) for the Reddit Cluster Map application, along with the error budget tracking and review process.

## Table of Contents

1. [Overview](#overview)
2. [SLO Definitions](#slo-definitions)
3. [SLI Metrics](#sli-metrics)
4. [Error Budget Management](#error-budget-management)
5. [Alerting](#alerting)
6. [Dashboard](#dashboard)
7. [Review Process](#review-process)
8. [Runbook](#runbook)

## Overview

Service Level Objectives (SLOs) are reliability targets that define the expected performance and availability of the application. They are measured using Service Level Indicators (SLIs) - quantitative metrics that track actual performance.

### Why SLOs Matter

- **Balance reliability vs. features**: SLOs help teams make informed decisions about when to prioritize reliability work
- **Error budgets**: Allow controlled risk-taking while maintaining reliability
- **Objective incident response**: Clear thresholds for when to escalate issues
- **Data-driven capacity planning**: Historical SLI data informs infrastructure decisions

## SLO Definitions

The Reddit Cluster Map application maintains three key SLOs:

### 1. API Availability SLO

**Target**: 99.5% availability over a 30-day rolling window

**Description**: The API should successfully respond to requests without server errors.

**Success criteria**: HTTP status codes 2xx, 3xx, 4xx (client errors don't count against availability)
**Failure criteria**: HTTP status codes 5xx, network errors, timeouts

**Rationale**: 
- 99.5% allows for approximately 3.6 hours of downtime per month
- Balances reliability needs with development velocity
- Industry-standard for non-critical web services

**Error budget**: 0.5% of total requests (approximately 216 minutes/month)

### 2. Graph Endpoint Latency SLO

**Target**: 99% of requests complete within 500ms over a 30-day rolling window

**Description**: The `/api/graph` endpoint should respond quickly to provide a smooth user experience.

**Success criteria**: Response time ≤ 500ms
**Failure criteria**: Response time > 500ms

**Rationale**:
- 500ms is perceived as nearly instantaneous for graph loading
- 99% target allows for occasional complex queries without failing SLO
- Graph endpoint is the most performance-critical API

**Error budget**: 1% of requests can exceed 500ms latency

### 3. Frontend Load Time SLO

**Target**: 95% of page loads complete within 3 seconds over a 30-day rolling window

**Description**: Initial page load should be fast enough for a good user experience.

**Success criteria**: Total load time ≤ 3 seconds
**Failure criteria**: Total load time > 3 seconds

**Rationale**:
- 3 seconds is a common threshold for web performance
- 95% target accounts for network variability and cold starts
- More lenient than API SLOs since frontend includes external dependencies

**Current limitation**: This metric currently uses API latency as a proxy. Real User Monitoring (RUM) should be implemented for accurate frontend performance tracking.

**Error budget**: 5% of page loads can exceed 3 seconds

## SLI Metrics

SLIs are implemented using Prometheus recording rules that pre-calculate metrics at multiple time windows:

### API Availability SLI

```promql
# 5-minute window (real-time monitoring)
slo:api_availability:ratio_rate5m

# 1-hour window (fast burn detection)
slo:api_availability:ratio_rate1h

# 6-hour window (slow burn detection)
slo:api_availability:ratio_rate6h

# 1-day window (daily trend)
slo:api_availability:ratio_rate1d

# 30-day window (SLO compliance)
slo:api_availability:ratio_rate30d
```

### Graph Latency SLI

```promql
# Multiple time windows
slo:graph_latency:ratio_rate5m
slo:graph_latency:ratio_rate1h
slo:graph_latency:ratio_rate6h
slo:graph_latency:ratio_rate1d
slo:graph_latency:ratio_rate30d

# P95 latency (current performance)
slo:graph_latency:p95_5m
```

### Frontend Load Time SLI

```promql
# Multiple time windows
slo:frontend_load:ratio_rate5m
slo:frontend_load:ratio_rate1h
slo:frontend_load:ratio_rate6h
slo:frontend_load:ratio_rate30d
```

## Error Budget Management

### What is an Error Budget?

An error budget is the maximum amount of unreliability allowed while still meeting the SLO. It's calculated as:

```
Error Budget = (1 - SLO Target) × Total Requests
```

For example, with a 99.5% availability SLO:
- Error budget = 0.5% of requests
- Over 30 days with 1M requests = 5,000 failed requests allowed

### Error Budget Remaining

The current error budget remaining is tracked using:

```promql
# API Availability
slo:api_availability:error_budget_remaining

# Graph Latency
slo:graph_latency:error_budget_remaining

# Frontend Load Time
slo:frontend_load:error_budget_remaining
```

Values range from 0.0 (exhausted) to 1.0 (full budget).

### Burn Rate

Burn rate indicates how quickly the error budget is being consumed relative to the target rate:

- **Burn rate = 1.0**: Consuming budget at exactly the target rate (healthy)
- **Burn rate > 1.0**: Consuming budget faster than target (unhealthy)
- **Burn rate < 1.0**: Consuming budget slower than target (performing better than SLO)

**Example**: A burn rate of 14.4 means the error budget is being consumed 14.4 times faster than the target rate. At this rate, the monthly error budget would be exhausted in ~2 hours.

### Error Budget Policy

When error budget is exhausted or at risk:

1. **Freeze feature releases**: Prioritize reliability improvements over new features
2. **Conduct incident review**: Identify root causes of budget consumption
3. **Implement corrective actions**: Address systemic reliability issues
4. **Consider relaxing SLO**: If target is consistently missed, it may be too strict

## Alerting

Error budget alerts follow the multi-window, multi-burn-rate approach from Google SRE practices:

### Alert Severity Levels

| Severity | Response Time | Action |
|----------|--------------|--------|
| **Critical** | Immediate | Page on-call engineer, immediate investigation required |
| **Warning** | Business hours | Investigate within the next business day |
| **Info** | Best effort | Log for trend analysis, no immediate action |

### API Availability Alerts

#### Fast Burn (Critical)

```yaml
Alert: APIAvailabilityErrorBudgetFastBurn
Condition: burn_rate_1h > 14.4 AND ratio_rate5m < 0.995
Duration: 2 minutes
Severity: Critical
```

**Meaning**: Consuming 5% of monthly error budget in 1 hour. At this rate, budget exhausted in ~20 hours.

**Action**: Immediate investigation and mitigation required.

#### Slow Burn (Warning)

```yaml
Alert: APIAvailabilityErrorBudgetSlowBurn
Condition: burn_rate_6h > 6 AND ratio_rate1h < 0.995
Duration: 15 minutes
Severity: Warning
```

**Meaning**: Consuming 5% of monthly error budget in 6 hours. At this rate, budget exhausted in ~5 days.

**Action**: Investigate during business hours.

#### Budget Low (Warning)

```yaml
Alert: APIAvailabilityErrorBudgetLow
Condition: error_budget_remaining < 0.1
Duration: 5 minutes
Severity: Warning
```

**Meaning**: Less than 10% of monthly error budget remains.

**Action**: Consider freezing feature releases and prioritizing reliability work.

### Graph Latency Alerts

Similar multi-burn-rate alerts exist for the graph endpoint latency SLO:

- **GraphLatencyErrorBudgetFastBurn** (Critical, burn_rate_1h > 14.4)
- **GraphLatencyErrorBudgetSlowBurn** (Warning, burn_rate_6h > 6)
- **GraphLatencyErrorBudgetLow** (Warning, remaining < 10%)

### Frontend Load Time Alerts

More lenient thresholds due to external dependencies:

- **FrontendLoadTimeErrorBudgetFastBurn** (Warning, burn_rate_1h > 20)
- **FrontendLoadTimeErrorBudgetSlowBurn** (Info, burn_rate_6h > 10)
- **FrontendLoadTimeErrorBudgetLow** (Info, remaining < 10%)

## Dashboard

The SLO Dashboard (`Reddit Cluster Map - SLO Dashboard`) is available in Grafana at:

**URL**: http://localhost:3000/d/reddit-cluster-map-slo

### Dashboard Sections

1. **SLO Compliance Gauges**
   - Current 30-day SLI values for each SLO
   - Color-coded: Green (meeting SLO), Yellow (at risk), Red (violating SLO)

2. **Error Budget Remaining**
   - Visual representation of remaining error budget
   - Separate gauges for each SLO

3. **SLI Trend Charts**
   - Historical SLI performance across multiple time windows (5m, 1h, 1d, 30d)
   - Allows spotting trends and patterns

4. **Error Budget Burn Rate**
   - Real-time burn rate for 1-hour and 6-hour windows
   - Threshold lines show alert trigger points

5. **Performance Metrics**
   - P95 latency for graph endpoint
   - Helps correlate latency spikes with SLI degradation

6. **Active Alerts**
   - List of currently firing SLO-related alerts
   - Quick visibility into ongoing issues

### Using the Dashboard

**Daily monitoring**:
- Check SLO compliance gauges - all should be green
- Review error budget remaining - should have comfortable margin
- Scan for any active alerts

**During incidents**:
- Monitor burn rate charts to assess severity
- Track real-time SLI (5m window) to validate mitigation effectiveness
- Estimate time to budget exhaustion

**For capacity planning**:
- Review 30-day trends to identify gradual degradation
- Analyze correlation between traffic patterns and SLI performance

## Review Process

### Monthly SLO Review

**When**: First week of each month
**Participants**: Engineering team, SRE, Product Management
**Duration**: 30-60 minutes

**Agenda**:

1. **Review SLO Compliance** (10 min)
   - Did we meet all SLOs last month?
   - Which SLOs came closest to violation?
   - Any patterns or trends?

2. **Error Budget Analysis** (15 min)
   - How much error budget was consumed?
   - What were the primary causes of budget consumption?
   - Did we exhaust any budgets? If so, why?

3. **Incident Review** (15 min)
   - Significant incidents affecting SLOs
   - Root causes and corrective actions
   - Were alerts effective in detecting issues?

4. **SLO Effectiveness** (10 min)
   - Are current SLOs too strict or too lenient?
   - Do SLOs align with user expectations?
   - Should we add or remove SLOs?

5. **Action Items** (10 min)
   - Reliability improvements needed
   - Process changes
   - SLO adjustments (if any)

### Quarterly Assessment

**When**: End of each quarter
**Focus**: Strategic evaluation of SLO program

**Questions to answer**:

- Are we measuring the right things?
- Do our SLOs reflect actual user impact?
- Should we adjust targets based on business needs?
- Are error budgets being used effectively to balance reliability and velocity?
- Do we need additional instrumentation or SLOs?

### Annual Review

**When**: End of year
**Focus**: Comprehensive program evaluation

**Deliverables**:

- Annual SLO report (compliance trends, budget utilization)
- Updated SLO strategy for next year
- Recommendations for SLO improvements
- Cost/benefit analysis of reliability investments

## Runbook

### Responding to SLO Alerts

#### 1. Fast Burn Alert (Critical)

**Immediate actions**:

1. Acknowledge alert in monitoring system
2. Check dashboard for current SLI and burn rate
3. Identify root cause:
   - Recent deployments? → Consider rollback
   - Traffic spike? → Check capacity
   - External dependency failure? → Enable circuit breakers
   - Database issues? → Check DB metrics

4. Mitigate based on root cause
5. Monitor burn rate - should decrease after mitigation
6. Document incident in incident log

**If unable to mitigate within 1 hour**:
- Escalate to senior engineer
- Consider emergency rollback or traffic reduction
- Post incident report required

#### 2. Slow Burn Alert (Warning)

**Actions within business hours**:

1. Review error budget remaining and burn rate
2. Check for patterns - is this consistent or intermittent?
3. Identify contributing factors using tracing and logs
4. Create issue to track investigation
5. Implement fix in next sprint if needed

**No immediate action required**, but should not be ignored.

#### 3. Error Budget Low Alert (Warning)

**Actions**:

1. Calculate remaining error budget in absolute terms
2. Estimate time until budget exhaustion at current burn rate
3. Review incident history for the period
4. Determine if low budget is due to:
   - Multiple incidents (normal) → Continue monitoring
   - Chronic degradation (problem) → Prioritize reliability work

**If budget < 5% remaining**:
- Freeze non-critical feature releases
- Focus next sprint on reliability improvements
- Schedule emergency SLO review meeting

### Investigating SLO Violations

#### Step 1: Gather Context

```bash
# Check current SLI values
curl 'http://localhost:9090/api/v1/query?query=slo:api_availability:ratio_rate30d'

# Check error budget remaining
curl 'http://localhost:9090/api/v1/query?query=slo:api_availability:error_budget_remaining'

# View recent alerts
curl 'http://localhost:9090/api/v1/alerts'
```

#### Step 2: Identify Time Range

- When did SLI start degrading?
- Was there a sharp drop or gradual decline?
- Check SLI trend charts in Grafana

#### Step 3: Correlate with Events

- Recent deployments (check CI/CD logs)
- Traffic changes (check request rate metrics)
- Infrastructure changes (check cloud provider console)
- External dependencies (check third-party status pages)

#### Step 4: Analyze Failure Mode

For availability issues:
```promql
# Error rate by endpoint
sum(rate(api_requests_total{status=~"5.."}[5m])) by (endpoint)

# Common error types
sum(rate(api_requests_total{status=~"5.."}[5m])) by (status)
```

For latency issues:
```promql
# Slowest endpoints
topk(5, histogram_quantile(0.95, 
  sum(rate(api_request_duration_seconds_bucket[5m])) by (le, endpoint)
))

# Database query latency
histogram_quantile(0.95,
  sum(rate(db_operation_duration_seconds_bucket[5m])) by (le, operation)
)
```

#### Step 5: Root Cause Analysis

- Review application logs for the time period
- Check database slow query logs
- Analyze distributed traces (if available)
- Review infrastructure metrics (CPU, memory, disk I/O)

#### Step 6: Document and Share

- Create incident report
- Update runbook with lessons learned
- Share findings in monthly SLO review

### Adjusting SLOs

SLO targets should be adjusted if:

1. **Consistently exceeding target**: SLO too lenient, tighten target
2. **Consistently missing target**: SLO too strict, relax target
3. **Business requirements change**: Update to reflect new priorities
4. **User feedback indicates mismatch**: Align with actual user expectations

**Process for changing SLOs**:

1. Propose change in quarterly assessment
2. Analyze impact on error budget
3. Get stakeholder approval (engineering + product)
4. Update `monitoring/slos.yaml`
5. Update recording rules and alerts
6. Update documentation
7. Announce change to team
8. Monitor for 1 month to validate new target

### Common Troubleshooting

**SLI metrics not appearing in Grafana**:
- Check Prometheus targets: http://localhost:9090/targets
- Verify recording rules loaded: http://localhost:9090/rules
- Check for syntax errors in recording rules
- Ensure recording rules volume mounted in docker-compose.yml

**Alerts not firing when expected**:
- Verify alert rules in Prometheus UI
- Check alert evaluation frequency (should be 30s)
- Ensure Alertmanager configured (if using notifications)
- Review alert for clauses - may need multiple conditions met

**Error budget showing > 100%**:
- This means performing better than SLO (good!)
- Recording rule may have calculation error - verify formula
- Check if SLI is consistently 1.0 (100%) - may indicate no traffic

**Burn rate seems incorrect**:
- Verify time windows in recording rules match alert definitions
- Check that base metrics (api_requests_total) are being collected
- Ensure Prometheus retention period covers full 30-day window

## References

- [Google SRE Book - Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [Google SRE Workbook - Implementing SLOs](https://sre.google/workbook/implementing-slos/)
- [Prometheus Recording Rules](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)

## Appendix: SLO Calculation Examples

### Example 1: API Availability

**Given**:
- 30-day period
- 1,000,000 total API requests
- 995,500 successful requests (status != 5xx)
- 4,500 failed requests (status = 5xx)

**SLI Calculation**:
```
SLI = successful_requests / total_requests
SLI = 995,500 / 1,000,000
SLI = 0.9955 = 99.55%
```

**SLO Compliance**:
```
Target = 99.5%
Actual = 99.55%
Result: Meeting SLO ✓
```

**Error Budget**:
```
Budget = (1 - 0.995) × 1,000,000 = 5,000 failed requests allowed
Consumed = 4,500 failed requests
Remaining = 5,000 - 4,500 = 500 requests
Remaining % = (500 / 5,000) × 100 = 10%
```

### Example 2: Graph Latency

**Given**:
- 30-day period
- 500,000 requests to /api/graph
- 497,000 requests completed in ≤ 500ms
- 3,000 requests took > 500ms

**SLI Calculation**:
```
SLI = fast_requests / total_requests
SLI = 497,000 / 500,000
SLI = 0.994 = 99.4%
```

**SLO Compliance**:
```
Target = 99%
Actual = 99.4%
Result: Meeting SLO ✓
```

**Error Budget**:
```
Budget = (1 - 0.99) × 500,000 = 5,000 slow requests allowed
Consumed = 3,000 slow requests
Remaining = 5,000 - 3,000 = 2,000 requests
Remaining % = (2,000 / 5,000) × 100 = 40%
```

### Example 3: Fast Burn Rate

**Given**:
- API availability SLO: 99.5%
- 1-hour window: 10,000 requests
- 9,800 successful (98% success rate)

**Burn Rate Calculation**:
```
Actual error rate (1h) = 1 - 0.98 = 0.02 = 2%
Target error rate = 1 - 0.995 = 0.005 = 0.5%
Burn rate = actual_error_rate / target_error_rate
Burn rate = 0.02 / 0.005 = 4
```

**Interpretation**:
- Consuming error budget 4x faster than target
- Below fast burn threshold (14.4x), so no critical alert
- But higher than normal - investigate if sustained

**Budget Exhaustion Time**:
```
At 4x burn rate, 30-day budget consumed in: 30 / 4 = 7.5 days
```

---

**Document Version**: 1.0
**Last Updated**: 2026-02-12
**Next Review**: 2026-03-12
