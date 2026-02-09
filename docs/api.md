# API reference

## Base URL

- Public routes are served by the API container (Docker default: `http://api:8000`).
- When served behind nginx (frontend), requests go to `/api/*`.

## Endpoints

### GET /api/graph

Returns the consolidated graph JSON:

```
{ "nodes": Node[], "links": Link[] }
```

Notes:

Query params:

    - Optional: `max_nodes` (default 20000) - maximum number of nodes to return
    - Optional: `max_links` (default 50000) - maximum number of links to return
    - Optional: `types=subreddit,user,post,comment` to filter node types
    - Optional: `with_positions=true` to include precomputed positions (when available) as `x,y,z` on nodes
    - Optional: `fallback=true|false` (default true) - whether to fall back to legacy graph if precalculated data is unavailable

Response codes:
    - `200 OK` - successful response with graph data
    - `408 Request Timeout` - query exceeded timeout (default 30s), try reducing max_nodes or max_links
    - `500 Internal Server Error` - server error

Performance notes:
    - Results are cached for 60 seconds per parameter combination
    - Large datasets may take longer to query; consider reducing max_nodes/max_links if timeouts occur
    - The server enforces a configurable query timeout (GRAPH_QUERY_TIMEOUT_MS, default 30000ms)

### POST /api/crawl

Enqueue a subreddit crawl job.

Request body:
{ "id": "subreddit_123", "name": "AskReddit", "val": 123456, "type": "subreddit", "x": 12.3, "y": -4.5, "z": 78.9 }

```
{ "subreddit": "AskReddit" }
```

Response: `202 Accepted` on success.

### GET /subreddits

List subreddits.

Query params: `limit`, `offset`.

### GET /users

List users with pagination.

Query params: `limit`, `offset`.

### GET /posts

List posts by subreddit.

Query params: `subreddit_id`, `limit`, `offset`.

### GET /comments

List comments by post.

Query params: `post_id`.

### GET /jobs

List crawl jobs with pagination.

Query params: `limit`, `offset`.

### Admin backups

Requires `ADMIN_APITOKEN` if configured by the server.

#### GET /api/admin/backups

List available database backup files (read-only).

Response JSON:

```
[{ "name": string, "size": number, "modified": RFC3339 string }]
```

Notes:

- Only files named like `reddit_cluster_YYYYMMDD_HHMMSS.sql` are returned.
- Results are sorted by name (timestamp ascending).

#### GET /api/admin/backups/{name}

Download a specific backup file by name.

Path parameter:

- `name`: Must match `reddit_cluster_*.sql` and refer to an existing file.

Response: `200 OK` with `application/sql` attachment. `404` if not found.

### Cache Administration

Requires `ADMIN_API_TOKEN` authentication. These endpoints manage the API response cache.

#### POST /api/admin/cache/invalidate

Invalidates (clears) all entries from the API cache.

**Authentication:** Bearer token required via `Authorization: Bearer <ADMIN_API_TOKEN>`

**Response:**
```json
{
  "status": "ok",
  "message": "Cache invalidated successfully"
}
```

**Response codes:**
- `200 OK` - cache successfully invalidated
- `401 Unauthorized` - invalid or missing admin token

**Use cases:**
- Force refresh of cached graph data after manual database changes
- Clear cache after graph precalculation completes
- Debugging cache-related issues

#### GET /api/admin/cache/stats

Returns current cache statistics for monitoring and debugging.

**Authentication:** Bearer token required via `Authorization: Bearer <ADMIN_API_TOKEN>`

**Response:**
```json
{
  "hits": 12345,
  "misses": 678,
  "keysAdded": 890,
  "evictions": 123,
  "sizeBytes": 104857600,
  "items": 456
}
```

**Response codes:**
- `200 OK` - statistics returned successfully
- `401 Unauthorized` - invalid or missing admin token

**Statistics explained:**
- `hits`: Total number of cache hits since server start
- `misses`: Total number of cache misses since server start
- `keysAdded`: Total number of keys added to cache since server start
- `evictions`: Total number of evicted entries due to size/count limits
- `sizeBytes`: Current approximate cache size in bytes
- `items`: Current number of items in cache

**Monitoring:**
These statistics are also exposed via Prometheus metrics at `/metrics`:
- `api_cache_hits_total{endpoint="graph"}`
- `api_cache_misses_total{endpoint="graph"}`
- `api_cache_size_bytes{endpoint="graph"}`
- `api_cache_items_total{endpoint="graph"}`
- `api_cache_evictions_total{endpoint="graph"}`

### Cache Configuration

The cache can be configured via environment variables:

- `CACHE_MAX_SIZE_MB` (default: 512) - Maximum cache size in megabytes
- `CACHE_MAX_ENTRIES` (default: 10000) - Maximum number of cache entries
- `CACHE_TTL_SECONDS` (default: 60) - Time-to-live for cache entries in seconds

**Notes:**
- The cache uses LRU (Least Recently Used) eviction when limits are reached
- Cache entries expire after the configured TTL
- Cache is shared between `/api/graph` and `/api/communities` endpoints
- Different parameter combinations create separate cache entries
