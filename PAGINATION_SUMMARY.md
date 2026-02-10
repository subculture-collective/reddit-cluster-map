# Pagination Implementation Summary

## Overview

Successfully implemented cursor-based pagination for the graph nodes API as specified in issue #140.

## Implementation Details

### API Changes

- **Endpoint**: `GET /api/graph`
- **New Query Parameters**:
  - `cursor` (optional): Base64-encoded cursor for subsequent pages
  - `page_size` (optional): Number of nodes per page (default: 5000, max: 50000)
- **Backward Compatible**: Existing API behavior unchanged when pagination params not provided

### Response Format

When pagination is used, the response includes:

```json
{
  "nodes": [...],
  "links": [...],
  "pagination": {
    "next_cursor": "base64_encoded_cursor",
    "has_more": true,
    "page_size": 5000
  }
}
```

### Cursor Format

- Base64-encoded string containing: `weight:id`
- Weight is used for ordering (descending)
- ID is used for tie-breaking (ascending)
- Example: `encodeCursor(100, "node_123")` → `"MTAwOm5vZGVfMTIz"`

### Database Queries

Two new SQL queries added:

1. **GetPaginatedGraphNodes**: Fetches nodes ordered by weight with cursor support
2. **GetLinksForPaginatedNodes**: Fetches links where both endpoints are in the provided node list

### Link Filtering

Links are included only when both source and target nodes are in the current page. This ensures:
- Consistent response structure
- No dangling references
- Simplified client-side processing

## Performance Results

Benchmark results (on AMD EPYC 7763):

| Page Size | Time per Request | Memory per Request |
|-----------|------------------|-------------------|
| 1,000 nodes | 0.58 ms | 622 KB |
| 5,000 nodes | 3.89 ms | 4.07 MB |
| 10,000 nodes | 8.03 ms | 8.81 MB |

All well under the <200ms requirement! ✅

### Cursor Operations

- Encode: ~217 ns
- Decode: ~134 ns

## Test Coverage

Comprehensive test suite includes:

1. **Cursor Encoding/Decoding**
   - Valid cursors with various formats
   - Invalid cursor handling
   - Empty cursor handling

2. **Pagination Behavior**
   - First page (no cursor)
   - Subsequent pages (with cursor)
   - Last page detection
   - `has_more` flag accuracy

3. **Parameter Handling**
   - Page size defaults and limits
   - Invalid cursor errors
   - Type filtering integration
   - Position inclusion

4. **Performance**
   - Benchmark tests for various page sizes
   - Cursor encoding/decoding performance

## Acceptance Criteria Status

- ✅ Pagination returns consistent results across pages
- ✅ No duplicate nodes across pages (cursor-based ordering ensures uniqueness)
- ✅ Links correctly reference only known nodes (filtered to current page)
- ✅ Response includes `next_cursor` and `has_more` metadata
- ✅ Performance: each page query <200ms (actual: <10ms for typical page sizes)

## Files Changed

### Backend
- `backend/internal/queries/graph.sql` - New pagination queries
- `backend/internal/db/graph.sql.go` - Generated sqlc code
- `backend/internal/api/handlers/graph.go` - Pagination handler implementation
- `backend/internal/api/handlers/graph_pagination_test.go` - Comprehensive tests
- `backend/internal/api/handlers/graph_pagination_bench_test.go` - Performance benchmarks
- `backend/internal/api/handlers/*_test.go` - Updated mocks for new interface methods

### Frontend
- `frontend/src/types/graph.ts` - Added `PaginatedGraphData` and `PaginationInfo` types

### Documentation
- `docs/api-pagination.md` - Complete API documentation with examples

## Usage Example

```bash
# First page
curl "http://localhost:8000/api/graph?page_size=1000"

# Second page (use next_cursor from previous response)
curl "http://localhost:8000/api/graph?page_size=1000&cursor=MTAwOm5vZGVfMTIz"

# With filters
curl "http://localhost:8000/api/graph?page_size=1000&types=user&with_positions=true"
```

## Future Enhancements

Potential improvements for future iterations:

1. **Cross-Page Link Tracking**: Track seen nodes across multiple pages to include links between any previously seen nodes
2. **Bidirectional Pagination**: Support for `?cursor=xxx&direction=prev` to go backwards
3. **Streaming API**: NDJSON streaming for very large result sets
4. **Link Pagination**: Separate cursor for paginating links independently
5. **Cache Strategy**: Selective caching for frequently accessed page ranges

## Notes

- Pagination responses are not cached due to cursor-specific nature
- Default page size (5000) balances performance and usability
- Maximum page size (50000) prevents memory exhaustion
- SQL queries use indexed columns for efficient cursor-based pagination
