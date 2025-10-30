# Search and Export Endpoints Implementation

## Overview

This document describes the implementation of the search and export API endpoints added in PR for issue #33.

## Architecture

### Search Endpoint (`/api/search`)

**Handler**: `backend/internal/api/handlers/search.go`

**Flow**:
1. Parse query parameters (`node`, `limit`)
2. Validate required parameters
3. Execute fuzzy SQL search via `SearchGraphNodes` query
4. Return JSON response with query metadata and results

**SQL Query**: `backend/internal/queries/graph.sql::SearchGraphNodes`
- Uses `ILIKE` for case-insensitive fuzzy matching
- Searches both node name and ID fields
- Orders by exact match priority, then by node weight
- Supports configurable result limit

### Export Endpoint (`/api/export`)

**Handler**: `backend/internal/api/handlers/export.go`

**Flow**:
1. Parse query parameters (`format`, `max_nodes`, `max_links`, `types`)
2. Validate format parameter (json or csv)
3. Apply caps to limits (50k nodes, 100k links)
4. Fetch data from precalculated graph tables
5. Format response based on requested format
6. Add Content-Disposition header for file download

**Data Sources**:
- Uses existing `GetPrecalculatedGraphDataCappedAll` for unfiltered exports
- Uses existing `GetPrecalculatedGraphDataCappedFiltered` for type-filtered exports

### Middleware

#### Gzip Compression (`backend/internal/middleware/gzip.go`)

**Features**:
- Wraps response writer to compress output
- Checks `Accept-Encoding` header for gzip support
- Uses sync.Pool for writer reuse
- Sets `Content-Encoding: gzip` header

**Implementation Notes**:
- Only compresses if client supports gzip
- Removes Content-Length header (changes after compression)
- Properly closes writer to flush buffer

#### ETag Caching (`backend/internal/middleware/etag.go`)

**Features**:
- Generates SHA256 hash of response body
- Returns 304 Not Modified for matching ETags
- Sets Cache-Control header (60 second cache)

**Implementation Notes**:
- Buffers response to generate hash before sending
- Compares client's If-None-Match header
- Uses first 16 bytes of hash for shorter ETags

## Route Registration

Routes are registered in `backend/internal/api/routes.go`:

```go
searchHandler := middleware.ETag(middleware.Gzip(http.HandlerFunc(handlers.SearchNode(q))))
r.Handle("/api/search", searchHandler).Methods("GET")

exportHandler := middleware.ETag(middleware.Gzip(http.HandlerFunc(handlers.ExportGraph(q))))
r.Handle("/api/export", exportHandler).Methods("GET")
```

Middleware is applied in order:
1. Request hits ETag middleware (outer)
2. Then Gzip middleware
3. Finally the handler

Response flows back through middleware in reverse:
1. Handler generates response
2. Gzip compresses (if supported)
3. ETag generates hash and checks cache

## Testing

### Unit Tests

**Handler Tests**:
- `search_test.go`: Tests search functionality, parameter validation, error handling
- `export_test.go`: Tests export formats, limits, type filtering

**Middleware Tests**:
- `gzip_test.go`: Tests compression with/without Accept-Encoding header
- `etag_test.go`: Tests ETag generation and 304 responses

**Integration Tests**:
- `routes_test.go`: Verifies endpoints are properly registered

### Running Tests

```bash
cd backend
go test ./internal/api/handlers -v -run "TestSearch|TestExport"
go test ./internal/middleware -v -run "TestGzip|TestETag"
go test ./internal/api -v
```

## Security Considerations

### Input Validation

- Search query is parameterized (no SQL injection)
- Limits are enforced server-side (no excessive resource usage)
- Format parameter is validated (only json/csv allowed)
- Type filters use array parameters (safe from injection)

### Integer Conversions

CodeQL flagged several int-to-int32 conversions. These are safe because:
- maxNodes is capped at 50,000 (well below int32 max)
- maxLinks is capped at 100,000 (well below int32 max)
- search limit is capped at 500
- All values are explicitly bounded before conversion

### Rate Limiting

Both endpoints are subject to the global rate limiting middleware configured in the router.

## Performance

### Optimizations

1. **Database-level capping**: Limits are applied in SQL for efficiency
2. **Fuzzy search indexing**: Uses existing indexes on graph_nodes table
3. **Writer pooling**: Gzip middleware reuses writers to reduce allocations
4. **Response caching**: ETag middleware prevents redundant computation

### Metrics

Both endpoints track metrics via Prometheus:
- `APIRequestsTotal{endpoint="/api/search", method="GET", status="200"}`
- `APIRequestsTotal{endpoint="/api/export", method="GET", status="200"}`

### Tracing

Both endpoints use OpenTelemetry spans for distributed tracing:
- `handlers.SearchNode`: Tracks search operations
- `handlers.ExportGraph`: Tracks export operations

## Future Enhancements

Potential improvements for future PRs:

1. **Search enhancements**:
   - Support for advanced query syntax (AND, OR, NOT)
   - Search by additional fields (type, value)
   - Result highlighting

2. **Export enhancements**:
   - Additional formats (GraphML, GEXF)
   - Streaming for very large exports
   - Compression in CSV format

3. **Caching improvements**:
   - Redis-backed cache for distributed systems
   - Vary header support for different query parameters
   - Longer TTLs for expensive queries

4. **Performance**:
   - Add database indexes specific to search patterns
   - Implement cursor-based pagination for large result sets
   - Pre-generate common export combinations

## Related Files

- SQL queries: `backend/internal/queries/graph.sql`
- Generated code: `backend/internal/db/graph.sql.go`
- Routes: `backend/internal/api/routes.go`
- Documentation: `backend/docs/API_ENDPOINTS.md`
- Tests: `backend/internal/api/handlers/*_test.go`
- Middleware: `backend/internal/middleware/{gzip,etag}.go`
