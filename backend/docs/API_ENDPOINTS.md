# API Endpoints

## Search API

### GET /api/search

Search for graph nodes by name or ID with fuzzy matching.

**Query Parameters:**
- `node` (required): Search query string (case-insensitive partial match)
- `limit` (optional): Maximum results to return (default: 50, max: 500)

**Response:** JSON
```json
{
  "query": "test",
  "count": 2,
  "results": [
    {
      "id": "user_123",
      "name": "testuser",
      "val": "100",
      "type": "user",
      "pos_x": 1.23,
      "pos_y": 4.56,
      "pos_z": 7.89
    }
  ]
}
```

**Features:**
- Case-insensitive fuzzy matching on node name and ID
- Results ordered by exact match first, then by weight/value
- Gzip compression support (when `Accept-Encoding: gzip` header is present)
- ETag caching support (sends `304 Not Modified` when content unchanged)

**Example:**
```bash
curl "http://localhost:8000/api/search?node=python&limit=10" \
  -H "Accept-Encoding: gzip"
```

---

## Export API

### GET /api/export

Export graph data in JSON or CSV format with optional filtering.

**Query Parameters:**
- `format` (optional): Export format - `json` or `csv` (default: `json`)
- `max_nodes` (optional): Maximum nodes to export (default: 10000, max: 50000)
- `max_links` (optional): Maximum links to export (default: 25000, max: 100000)
- `types` (optional): Comma-separated node types to filter (e.g., `user,subreddit`)

**Response (JSON format):**
```json
{
  "nodes": [
    {
      "id": "user_123",
      "name": "testuser",
      "val": "100",
      "type": "user"
    }
  ],
  "links": [
    {
      "source": "user_123",
      "target": "subreddit_456"
    }
  ]
}
```

**Response (CSV format):**
```csv
data_type,id,name,val,type,source,target
node,user_123,testuser,100,user,,
link,1,,,,,user_123,subreddit_456
```

**Features:**
- Multiple export formats (JSON, CSV)
- Configurable limits to prevent excessive exports
- Type filtering for targeted exports
- Gzip compression support
- ETag caching support
- Content-Disposition header for file downloads

**Examples:**

Export as JSON (default):
```bash
curl "http://localhost:8000/api/export?max_nodes=1000&max_links=2000"
```

Export as CSV with type filter:
```bash
curl "http://localhost:8000/api/export?format=csv&types=user,subreddit" \
  -o graph_export.csv
```

Export with compression and caching:
```bash
curl "http://localhost:8000/api/export?format=json" \
  -H "Accept-Encoding: gzip" \
  -H "If-None-Match: \"abc123...\""
```

---

## Middleware Features

### Gzip Compression

Both search and export endpoints support gzip compression to reduce bandwidth usage. Clients should send the `Accept-Encoding: gzip` header to receive compressed responses.

### ETag Caching

Both endpoints implement ETag-based caching:
1. First request returns an `ETag` header with a unique content hash
2. Subsequent requests with `If-None-Match: <etag>` header return `304 Not Modified` if content hasn't changed
3. `Cache-Control: public, max-age=60` header suggests 60-second cache lifetime

This reduces server load and bandwidth for repeated queries with identical results.

---

## Notes

- Search results are ordered by relevance (exact matches first, then by node weight)
- Export limits are enforced server-side to prevent resource exhaustion
- Both endpoints use the precalculated graph tables for fast access
- All responses include proper CORS headers for cross-origin requests
- Rate limiting applies to all endpoints (configured via environment variables)
