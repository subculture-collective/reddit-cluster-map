# Graph API Pagination Implementation

## Quick Start

### Using the Paginated API

```bash
# Fetch first page (5000 nodes by default)
curl "http://localhost:8000/api/graph?page_size=5000"

# Fetch next page using cursor from previous response
curl "http://localhost:8000/api/graph?page_size=5000&cursor=MTAwOm5vZGVfMTIz"

# With filters
curl "http://localhost:8000/api/graph?page_size=1000&types=user&with_positions=true"
```

### Testing the Implementation

Run the test script:
```bash
cd scripts
./test-pagination.sh
```

Run unit tests:
```bash
cd backend
go test -v ./internal/api/handlers -run TestGetGraphDataPaginated
```

Run benchmarks:
```bash
cd backend
go test -bench=BenchmarkPaginated ./internal/api/handlers
```

## Implementation Overview

This implementation adds cursor-based pagination to the `/api/graph` endpoint, allowing clients to fetch large graphs incrementally.

### Key Features

1. **Cursor-Based Pagination**: Uses base64-encoded cursors (`weight:id`) for consistent ordering
2. **Configurable Page Size**: Default 5000, max 50000 nodes per page
3. **Backward Compatible**: Existing API behavior unchanged when pagination params not used
4. **High Performance**: <10ms response time for typical page sizes
5. **Type Safety**: Full TypeScript support with `PaginatedGraphData` interface

### Architecture

```
Client Request
    ↓
GET /api/graph?page_size=5000&cursor=xxx
    ↓
Parse & Validate Parameters
    ↓
Decode Cursor (if present)
    ↓
Query Database (page_size + 1 rows)
    ↓
Build Response
    ↓
Generate next_cursor (if more rows)
    ↓
Return PaginatedGraphResponse
```

### Database Queries

**GetPaginatedGraphNodes**
- Orders by weight (val) descending, then ID ascending
- Uses cursor for pagination (WHERE clause)
- Fetches page_size + 1 to detect more pages

**GetLinksForPaginatedNodes**
- Filters links to only include nodes in current page
- Uses IN clause with node ID array
- Prevents dangling references

### Response Structure

```typescript
interface PaginatedGraphData {
    nodes: GraphNode[];
    links: GraphLink[];
    pagination?: {
        next_cursor?: string;  // Base64-encoded cursor for next page
        has_more: boolean;     // True if more pages available
        page_size?: number;    // Page size used for this request
    };
}
```

## Performance Characteristics

### Benchmark Results

| Page Size | Latency | Memory | Throughput |
|-----------|---------|--------|------------|
| 1,000 | 0.58 ms | 622 KB | ~1,700 req/s |
| 5,000 | 3.89 ms | 4.07 MB | ~257 req/s |
| 10,000 | 8.03 ms | 8.81 MB | ~125 req/s |

### Cursor Operations
- Encoding: ~217 ns
- Decoding: ~134 ns

### Scalability

- ✅ Handles graphs with 100k+ nodes efficiently
- ✅ Constant memory usage per request
- ✅ No n+1 query issues
- ✅ Indexed queries for fast pagination

## API Reference

See [docs/api-pagination.md](../docs/api-pagination.md) for complete API documentation.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | string | - | Base64-encoded cursor from previous page |
| `page_size` | integer | 5000 | Number of nodes per page (max: 50000) |
| `with_positions` | boolean | false | Include x, y, z coordinates |
| `types` | string | - | Filter by node types (comma-separated) |

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `nodes` | GraphNode[] | Array of graph nodes |
| `links` | GraphLink[] | Array of graph links |
| `pagination` | PaginationInfo | Pagination metadata (only when using pagination) |

## Integration Examples

### JavaScript/TypeScript

```typescript
async function fetchAllNodes(
    pageSize: number = 5000
): Promise<GraphNode[]> {
    const allNodes: GraphNode[] = [];
    let cursor: string | undefined;
    
    do {
        const params = new URLSearchParams({
            page_size: pageSize.toString(),
        });
        
        if (cursor) {
            params.set('cursor', cursor);
        }
        
        const response = await fetch(`/api/graph?${params}`);
        const data: PaginatedGraphData = await response.json();
        
        allNodes.push(...data.nodes);
        cursor = data.pagination?.next_cursor;
        
    } while (cursor);
    
    return allNodes;
}
```

