# Community Aggregation API

This document describes the community aggregation endpoints that provide server-side community detection and aggregation for the Reddit Cluster Map.

## Overview

The backend provides two main endpoints for working with communities detected via the Louvain algorithm:

1. `/api/communities` - Returns supernodes representing communities and weighted inter-community links
2. `/api/communities/{id}` - Returns the full subgraph of a specific community

These endpoints complement the client-side community detection already available in `frontend/src/utils/communityDetection.ts`.

## Endpoints

### GET /api/communities

Returns an aggregated view of the graph where each community is represented as a single "supernode" with links showing the connections between communities.

**Query Parameters:**

- `max_nodes` (optional, default: 100) - Maximum number of community supernodes to return
- `max_links` (optional, default: 500) - Maximum number of inter-community links to return
- `with_positions` (optional, default: false) - Include precomputed x,y,z positions for supernodes
  - Values: `true`, `1`, `false`, `0`
  - Positions are averaged from member node positions

**Response Format:**

```json
{
  "nodes": [
    {
      "id": "community_1",
      "name": "Technology Community",
      "val": 150,
      "type": "community",
      "x": 245.3,
      "y": -128.7,
      "z": 0.0
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

**Response Fields:**

- `nodes[].id` - Community identifier (format: `community_<id>`)
- `nodes[].name` - Community label (derived from most connected member)
- `nodes[].val` - Number of members in the community
- `nodes[].type` - Always "community"
- `nodes[].x/y/z` - Optional precomputed positions (when `with_positions=true`)
- `links[].source` - Source community ID
- `links[].target` - Target community ID

**Example Requests:**

```bash
# Get top 50 communities with positions
curl "http://localhost:8080/api/communities?max_nodes=50&with_positions=true"

