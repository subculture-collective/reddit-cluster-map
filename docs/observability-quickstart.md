# Observability Quick Start

This guide gets you up and running with logging, tracing, and error reporting in 5 minutes.

## Quick Setup

### 1. Structured Logging (Built-in, Always On)

Logging is enabled by default. Just configure the level:

```bash
# In your .env file
LOG_LEVEL=info  # Options: debug, info, warn, error
```

That's it! Your logs now include:
- Request IDs for tracking
- Structured fields for searching
- JSON format in production

### 2. Distributed Tracing (Optional)

**Step 1:** Start Jaeger:
```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

**Step 2:** Enable tracing in `.env`:
```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4318
```

**Step 3:** View traces at http://localhost:16686

### 3. Error Reporting (Optional)

**Step 1:** Create a free [Sentry account](https://sentry.io)

**Step 2:** Add your DSN to `.env`:
```bash
SENTRY_DSN=https://your-key@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=development
```

Done! Errors are now reported automatically.

## What You Get

### Structured Logging
```
time=2024-10-26T12:34:56Z level=INFO msg="Crawling subreddit" subreddit=AskReddit request_id=a1b2c3d4
```

### Request Tracking
Every API request gets a unique ID:
```bash
curl -H "X-Request-ID: my-test-123" http://localhost:8000/api/graph
```

All logs for that request will include `request_id=my-test-123`.

### Distributed Tracing
See the complete flow of a request:
1. API receives request
2. Database query executes
3. Graph is computed
4. Response is cached

With timing for each step!

### Error Reporting
Production errors automatically captured with:
- Stack traces
- Request context
- PII automatically scrubbed
- User information (if authenticated)

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level: debug, info, warn, error |
| `OTEL_ENABLED` | `false` | Enable distributed tracing |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `localhost:4318` | OTLP collector endpoint |
| `OTEL_TRACE_SAMPLE_RATE` | `0.1` | Trace sampling rate (0.0-1.0) |
| `SENTRY_DSN` | _(empty)_ | Sentry DSN for error reporting |
| `SENTRY_ENVIRONMENT` | `development` | Environment: development, staging, production |
| `SENTRY_SAMPLE_RATE` | `1.0` | Error sampling rate (0.0-1.0) |

## Production Setup

For production, use lower sampling rates to reduce costs:

```bash
LOG_LEVEL=info
OTEL_ENABLED=true
OTEL_TRACE_SAMPLE_RATE=0.01  # 1% sampling
SENTRY_DSN=https://your-key@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=production
SENTRY_SAMPLE_RATE=0.1  # 10% sampling
```

## Troubleshooting

**Logs not showing?**
- Check `LOG_LEVEL` is not set too high
- Verify stderr/stdout is being captured

**Traces not appearing?**
- Verify Jaeger is running: `curl http://localhost:16686`
- Check `OTEL_ENABLED=true` is set
- Increase sampling: `OTEL_TRACE_SAMPLE_RATE=1.0`

**Errors not in Sentry?**
- Verify DSN is correct
- Check network connectivity to sentry.io
- Trigger a test error

## Next Steps

- Read the [full observability guide](./observability.md) for advanced features
- Check [monitoring.md](./monitoring.md) for Prometheus metrics
- Set up [alerting](./monitoring.md#alerts) for production

## Examples

### Development (Local)
```bash
# .env
LOG_LEVEL=debug
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4318
# SENTRY_DSN left empty
```

### Staging
```bash
# .env
LOG_LEVEL=info
ENV=production
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=collector:4318
OTEL_TRACE_SAMPLE_RATE=0.1
SENTRY_DSN=https://your-key@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=staging
```

### Production
```bash
# .env
LOG_LEVEL=warn
ENV=production
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=collector:4318
OTEL_TRACE_SAMPLE_RATE=0.01
SENTRY_DSN=https://your-key@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=production
SENTRY_SAMPLE_RATE=0.1
```
