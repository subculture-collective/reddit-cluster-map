# Graph Nodes Pagination API

## Overview

The Graph API now supports cursor-based pagination for nodes, allowing clients to fetch large graphs incrementally.

## Endpoints

### GET /api/graph

Query parameters for pagination:

- `cursor` (optional): Base64-encoded cursor from previous page's `next_cursor`
- `page_size` (optional): Number of nodes per page (default: 5000, max: 50000)
- `with_positions` (optional): Include x, y, z coordinates (true/false)
- `types` (optional): Filter by node types (e.g., `user`, `subreddit`)

## Response Format

When using pagination (`cursor` or `page_size` params), the response includes:

```json
{
  "nodes": [
    {
      "id": "user_123",
      "name": "example_user",
      "val": 100,
      "type": "user",
      "x": 1.5,
      "y": 2.0,
      "z": 3.0
    }
  ],
  "links": [
    {
      "source": "user_123",
      "target": "subreddit_456"
    }
  ],
  "pagination": {
    "next_cursor": "MTAwOnVzZXJfMTIz",
    "has_more": true,
    "page_size": 5000
  }
}
```

## Pagination Metadata

- `next_cursor`: Use this value in the next request to get the following page
- `has_more`: Boolean indicating if more pages are available
- `page_size`: The page size used for this request

## Usage Examples

### First Page

```bash
# Request first 1000 nodes
curl "http://localhost:8000/api/graph?page_size=1000"
```

### Subsequent Pages

```bash
# Use next_cursor from previous response
curl "http://localhost:8000/api/graph?cursor=MTAwOnVzZXJfMTIz&page_size=1000"
```

### With Filters

```bash
# Get paginated users only, with positions
curl "http://localhost:8000/api/graph?page_size=1000&types=user&with_positions=true"
```

## Implementation Details

### Cursor Format

Cursors are base64-encoded strings containing:
- Node weight (val field as integer)
- Node ID for tie-breaking

Format: `base64(weight:id)`

### Node Ordering

Nodes are ordered by:
1. Weight (val) descending (highest first)
2. ID ascending (for consistent tie-breaking)

### Link Filtering

Links are only included when both source and target nodes are in the current page. This is a simplified approach suitable for most use cases.

For full graph traversal where you need all links between previously seen nodes, you would need to track seen nodes on the client side.

## Performance

- Target: <200ms per page query
- Queries use indexed columns for efficient pagination
- Page size is capped to prevent excessive memory usage

## Backward Compatibility

The existing API remains fully compatible:
- Requests without `cursor` or `page_size` use the original response format
- Standard `max_nodes` and `max_links` parameters still work as before
- Response format is `GraphResponse` (nodes + links) without pagination metadata

## Client Implementation Example

```typescript
interface PaginationInfo {
    next_cursor?: string;
    has_more: boolean;
    page_size?: number;
}

interface PaginatedGraphData {
    nodes: GraphNode[];
    links: GraphLink[];
    pagination?: PaginationInfo;
}

async function fetchAllNodes(pageSize: number = 5000): Promise<GraphNode[]> {
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

## Testing

Run the pagination tests:

```bash
cd backend
go test -v ./internal/api/handlers -run TestGetGraphDataPaginated
```

## Security Considerations

- Page size is capped at 50,000 to prevent abuse
- Cursors are validated before use
- Invalid cursors return 400 Bad Request
- Query timeouts are enforced (default 30s)
