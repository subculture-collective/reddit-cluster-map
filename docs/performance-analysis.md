# Performance Analysis and Optimization Recommendations

**Date:** November 2025  
**Status:** Initial Analysis

## Executive Summary

This document provides performance analysis and optimization recommendations for the Reddit Cluster Map application based on code review and established profiling infrastructure.

## Current Performance Profile

### Strengths

1. **Database Optimization**
   - Comprehensive indexing strategy (migrations 000017, 000018)
   - Indexed graph queries with documented performance targets
   - Query capping to prevent unbounded result sets
   - Statement timeouts configured (25s default)

2. **API Layer**
   - Response caching with 60s TTL
   - Rate limiting implemented
   - Request timeouts (30s for graph queries)
   - Prometheus metrics for monitoring

3. **Monitoring**
   - Prometheus metrics collection
   - Grafana dashboards
   - Error tracking with Sentry
   - Distributed tracing with OpenTelemetry

### Areas for Optimization

## 1. Graph Data Endpoint

### Current Implementation

File: `backend/internal/api/handlers/graph.go`

**Observations:**

1. **Memory Allocation Pattern**
   ```go
   nodes := make(map[string]GraphNode, len(rows))
   links := make([]GraphLink, 0, len(rows))
   ```
   - Good: Pre-allocates map with capacity
   - Potential issue: Links slice starts at 0 capacity, will grow dynamically

2. **Type Filtering in Application Layer**
   ```go
   if !allowAll {
       if len(allowedTypes) == 0 {
           continue
       }
       if t != "" {
           if _, ok := allowedTypes[t]; !ok {
               continue
           }
       }
   }
   ```
   - Filtering happens after fetching data from database
   - Database query already applies type filter, but additional filtering in Go

3. **Value Conversion**
   ```go
   v := atoiSafe(row.Val)
   ```
   - String to int conversion for every node
   - Could benefit from numeric storage type

### Recommendations

**Priority: HIGH**

1. **Pre-allocate Links Slice**
   ```go
   // Estimate: assume 2-3 links per node on average
   links := make([]GraphLink, 0, len(rows)/2)
   ```

2. **Reduce Type Checking**
   - Move more filtering logic to SQL queries
   - Cache type map lookups if used frequently

3. **Consider Streaming Response**
   - For very large result sets, stream JSON instead of buffering
   - Reduces memory pressure
   - Example using `json.Encoder`:
   ```go
   encoder := json.NewEncoder(w)
   encoder.Encode(response)
   ```

4. **Optimize Cache Key Generation**
   - Current implementation uses string concatenation
   - Benchmark shows: 94-143 ns/op with 3-4 allocations
   - Consider using a struct hash or pre-computed key format

**Priority: MEDIUM**

5. **Database Schema Enhancement**
   - Consider migrating `val` column to numeric type
   - Eliminates runtime conversion overhead
   - Improves database sorting performance

6. **Response Compression**
   - Already implemented with gzip middleware for some endpoints
   - Ensure graph endpoint uses compression for large responses

## 2. Database Query Performance

### Current State

File: `docs/perf.md`

**Documented Performance Targets:**

- Small datasets (<10K nodes): <10ms
- Medium datasets (10K-100K nodes): 10-50ms
- Large datasets (>100K nodes): 50-200ms

### Recommendations

**Priority: HIGH**

1. **Monitor Index Usage**
   ```sql
   SELECT schemaname, tablename, indexname, idx_scan
   FROM pg_stat_user_indexes
   WHERE tablename IN ('graph_nodes', 'graph_links')
     AND idx_scan = 0;
   ```
   - Identify unused indexes
   - Drop if not used to reduce write overhead

2. **Regular Maintenance**
   - Schedule VACUUM ANALYZE
   - Monitor table bloat
   - Reindex if necessary

**Priority: MEDIUM**

3. **Query Plan Analysis**
   - Regularly run EXPLAIN ANALYZE on production queries
   - Compare with documented plans
   - Alert on plan changes

4. **Connection Pooling**
   - Review current pool settings
   - Monitor connection usage metrics
   - Tune pool size based on actual load

## 3. Crawler Performance

### Current Implementation

File: `backend/internal/crawler/`

**Rate Limiting:**
- Global rate limiter at 1.66 RPS (601ms delay)
- Burst size: 1
- Configurable via `CRAWLER_RPS`

### Recommendations

**Priority: MEDIUM**

1. **Batch Processing**
   - Group crawl jobs by priority
   - Process high-priority jobs first
   - Consider parallel crawling for independent subreddits

2. **Connection Reuse**
   - Verify HTTP client reuses connections
   - Enable keep-alive
   - Monitor connection pool metrics

3. **Response Size Optimization**
   - Request only needed fields from Reddit API
   - Limit listing parameters appropriately

## 4. Memory Management

### Current State

- No explicit memory profiling in place (before this PR)
- Basic connection pooling
- Response caching with fixed TTL

### Recommendations

**Priority: HIGH**

1. **Implement Memory Profiling Schedule**
   ```bash
   # Weekly memory profile during peak load
   make profile-memory
   ```

2. **Monitor Goroutine Leaks**
   ```bash
   # Check goroutine count regularly
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8000/debug/pprof/goroutine
   ```

3. **Cache Eviction Strategy**
   - Current: Time-based eviction (60s)
   - Consider: LRU cache with size limit
   - Monitor cache hit rates

**Priority: MEDIUM**

4. **Response Buffer Pool**
   ```go
   var bufferPool = sync.Pool{
       New: func() interface{} {
           return new(bytes.Buffer)
       },
   }
   ```

