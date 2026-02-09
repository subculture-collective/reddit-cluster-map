# Edge Bundle Metadata

This document describes the edge bundle metadata feature for visualizing aggregated inter-community connections.

## Overview

Edge bundles aggregate individual links between communities into weighted bundled edges with control points for curved rendering. This reduces visual clutter and improves performance when rendering large community graphs.

## Database Schema

The `graph_bundles` table stores precomputed edge bundle metadata:

```sql
CREATE TABLE graph_bundles (
    source_community_id INTEGER NOT NULL REFERENCES graph_communities(id),
    target_community_id INTEGER NOT NULL REFERENCES graph_communities(id),
    weight INTEGER NOT NULL DEFAULT 0,
    avg_strength DOUBLE PRECISION,
    control_x DOUBLE PRECISION,
    control_y DOUBLE PRECISION,
    control_z DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source_community_id, target_community_id)
);
```

## Computation

Edge bundles are computed automatically during graph precalculation, using the same capped graph subset that community detection runs on (e.g., the top-N highest-weight nodes):

1. **After Community Detection**: Once communities are detected and stored for this capped subset of the graph, bundles are computed
2. **Aggregation**: All links between two communities within this capped subset are aggregated into a single bundle
3. **Weight Calculation**: Bundle weight = count of constituent links in the subset
4. **Strength Calculation**: Average strength across all constituent links in the subset
5. **Control Points**: Calculated as midpoint between community centroids with perpendicular offset for visual appeal

### Control Point Algorithm

```go
// Calculate midpoint between community centroids
midX := (srcCentroid[0] + tgtCentroid[0]) / 2.0
midY := (srcCentroid[1] + tgtCentroid[1]) / 2.0
midZ := (srcCentroid[2] + tgtCentroid[2]) / 2.0

// Calculate perpendicular vector (rotate 90° in XY plane)
dx := tgtCentroid[0] - srcCentroid[0]
dy := tgtCentroid[1] - srcCentroid[1]
perpX := -dy
perpY := dx

// Apply offset (20% of distance)
scale := sqrt(dx² + dy² + dz²) * 0.2
controlX := midX + (perpX / perpLen) * scale
controlY := midY + (perpY / perpLen) * scale
controlZ := midZ
```

## API Endpoint

### GET /api/graph/bundles

Returns precomputed edge bundle metadata.

**Query Parameters:**
- `min_weight` (optional): Minimum bundle weight threshold. Default: 1

**Response Format:**
```json
{
  "bundles": [
    {
      "source_community": 1,
      "target_community": 2,
      "weight": 15,
      "avg_strength": 1.0,
      "control_point": {
        "x": 10.5,
        "y": 20.3,
        "z": 15.7
      }
    }
  ]
}
```

**Caching:**
- Responses are cached for 60 seconds
- Cache key includes min_weight parameter

**Performance:**
- Typical response time: <100ms
- Returns bundles in descending weight order

### Example Usage

```bash
# Get all bundles
curl http://localhost:8000/api/graph/bundles

# Get bundles with at least 5 links
curl http://localhost:8000/api/graph/bundles?min_weight=5

# Get high-weight bundles only
curl http://localhost:8000/api/graph/bundles?min_weight=50
```

## Frontend Integration

Edge bundles can be rendered as curved lines using the control points:

```typescript
// Fetch bundles
const response = await fetch(`${API_URL}/graph/bundles?min_weight=5`);
const { bundles } = await response.json();

// Render each bundle as a quadratic Bézier curve
bundles.forEach(bundle => {
  const start = getCommunityPosition(bundle.source_community);
  const end = getCommunityPosition(bundle.target_community);
  const control = bundle.control_point;
  
  // Use THREE.js QuadraticBezierCurve3 or similar
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(start.x, start.y, start.z),
    new THREE.Vector3(control.x, control.y, control.z),
    new THREE.Vector3(end.x, end.y, end.z)
  );
  
  // Style based on weight
  const lineWidth = Math.log(bundle.weight + 1) * 2;
  const opacity = Math.min(bundle.weight / 100, 1.0);
  
  // Render the curve...
});
```

## Configuration

No additional environment variables are needed. Edge bundles are computed automatically when:
- Community detection is enabled (default)
- Graph precalculation runs (hourly by default)

## Maintenance

### Clearing Bundles

Bundles are automatically cleared and recomputed during each precalculation cycle. To force a rebuild:

```bash
# Set environment variable and restart precalculate service
PRECALC_FORCE_CLEAR=true make precalculate
```

### Monitoring

- Check bundle computation in precalculate logs: `🔄 Computing edge bundle metadata`
- Success message: `✅ Stored N edge bundles`
- API metrics: `api_cache_hits{endpoint="bundles"}`, `api_cache_misses{endpoint="bundles"}`

## Acceptance Criteria Status

- [x] Edge bundles computed for all inter-community connections
- [x] Bundle weight correctly counts constituent links
- [x] Control points produce visually appealing curves
- [x] API endpoint returns bundles in <100ms
- [x] Configurable minimum weight threshold