# Get all communities without positions (faster)
curl "http://localhost:8080/api/communities?max_nodes=1000&with_positions=false"
```

**Caching:**

- Responses are cached for 60 seconds
- Cache key includes max_nodes, max_links, and with_positions flag
- Different parameter combinations are cached separately

**Performance Notes:**

- Default limits are conservative for fast responses
- Increase limits for more complete community views
- Position calculation adds minimal overhead (averaged from members)

---

### GET /api/communities/{id}

Returns the complete subgraph of a specific community, including all member nodes and their internal connections.

**Path Parameters:**

- `id` (required) - The numeric community ID

**Query Parameters:**

- `max_nodes` (optional, default: 10000) - Maximum number of nodes to return
- `max_links` (optional, default: 50000) - Maximum number of links to return
- `with_positions` (optional, default: false) - Include precomputed x,y,z positions

**Response Format:**

```json
{
  "nodes": [
    {
      "id": "user_123",
      "name": "alice",
      "val": 42,
      "type": "user",
      "x": 100.5,
      "y": 200.3,
      "z": 0.0
    },
    {
      "id": "subreddit_456",
      "name": "programming",
      "val": 150000,
      "type": "subreddit"
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

**Response Fields:**

- `nodes[].id` - Node identifier (format varies by type)
- `nodes[].name` - Human-readable name
- `nodes[].val` - Node weight/value (activity count, subscribers, etc.)
- `nodes[].type` - Node type: "user", "subreddit", "post", "comment"
- `nodes[].x/y/z` - Optional precomputed positions
- `links[].source` - Source node ID
- `links[].target` - Target node ID

**Example Requests:**

```bash
# Get full subgraph of community 1
curl "http://localhost:8080/api/communities/1"

# Get subgraph with positions for visualization
curl "http://localhost:8080/api/communities/1?with_positions=true"

# Get first 1000 nodes of large community
curl "http://localhost:8080/api/communities/5?max_nodes=1000&max_links=5000"
```

**Error Responses:**

- `400 Bad Request` - Invalid community ID format
- `404 Not Found` - Community does not exist
- `408 Request Timeout` - Query took too long (increase timeout or reduce limits)
- `500 Internal Server Error` - Database or server error

**Caching:**

- Responses are cached for 60 seconds per community ID
- Cache key includes id, max_nodes, max_links, and with_positions

---

## Community Detection

### Algorithm

The backend uses the **Louvain algorithm** for community detection:

- Optimizes modularity (quality metric for community structure)
- Runs during graph precalculation (hourly by default)
- Caps at 50,000 nodes for performance
- Results stored in database for fast queries

### Database Schema

**graph_communities**
- `id` - Primary key
- `label` - Community name (from top node)
- `size` - Number of members
- `modularity` - Quality score (0-1)
- `created_at`, `updated_at` - Timestamps

**graph_community_members**
- `community_id` - Foreign key to graph_communities
- `node_id` - Foreign key to graph_nodes
- Primary key: (community_id, node_id)

**graph_community_links**
- `source_community_id` - Source community
- `target_community_id` - Target community
- `weight` - Number of edges between communities
- Primary key: (source_community_id, target_community_id)

### When Communities are Updated

Communities are recalculated:
1. During scheduled precalculation (default: hourly)
2. When graph data changes significantly
3. Can be triggered manually via precalculation service

The process:
1. Clear existing community tables
2. Run Louvain algorithm on current graph
3. Store communities, members, and inter-community links
4. Results immediately available via API

---

## Integration with Frontend

### Using with CommunityMap Component

The backend endpoints are designed to work seamlessly with the existing `CommunityMap.tsx` component:

```typescript
// Fetch server-side communities
const response = await fetch('/api/communities?max_nodes=100&with_positions=true');
const data = await response.json();

// Data matches GraphData interface
<CommunityMap communityResult={null} onBack={() => {}} />
```

### Client-Side vs Server-Side Detection

| Aspect | Client-Side | Server-Side |
|--------|-------------|-------------|
| Algorithm | TypeScript Louvain | Go Louvain |
| When | On-demand | Pre-calculated |
| Data Size | Limited by browser | Up to 50k nodes |
| Speed | 1-5 seconds | Instant (cached) |
| Consistency | Per-session | Shared across users |
| Resource Usage | Browser CPU/memory | Server resources |
| Use Case | Interactive exploration | Production view |

**Recommendation:** Use server-side for production, client-side for immediate feedback.

---

## Performance Considerations

### Response Times

Typical response times (with caching):

- `/api/communities` (100 nodes): ~10-50ms
- `/api/communities/{id}` (1000 nodes): ~50-200ms
- First request (cache miss): +100-500ms

### Optimization Tips

1. **Use appropriate limits**
   - Start with defaults and increase if needed
   - Larger limits = slower queries

2. **Position inclusion**
   - Skip positions if not visualizing immediately
   - Positions add ~10-20ms overhead

3. **Caching**
   - Results cached for 60 seconds
   - Same parameters = instant response
   - Clear cache via server restart if needed

4. **Database indexes**
   - All foreign keys are indexed
   - Community size used in ORDER BY (pre-sorted)
   - Link weights indexed for fast filtering

---

## Monitoring

### Metrics

Community endpoints emit Prometheus metrics:

```
api_cache_hits{endpoint="communities"}
api_cache_misses{endpoint="communities"}
api_cache_hits{endpoint="community_subgraph"}
api_cache_misses{endpoint="community_subgraph"}
```

Monitor cache hit rates to tune TTL and limits.

### Logging

Community detection logs:
- `🔍 Starting community detection` - Algorithm starting
- `📊 Building graph structure` - Loading data
- `⏱ Iteration N: improved=true/false` - Progress
- `✅ Community detection complete: N communities, modularity=X` - Results
- `💾 Storing community detection results` - Persisting to DB

---

## Examples

### Example 1: Get Community Overview

```bash
curl -s 'http://localhost:8080/api/communities?max_nodes=10' | jq .
```

```json
{
  "nodes": [
    {
      "id": "community_0",
      "name": "programming",
      "val": 523,
      "type": "community"
    },
    {
      "id": "community_1", 
      "name": "gaming",
      "val": 412,
      "type": "community"
    }
  ],
  "links": [
    {
      "source": "community_0",
      "target": "community_1"
    }
  ]
}
```

### Example 2: Explore Specific Community

```bash
# Get community 0 details
curl -s 'http://localhost:8080/api/communities/0?max_nodes=5' | jq .
```

```json
{
  "nodes": [
    {
      "id": "subreddit_5",
      "name": "programming",
      "val": 150000,
      "type": "subreddit"
    },
    {
      "id": "user_123",
      "name": "alice",
      "val": 42,
      "type": "user"
    }
  ],
  "links": [
    {
      "source": "user_123",
      "target": "subreddit_5"
    }
  ]
}
```

### Example 3: Visualize with Positions

```bash
curl -s 'http://localhost:8080/api/communities?with_positions=true&max_nodes=20' \
  | jq '.nodes[] | {id, name, x, y}'
```

```json
{
  "id": "community_0",
  "name": "programming",
  "x": 245.3,
  "y": -128.7
}
{
  "id": "community_1",
  "name": "gaming", 
  "x": -180.2,
  "y": 95.4
}
```

---

## Troubleshooting

### No Communities Returned

**Possible causes:**
1. Graph precalculation hasn't run yet
2. No data in database
3. Community detection failed

**Solutions:**
- Check logs for precalculation status
- Run precalculation manually: `make precalculate`
- Verify graph_nodes and graph_links have data

### Communities Seem Outdated

**Cause:** Cache or precalculation timing

**Solutions:**
- Wait for next hourly precalculation
- Restart API server to clear cache
- Trigger manual precalculation

### Query Timeouts

**Cause:** Large community or high limits

**Solutions:**
- Reduce max_nodes and max_links parameters
- Check database query performance
- Increase GRAPH_QUERY_TIMEOUT environment variable

### Empty Subgraph

**Possible causes:**
1. Invalid community ID
2. Community has no members
3. All members filtered out

**Solutions:**
- Verify community exists: `GET /api/communities`
- Check community_members table
- Review node type filters

---

## Configuration

### Environment Variables

```bash
# Graph query timeout (default: 30s)
GRAPH_QUERY_TIMEOUT=60s

# Enable detailed graph including posts/comments (default: false)
DETAILED_GRAPH=true

# Precalculation schedule (cron format, default: hourly)
PRECALC_SCHEDULE="0 * * * *"
```

### Feature Flags

Community detection can be disabled by skipping precalculation:

```bash
# Disable precalculation service
docker-compose stop precalculate
```

API endpoints will still work with existing data.

---

## Related Documentation

- [Graph Precalculation](../backend/internal/graph/service.go) - How communities are detected
- [Community Detection (Frontend)](../frontend/src/utils/communityDetection.ts) - Client-side algorithm
- [Database Schema - Communities Migration](../backend/migrations/000019_graph_communities.up.sql) - Community tables schema
- [Database Schema - Full](../backend/migrations/schema.sql) - Complete database schema
- [API Routes](../backend/internal/api/routes.go) - All API endpoints