5. **Struct Alignment**
   - Review struct field ordering
   - Use `go run golang.org/x/tools/go/analysis/passes/fieldalignment/cmd/fieldalignment@latest -fix ./...`

## 5. Frontend Integration

### Current State

- Vite + React with 3D visualization
- Fetches from `/api/graph`
- Client-side rendering with `react-force-graph-3d`

### Recommendations

**Priority: LOW**

1. **Progressive Loading**
   - Load minimal graph first
   - Fetch additional nodes on demand
   - Implement viewport-based loading for large graphs

2. **WebWorker for Layout**
   - Offload force-directed layout to WebWorker
   - Keep main thread responsive

3. **Data Pagination**
   - Support cursor-based pagination
   - Allow incremental graph building

## 6. Monitoring and Alerting

### Current State

- Prometheus metrics
- Grafana dashboards
- Sentry error tracking
- OpenTelemetry tracing

### Recommendations

**Priority: HIGH**

1. **Performance SLIs**
   - Define Service Level Indicators:
     - p95 graph query latency < 1s
     - API error rate < 1%
     - Cache hit rate > 70%

2. **Alerting Rules**
   ```yaml
   - alert: SlowGraphQueries
     expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1.0
     labels:
       severity: warning
   ```

3. **Resource Usage Metrics**
   - Memory usage trends
   - Goroutine count
   - Database connection pool usage
   - Cache memory usage

**Priority: MEDIUM**

4. **Profile Collection Automation**
   - Automated profile collection during incidents
   - Store profiles for historical analysis
   - Compare profiles over time

## 7. Build and Deployment

### Recommendations

**Priority: LOW**

1. **Build Optimization**
   ```bash
   # Enable compiler optimizations
   go build -ldflags="-s -w" ./cmd/server
   ```

2. **Docker Image Optimization**
   - Use multi-stage builds
   - Minimize layer sizes
   - Use scratch or distroless base images

## Implementation Roadmap

### Phase 1: Immediate (1-2 weeks)

1. ✅ Implement profiling infrastructure (completed)
2. Run baseline performance benchmarks
3. Set up performance monitoring alerts
4. Add pre-allocation for links slice

### Phase 2: Short-term (1 month)

1. Implement streaming response for large graphs
2. Optimize cache key generation
3. Add memory profiling to CI/CD
4. Regular database maintenance automation

### Phase 3: Medium-term (2-3 months)

1. Migrate `val` column to numeric type
2. Implement progressive loading in frontend
3. Optimize crawler batch processing
4. Response buffer pool implementation

### Phase 4: Long-term (3+ months)

1. Consider database partitioning for very large datasets
2. Evaluate CDN for static responses
3. Implement distributed caching (Redis)
4. Advanced query optimization based on production patterns

## Benchmarking Baseline

### Handler Benchmarks

```
BenchmarkCacheKey/AllTypes-4         	12502611	94.55 ns/op	26 B/op	3 allocs/op
BenchmarkCacheKey/WithTypes-4        	11854322	99.41 ns/op	42 B/op	3 allocs/op
BenchmarkCacheKey/WithPositions-4    	 8416932	143.1 ns/op	66 B/op	4 allocs/op
```

**Analysis:**
- Cache key generation is fast (< 150ns)
- Low allocation count (3-4 per call)
- Minimal memory impact
- Not a bottleneck

### Database Query Benchmarks

To establish baseline:
```bash
cd backend
make benchmark-graph
```

Document results for:
- Top 20K nodes selection
- Link filtering with selected nodes
- Type-filtered queries

## Success Metrics

### Performance Targets

1. **API Latency**
   - p50 < 100ms
   - p95 < 500ms
   - p99 < 1000ms

2. **Throughput**
   - Support 100 RPS with current limits
   - Maintain < 5% error rate

3. **Resource Usage**
   - Memory < 2GB under normal load
   - CPU < 70% average
   - Database connections < 80% of pool

4. **Cache Effectiveness**
   - Hit rate > 70%
   - Reduces database load by 50%+

## Continuous Monitoring

### Weekly Tasks

- Review Grafana dashboards
- Check for slow query logs
- Monitor error rates and types
- Review cache hit rates

### Monthly Tasks

- Run full performance benchmark suite
- Collect and analyze profiles
- Review and tune database indexes
- Update performance documentation

### Quarterly Tasks

- Performance review with stakeholders
- Capacity planning
- Optimization roadmap adjustment
- Load testing

## Tools and Resources

### Profiling
- `go tool pprof` - Profile analysis
- `make profile-cpu` - CPU profiling
- `make profile-memory` - Memory profiling
- `make benchmark` - Go benchmarks

### Monitoring
- Prometheus - Metrics collection
- Grafana - Visualization
- Sentry - Error tracking
- OpenTelemetry - Distributed tracing

### Database
- `EXPLAIN ANALYZE` - Query analysis
- `pg_stat_statements` - Query statistics
- `make benchmark-graph` - Graph query benchmarks

## References

- [Profiling Guide](profiling.md)
- [Performance Documentation](perf.md)
- [Monitoring Guide](monitoring.md)
- [Developer Guide](developer-guide.md)

## Conclusion

The Reddit Cluster Map application has a solid foundation for performance monitoring and optimization. Key strengths include comprehensive database indexing, request capping, and monitoring infrastructure.

Primary optimization opportunities lie in:
1. Memory allocation optimization in hot paths
2. Response streaming for large datasets
3. Enhanced monitoring and alerting
4. Regular maintenance automation

With the profiling infrastructure now in place, the next step is to collect baseline metrics under realistic load and use those insights to prioritize optimization efforts.
