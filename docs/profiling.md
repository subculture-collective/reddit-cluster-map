# Performance Profiling Guide

This guide covers performance profiling and optimization techniques for the Reddit Cluster Map application.

## Table of Contents

- [Overview](#overview)
- [Profiling Setup](#profiling-setup)
- [Runtime Profiling (pprof)](#runtime-profiling-pprof)
- [Benchmark Tests](#benchmark-tests)
- [Database Query Profiling](#database-query-profiling)
- [Analysis and Optimization](#analysis-and-optimization)
- [Common Performance Issues](#common-performance-issues)
- [Best Practices](#best-practices)

## Overview

The application provides multiple profiling capabilities:

1. **Runtime profiling** via Go's `pprof` package for CPU, memory, and goroutine analysis
2. **Benchmark tests** for critical code paths
3. **Database query benchmarking** for SQL performance
4. **Prometheus metrics** for production monitoring

## Profiling Setup

### Enable Profiling Endpoints

Profiling endpoints are **disabled by default** for security. To enable:

```bash
# In backend/.env
ENABLE_PROFILING=true
ADMIN_API_TOKEN=your_secure_token_here
```

**Security Note:** Profiling endpoints expose internal application state and are protected by admin authentication. Only enable in development or controlled environments.

### Install Required Tools

```bash
# Install graphviz for visualization
# Ubuntu/Debian
sudo apt-get install graphviz

# macOS
brew install graphviz

# Go profiling tool is included with Go installation
go tool pprof -h
```

## Runtime Profiling (pprof)

### Available Endpoints

When `ENABLE_PROFILING=true`, the following endpoints are available (admin-only):

- `GET /debug/pprof/` - Index of available profiles
- `GET /debug/pprof/profile?seconds=30` - CPU profile (default 30s)
- `GET /debug/pprof/heap` - Memory allocation profile
- `GET /debug/pprof/goroutine` - Goroutine profile
- `GET /debug/pprof/allocs` - All memory allocations
- `GET /debug/pprof/block` - Blocking profile
- `GET /debug/pprof/mutex` - Mutex contention profile
- `GET /debug/pprof/threadcreate` - Thread creation profile
- `GET /debug/pprof/trace?seconds=5` - Execution trace

### Collecting Profiles

#### CPU Profile

Identifies hot code paths consuming CPU time:

```bash
# Using helper script (recommended)
cd backend
./scripts/profile_cpu.sh 30 cpu.prof

# Manual collection
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -o cpu.prof \
  "http://localhost:8000/debug/pprof/profile?seconds=30"
```

**When to use:** High CPU usage, slow request processing

#### Memory Profile

Shows memory allocation patterns:

```bash
# Using helper script (recommended)
./scripts/profile_memory.sh heap.prof

# Manual collection
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -o heap.prof \
  "http://localhost:8000/debug/pprof/heap"
```

**When to use:** High memory usage, memory leaks, OOM issues

#### Goroutine Profile

Shows active goroutines and their stack traces:

```bash
# Using helper script (recommended)
./scripts/profile_goroutines.sh goroutine.prof

# Manual collection
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -o goroutine.prof \
  "http://localhost:8000/debug/pprof/goroutine"
```

**When to use:** Goroutine leaks, high goroutine count, deadlocks

### Analyzing Profiles

#### Interactive CLI

```bash
# Open interactive pprof CLI
go tool pprof cpu.prof

# Common commands in pprof CLI:
(pprof) top              # Show top functions
(pprof) top -cum         # Show top by cumulative time
(pprof) list <function>  # Show source for function
(pprof) web              # Open web visualization
(pprof) pdf > output.pdf # Generate PDF
(pprof) quit             # Exit
```

#### Web Interface

```bash
# Start interactive web UI
go tool pprof -http=:8080 cpu.prof

# Open browser to http://localhost:8080
# Provides interactive flame graphs, source code, and call graphs
```

#### Command-Line Reports

```bash
# Top functions by CPU time
go tool pprof -top cpu.prof

# Top functions with cumulative time
go tool pprof -top -cum cpu.prof

# Show source code
go tool pprof -list=HandleFunc cpu.prof

# Generate flame graph SVG
go tool pprof -svg cpu.prof > flame.svg

# Text report
go tool pprof -text cpu.prof
```

#### Memory Analysis

```bash
# In-use memory (current heap state)
go tool pprof -inuse_space heap.prof

# Total allocated (including freed)
go tool pprof -alloc_space heap.prof

# Number of allocations
go tool pprof -alloc_objects heap.prof

# Compare two profiles
go tool pprof -base=baseline.prof current.prof
```

### Profile Comparison

Compare profiles to track changes:

```bash
# Collect baseline
./scripts/profile_cpu.sh 30 baseline_cpu.prof

# Make changes...

# Collect new profile
./scripts/profile_cpu.sh 30 current_cpu.prof

# Compare
go tool pprof -base=baseline_cpu.prof current_cpu.prof -top
go tool pprof -base=baseline_cpu.prof current_cpu.prof -http=:8080
```

## Benchmark Tests

### Running Benchmarks

```bash
cd backend

# Run all benchmarks
go test -bench=. -benchmem ./...

# Run specific benchmark
go test -bench=BenchmarkGetGraphData -benchmem ./internal/api/handlers

# Run with CPU profiling
go test -bench=BenchmarkGetGraphData -cpuprofile=cpu.prof ./internal/api/handlers

# Run with memory profiling
go test -bench=BenchmarkGetGraphData -memprofile=mem.prof ./internal/api/handlers

# Control benchmark duration
go test -bench=. -benchtime=10s ./internal/api/handlers
```

### Benchmark Output

```
BenchmarkGetGraphData/DefaultParams-8         1000      1234567 ns/op      12345 B/op     123 allocs/op
BenchmarkGetGraphData/WithMaxNodes-8           800      1456789 ns/op      15678 B/op     156 allocs/op
```

- `1000` - Number of iterations
- `1234567 ns/op` - Nanoseconds per operation
- `12345 B/op` - Bytes allocated per operation
- `123 allocs/op` - Number of allocations per operation

### Adding New Benchmarks

```go
// handlers/myhandler_bench_test.go
package handlers

import "testing"

func BenchmarkMyHandler(b *testing.B) {
    // Setup
    handler := NewMyHandler(mockDB)
    req := httptest.NewRequest("GET", "/api/endpoint", nil)
    
    b.ResetTimer() // Start timing after setup
    
    for i := 0; i < b.N; i++ {
        w := httptest.NewRecorder()
        handler.ServeHTTP(w, req)
    }
}
```

### Analyzing Benchmark Profiles

```bash
# Run benchmark with CPU profile
go test -bench=BenchmarkGetGraphData -cpuprofile=bench_cpu.prof ./internal/api/handlers

# Analyze profile
go tool pprof bench_cpu.prof

# Compare benchmark results
go test -bench=. ./... > old.txt
# Make changes...
go test -bench=. ./... > new.txt
benchstat old.txt new.txt
```

## Database Query Profiling

### SQL Query Benchmarking

```bash
cd backend
make benchmark-graph
```

This script:
- Benchmarks common graph queries
- Shows execution times over multiple runs
- Reports index usage statistics
- Identifies slow queries

### PostgreSQL Query Analysis

#### EXPLAIN ANALYZE

```sql
-- Analyze query performance
EXPLAIN (ANALYZE, BUFFERS, TIMING) 
SELECT * FROM graph_nodes 
ORDER BY val DESC 
LIMIT 20000;

-- Key metrics:
-- - Execution Time: Total query time
-- - Planning Time: Query planning overhead
-- - Buffers: Shared blocks read/hit ratio
-- - Rows: Actual vs estimated rows
```

#### Query Performance Monitoring

```sql
-- Enable query timing
SET track_activities = on;
SET track_io_timing = on;

-- View slow queries
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- View index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename IN ('graph_nodes', 'graph_links')
ORDER BY idx_scan DESC;
```

## Analysis and Optimization

### Performance Optimization Workflow

1. **Identify bottleneck**
   - Monitor Prometheus metrics
   - Review slow query logs
   - Check error rates and latencies

2. **Reproduce locally**
   - Collect baseline profile
   - Run load tests
   - Measure current performance

3. **Profile and analyze**
   - CPU profile for hot paths
   - Memory profile for allocations
   - Database query analysis

4. **Implement optimization**
   - Make targeted changes
   - Add/update indexes
   - Optimize algorithms

5. **Measure improvement**
   - Collect new profile
   - Run benchmarks
   - Compare before/after metrics

6. **Deploy and validate**
   - Deploy to staging
   - Monitor production metrics
   - Verify improvements

### Load Testing

```bash
# Install wrk for HTTP load testing
# Ubuntu/Debian
sudo apt-get install wrk

# macOS
brew install wrk

# Run load test
wrk -t4 -c100 -d30s http://localhost:8000/api/graph

# Output shows:
# - Requests/sec
# - Latency percentiles
# - Error rates
```

## Common Performance Issues

### High CPU Usage

**Symptoms:**
- Slow response times
- High CPU utilization in metrics

**Investigation:**
1. Collect CPU profile: `./scripts/profile_cpu.sh 30 cpu.prof`
2. Analyze top functions: `go tool pprof -top cpu.prof`
3. Look for hot paths in business logic

**Common causes:**
- JSON serialization of large datasets
- Inefficient algorithms (O(n²) loops)
- Regex operations in hot paths
- Excessive string operations

**Solutions:**
- Cache responses
- Optimize algorithms
- Use sync.Pool for reusable objects
- Stream responses for large datasets

### High Memory Usage

**Symptoms:**
- OOM crashes
- High memory utilization
- Slow GC pauses

**Investigation:**
1. Collect heap profile: `./scripts/profile_memory.sh heap.prof`
2. Analyze allocations: `go tool pprof -alloc_space heap.prof`
3. Check for memory leaks: multiple profiles over time

**Common causes:**
- Large response payloads
- Connection/goroutine leaks
- Unbounded caches
- Slice/map growth

**Solutions:**
- Limit response sizes
- Use connection pools properly
- Implement cache eviction
- Pre-allocate slices: `make([]T, 0, capacity)`
- Release resources in defer statements

### Slow Database Queries

**Symptoms:**
- High query latencies in metrics
- Timeouts
- Database CPU spikes

**Investigation:**
1. Run query benchmarks: `make benchmark-graph`
2. Use EXPLAIN ANALYZE on slow queries
3. Check index usage

**Common causes:**
- Missing indexes
- Sequential scans on large tables
- Inefficient JOINs
- Large result sets

**Solutions:**
- Add appropriate indexes (see `docs/perf.md`)
- Use query limits and pagination
- Denormalize data for read-heavy workloads
- Regular VACUUM and ANALYZE

### Goroutine Leaks

**Symptoms:**
- Growing goroutine count
- Memory growth
- Eventually OOM

**Investigation:**
1. Collect goroutine profile: `./scripts/profile_goroutines.sh goroutine.prof`
2. Analyze: `go tool pprof -text goroutine.prof`
3. Look for unexpected goroutine patterns

**Common causes:**
- Goroutines waiting on channels that never close
- HTTP connections not properly closed
- Forgotten context cancellations
- Infinite loops

**Solutions:**
- Always use context with timeout
- Defer connection/resource cleanup
- Use select with timeout for channel operations
- Implement proper shutdown logic

## Best Practices

### Development

1. **Profile early and often**
   - Profile during development, not just in production
   - Establish performance baselines
   - Add benchmarks for critical paths

2. **Write benchmark tests**
   - Benchmark hot code paths
   - Include benchmarks in CI/CD
   - Track performance regressions

3. **Use appropriate data structures**
   - Maps for lookups (O(1))
   - Slices for sequential access
   - Sync.Pool for reusable objects

4. **Minimize allocations**
   - Pre-allocate slices with capacity
   - Reuse buffers
   - Avoid string concatenation in loops

5. **Handle errors efficiently**
   - Avoid panic/recover in hot paths
   - Use sentinel errors
   - Cache error strings

### Production

1. **Enable metrics collection**
   - Use Prometheus for monitoring
   - Set up Grafana dashboards
   - Configure alerts

2. **Set resource limits**
   - Configure rate limiting
   - Set query timeouts
   - Limit response sizes

3. **Use caching strategically**
   - Cache expensive computations
   - Set appropriate TTLs
   - Monitor hit rates

4. **Regular maintenance**
   - VACUUM ANALYZE databases
   - Review slow query logs
   - Monitor goroutine counts
   - Check for memory leaks

5. **Gradual rollouts**
   - Deploy to staging first
   - Monitor key metrics
   - Use feature flags for risky changes
   - Have rollback plan ready

## Related Documentation

- [Performance Documentation](perf.md) - Database query optimization
- [Monitoring Guide](monitoring.md) - Prometheus metrics and Grafana dashboards
- [API Documentation](api.md) - API endpoints and usage
- [Developer Guide](developer-guide.md) - Development workflows

## Tools Reference

- [pprof documentation](https://pkg.go.dev/net/http/pprof)
- [Go profiling blog post](https://go.dev/blog/pprof)
- [Prometheus](https://prometheus.io/)
- [Grafana](https://grafana.com/)
- [benchstat](https://pkg.go.dev/golang.org/x/perf/cmd/benchstat)