### Python

```python
import requests
import base64

def fetch_all_nodes(base_url: str, page_size: int = 5000):
    all_nodes = []
    cursor = None
    
    while True:
        params = {"page_size": page_size}
        if cursor:
            params["cursor"] = cursor
        
        response = requests.get(f"{base_url}/api/graph", params=params)
        data = response.json()
        
        all_nodes.extend(data["nodes"])
        
        pagination = data.get("pagination", {})
        cursor = pagination.get("next_cursor")
        
        if not pagination.get("has_more", False):
            break
    
    return all_nodes
```

### cURL

```bash
#!/bin/bash
# Fetch all pages

CURSOR=""
PAGE=1

while true; do
    echo "Fetching page $PAGE..."
    
    URL="http://localhost:8000/api/graph?page_size=5000"
    if [ -n "$CURSOR" ]; then
        URL="${URL}&cursor=${CURSOR}"
    fi
    
    RESPONSE=$(curl -s "$URL")
    
    # Save to file
    echo "$RESPONSE" > "page_${PAGE}.json"
    
    # Extract next cursor
    CURSOR=$(echo "$RESPONSE" | jq -r '.pagination.next_cursor // empty')
    
    # Check if more pages
    HAS_MORE=$(echo "$RESPONSE" | jq -r '.pagination.has_more')
    
    if [ "$HAS_MORE" != "true" ] || [ -z "$CURSOR" ]; then
        echo "No more pages."
        break
    fi
    
    PAGE=$((PAGE + 1))
done
```

## Testing

### Unit Tests

```bash
# Run all pagination tests
go test -v ./internal/api/handlers -run TestGetGraphDataPaginated

# Run specific test
go test -v ./internal/api/handlers -run TestCursorEncoding
```

### Benchmarks

```bash
# Run all benchmarks
go test -bench=. ./internal/api/handlers

# Run pagination benchmarks only
go test -bench=BenchmarkPaginated ./internal/api/handlers
```

### Integration Testing

```bash
# Start the server
make up

# Run test script
./scripts/test-pagination.sh
```

## Troubleshooting

### Invalid Cursor Error

**Problem**: Getting 400 Bad Request with "Invalid cursor format"

**Solution**: Ensure cursor is properly URL-encoded and hasn't been truncated

```bash
# Correct
curl "http://localhost:8000/api/graph?cursor=MTAwOm5vZGVfMTIz&page_size=1000"

# Wrong (cursor truncated)
curl "http://localhost:8000/api/graph?cursor=MTAw&page_size=1000"
```

### Empty Results

**Problem**: Getting empty nodes array

**Solution**: Check if filters are too restrictive

```bash
# May return empty if no users exist
curl "http://localhost:8000/api/graph?types=user&page_size=1000"

# Remove filters to see all nodes
curl "http://localhost:8000/api/graph?page_size=1000"
```

### Slow Performance

**Problem**: Queries taking longer than expected

**Solution**: 
1. Reduce page size
2. Check database indexes
3. Verify database connection pool settings

```bash
# Use smaller page size
curl "http://localhost:8000/api/graph?page_size=1000"  # instead of 50000
```

## Future Enhancements

Potential improvements for future iterations:

1. **Streaming API**: NDJSON streaming for very large result sets
2. **Bidirectional Pagination**: Support for navigating backwards
3. **Link Pagination**: Separate cursor for paginating links
4. **Cross-Page Links**: Track seen nodes to include links between any seen nodes
5. **Cached Pages**: Strategic caching for frequently accessed ranges

## Files Modified

- `backend/internal/queries/graph.sql` - Pagination SQL queries
- `backend/internal/db/graph.sql.go` - Generated sqlc code
- `backend/internal/api/handlers/graph.go` - Handler implementation
- `backend/internal/api/handlers/graph_pagination_test.go` - Unit tests
- `backend/internal/api/handlers/graph_pagination_bench_test.go` - Benchmarks
- `frontend/src/types/graph.ts` - TypeScript types
- `docs/api-pagination.md` - API documentation
- `scripts/test-pagination.sh` - Example test script

## License

See repository LICENSE file.
