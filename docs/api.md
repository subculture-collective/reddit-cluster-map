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

### GET /api/graph/overview

Returns a lightweight community-level overview of the graph. This endpoint returns community supernodes and inter-community links, providing a high-level view before drill-down.

Query params:
    - Optional: `max_nodes` (default 100) - maximum number of community supernodes to return
    - Optional: `max_links` (default 500) - maximum number of inter-community links to return
    - Optional: `with_positions=true` to include precomputed positions as `x,y,z` on nodes

Response format:
```json
{
  "nodes": [
    {
      "id": "community_1",
      "name": "Community 1", 
      "val": 100,
      "type": "community",
      "x": 1.5,
      "y": 2.5,
      "z": 3.5
    }
  ],
  "links": [
    {
      "source": "community_1",
      "target": "community_2"
    }
  ]
}
```

Response codes:
    - `200 OK` - successful response with overview data
    - `408 Request Timeout` - query exceeded timeout
    - `500 Internal Server Error` - server error

Performance notes:
    - Typically returns <1k nodes, optimized for fast overview rendering
    - Results are cached independently from main graph endpoint
    - Target response time: <100ms

### GET /api/graph/region

Returns nodes and links within a 3D bounding box for spatial viewport queries.

Query params:
    - Required:
        - `x_min`, `x_max` - X-axis bounds (float)
        - `y_min`, `y_max` - Y-axis bounds (float)
        - `z_min`, `z_max` - Z-axis bounds (float)
    - Optional:
        - `max_nodes` (default 10000) - maximum nodes to return
        - `max_links` (default 50000) - maximum links to return

Response format: Same as `/api/graph` with positions always included

Response codes:
    - `200 OK` - successful response with region data
    - `400 Bad Request` - invalid bounding box parameters
    - `408 Request Timeout` - query exceeded timeout
    - `500 Internal Server Error` - server error

Performance notes:
    - Uses spatial index for efficient bounding box queries
    - Results are cached per bounding box and limits
    - Target response time: <200ms

### GET /api/graph/community/{id}

Returns the full subgraph of nodes and links within a specific community (drill-down view). This is an alias for `/api/communities/{id}` following the tiered API convention.

Path params:
    - `id` - Community ID (integer)

Query params:
    - Optional: `max_nodes` (default 10000) - maximum nodes to return
    - Optional: `max_links` (default 50000) - maximum links to return  
    - Optional: `with_positions=true` to include positions

Response format: Same as `/api/graph`

Response codes:
    - `200 OK` - successful response with community subgraph
    - `404 Not Found` - community does not exist
    - `408 Request Timeout` - query exceeded timeout
    - `500 Internal Server Error` - server error

Performance notes:
    - Results are cached per community and limits
    - Target response time: <200ms

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
- The cache uses an approximate eviction policy based on access frequency and recency when limits are reached (powered by ristretto, not strict LRU)
- Cache entries expire after the configured TTL
- Cache is shared between `/api/graph` and `/api/communities` endpoints
- Different parameter combinations create separate cache entries

### GET /api/graph/ws (WebSocket)

**Since:** v0.2.0

Establishes a WebSocket connection for receiving incremental graph updates in real-time.

**Connection URL:**
- Development: `ws://localhost:8000/api/graph/ws`
- Production: `wss://your-domain.com/api/graph/ws`

**Protocol:**
- WebSocket upgrade from HTTP/1.1
- Text frames only (JSON messages)
- Ping/pong heartbeat every 30 seconds
- Max message size: 512 bytes (client → server), unlimited (server → client)

**Message Types:**

#### Server → Client

**1. Version Message** (sent on connect)
```json
{
  "type": "version",
  "payload": {
    "version_id": 42,
    "node_count": 1000,
    "link_count": 5000
  }
}
```

**2. Diff Message** (sent on graph update)
```json
{
  "type": "diff",
  "payload": {
    "action": "add|remove|update",
    "nodes": [
      {
        "id": "user_123",
        "name": "username",
        "val": 10,
        "type": "user",
        "x": 1.5,
        "y": 2.5,
        "z": 3.5
      }
    ],
    "links": [
      {
        "source": "user_123",
        "target": "subreddit_456"
      }
    ],
    "version_id": 43
  }
}
```

Actions:
- `add` - New nodes/links added to graph
- `remove` - Nodes/links removed (links to removed nodes are automatically removed)
- `update` - Node properties changed (val, positions, etc.)

**3. Error Message**
```json
{
  "type": "error",
  "payload": {
    "message": "Error description"
  }
}
```

**4. Ping** (heartbeat)
```json
{
  "type": "ping",
  "payload": {}
}
```

#### Client → Server

**Version Update** (tell server your current version)
```json
{
  "type": "version",
  "version_id": 42
}
```

**Behavior:**

1. **Connection Establishment:**
   - Client sends WebSocket upgrade request
   - Server accepts and sends initial version message
   - Server monitors for new graph versions every 5 seconds
   
2. **Update Delivery:**
   - When precalculation completes, server detects new version
   - Server calculates diff since each client's last known version
   - Server broadcasts diff to all connected clients
   - Target latency: < 5 seconds from precalc completion
   
3. **Reconnection:**
   - Client should implement exponential backoff (1s, 2s, 4s, ... up to 60s)
   - Max recommended reconnect attempts: 10
   - After reconnection, client should refetch full graph if version gap is large

4. **Graceful Degradation:**
   - If WebSocket fails, client should fall back to polling `/api/graph/version`
   - Poll interval: 10-30 seconds recommended
   - On version change, fetch diff via `/api/graph/diff?since=N`

**Error Handling:**

- Connection errors: Implement exponential backoff reconnection
- Version gaps: If diff spans >20% of graph, consider full refetch
- Timeout: No activity for 60s triggers automatic disconnect

**Performance:**

- Connections: Lightweight, ~1KB memory per client
- Bandwidth: Only changed data transmitted (typically <10KB per update)
- Latency: Sub-second message delivery on local network
- Scaling: Tested with 100+ concurrent connections

**Nginx Configuration:**

```nginx
location /api/graph/ws {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

**Example Client (TypeScript):**

See `frontend/src/data/GraphWebSocket.ts` for full implementation.

```typescript
import { GraphWebSocket } from './data/GraphWebSocket';

const ws = new GraphWebSocket({
  onDiff: (diff) => {
    // Apply incremental update
    const newData = GraphWebSocket.applyDiff(currentData, diff);
    setGraphData(newData);
  },
  onConnectionChange: (connected) => {
    setLiveStatus(connected);
  },
});

ws.connect();
```

**Security:**

- CORS headers validated by middleware
- No authentication required (read-only public data)
- Rate limiting: Same limits as HTTP endpoints apply
- Origin validation: Configured via `CORS_ALLOWED_ORIGINS`

**Monitoring:**

Prometheus metrics:
- `websocket_connections_active` - Current active connections
- `websocket_messages_sent_total` - Total messages broadcast

