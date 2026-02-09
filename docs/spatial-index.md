# Spatial R-tree Index for Graph Nodes

This document describes the spatial indexing implementation for efficiently querying graph nodes by their 3D position coordinates.

## Overview

The spatial R-tree index enables fast bounding box queries on the `graph_nodes` table, which is essential for viewport-based rendering and spatial queries in the Reddit Cluster Map visualization.

## Implementation Details

### Database Extension
- **Extension**: `btree_gist` (included in standard PostgreSQL, no PostGIS required)
- **Migration**: `000025_spatial_index.up.sql`

### Indexes Created

Two GiST (Generalized Search Tree) indexes are created:

1. **`idx_graph_nodes_spatial`** - Full index on all nodes
   ```sql
   CREATE INDEX idx_graph_nodes_spatial ON graph_nodes 
   USING gist (pos_x, pos_y, pos_z);
   ```

2. **`idx_graph_nodes_spatial_nonnull`** - Partial index (optimized)
   ```sql
   CREATE INDEX idx_graph_nodes_spatial_nonnull ON graph_nodes 
   USING gist (pos_x, pos_y, pos_z)
   WHERE pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL;
   ```

The partial index is more efficient as it only indexes nodes that have position data.

### Queries Available

Four new sqlc queries are available in `backend/internal/queries/graph.sql`:

#### 1. GetNodesInBoundingBox (3D)
Retrieves nodes within a 3D bounding box:
```go
params := db.GetNodesInBoundingBoxParams{
    PosX:   sql.NullFloat64{Float64: x_min, Valid: true},
    PosX_2: sql.NullFloat64{Float64: x_max, Valid: true},
    PosY:   sql.NullFloat64{Float64: y_min, Valid: true},
    PosY_2: sql.NullFloat64{Float64: y_max, Valid: true},
    PosZ:   sql.NullFloat64{Float64: z_min, Valid: true},
    PosZ_2: sql.NullFloat64{Float64: z_max, Valid: true},
    Limit:  10000,
}
nodes, err := queries.GetNodesInBoundingBox(ctx, params)
```

#### 2. GetNodesInBoundingBox2D
Retrieves nodes within a 2D bounding box (ignoring Z coordinate):
```go
params := db.GetNodesInBoundingBox2DParams{
    PosX:   sql.NullFloat64{Float64: x_min, Valid: true},
    PosX_2: sql.NullFloat64{Float64: x_max, Valid: true},
    PosY:   sql.NullFloat64{Float64: y_min, Valid: true},
    PosY_2: sql.NullFloat64{Float64: y_max, Valid: true},
    Limit:  10000,
}
nodes, err := queries.GetNodesInBoundingBox2D(ctx, params)
```

#### 3. GetLinksForNodesInBoundingBox
Retrieves graph links where both source and target nodes are within the bounding box:
```go
params := db.GetLinksForNodesInBoundingBoxParams{
    PosX:   sql.NullFloat64{Float64: x_min, Valid: true},
    PosX_2: sql.NullFloat64{Float64: x_max, Valid: true},
    PosY:   sql.NullFloat64{Float64: y_min, Valid: true},
    PosY_2: sql.NullFloat64{Float64: y_max, Valid: true},
    PosZ:   sql.NullFloat64{Float64: z_min, Valid: true},
    PosZ_2: sql.NullFloat64{Float64: z_max, Valid: true},
    Limit:  50000,
}
links, err := queries.GetLinksForNodesInBoundingBox(ctx, params)
```

#### 4. CountNodesInBoundingBox
Counts nodes within a bounding box (useful for pagination):
```go
params := db.CountNodesInBoundingBoxParams{
    PosX:   sql.NullFloat64{Float64: x_min, Valid: true},
    PosX_2: sql.NullFloat64{Float64: x_max, Valid: true},
    PosY:   sql.NullFloat64{Float64: y_min, Valid: true},
    PosY_2: sql.NullFloat64{Float64: y_max, Valid: true},
    PosZ:   sql.NullFloat64{Float64: z_min, Valid: true},
    PosZ_2: sql.NullFloat64{Float64: z_max, Valid: true},
}
count, err := queries.CountNodesInBoundingBox(ctx, params)
```

## Performance Characteristics

### Benchmarks (on 100k node dataset)

| Metric | Value | Requirement | Status |
|--------|-------|-------------|--------|
| Query Time | ~14ms | <50ms | ✅ PASS |
| Index Size | 10MB | <100MB | ✅ PASS |

**Test Setup:**
- 100,000 nodes with random positions in 1000x1000x20 space
- Bounding box query covering ~4% of nodes (200x200x20 area)
- Hardware: Intel Xeon Platinum 8370C @ 2.80GHz

**EXPLAIN ANALYZE Output:**
```
Bitmap Index Scan on idx_graph_nodes_spatial_nonnull
  Index Cond: ((pos_x >= ...) AND (pos_x <= ...) AND ...)
  Execution Time: 4.077 ms
```

The spatial index is being used efficiently via Bitmap Index Scan.

### Scaling Characteristics

The GiST R-tree index provides:
- **O(log n)** lookup time for bounding box queries
- **Graceful degradation** as dataset size increases
- **Efficient range queries** on multi-dimensional data

Expected performance for larger datasets:
- 10k nodes: <5ms
- 50k nodes: <10ms
- 100k nodes: ~14ms
- 500k nodes: <30ms (estimated)
- 1M nodes: <50ms (estimated)

## Testing

### Integration Tests
Run the spatial query integration tests:
```bash
export TEST_DATABASE_URL="postgres://postgres:password@localhost:5432/reddit_cluster?sslmode=disable"
make test-integration
```

Tests verify:
- Bounding box queries return correct nodes
- Nodes are within specified bounds
- Links are correctly filtered
- Count queries match actual results
- Spatial index exists and is configured correctly

### Benchmarks
Run performance benchmarks:
```bash
export TEST_DATABASE_URL="postgres://postgres:password@localhost:5432/reddit_cluster?sslmode=disable"
cd backend
go test ./internal/graph -bench=BenchmarkSpatialQuery -benchtime=10x -run=^$
```

Available benchmarks:
- `BenchmarkSpatialQuery_10k` - 10,000 nodes
- `BenchmarkSpatialQuery_50k` - 50,000 nodes
- `BenchmarkSpatialQuery_100k` - 100,000 nodes

## Use Cases

### 1. Viewport-Based Graph Rendering
Query only the nodes visible in the current camera viewport:
```go
// Camera viewport bounds
viewport := CameraViewport{
    MinX: -100, MaxX: 100,
    MinY: -50, MaxY: 50,
    MinZ: -10, MaxZ: 10,
}

// Fetch visible nodes
nodes, err := q.GetNodesInBoundingBox(ctx, db.GetNodesInBoundingBoxParams{
    PosX:   sql.NullFloat64{Float64: viewport.MinX, Valid: true},
    PosX_2: sql.NullFloat64{Float64: viewport.MaxX, Valid: true},
    PosY:   sql.NullFloat64{Float64: viewport.MinY, Valid: true},
    PosY_2: sql.NullFloat64{Float64: viewport.MaxY, Valid: true},
    PosZ:   sql.NullFloat64{Float64: viewport.MinZ, Valid: true},
    PosZ_2: sql.NullFloat64{Float64: viewport.MaxZ, Valid: true},
    Limit:  20000,
})
```

### 2. Spatial Clustering / LOD
Query nodes at different spatial resolutions:
```go
// High detail (small area)
detailedNodes, _ := q.GetNodesInBoundingBox2D(ctx, db.GetNodesInBoundingBox2DParams{
    PosX:   sql.NullFloat64{Float64: 0, Valid: true},
    PosX_2: sql.NullFloat64{Float64: 50, Valid: true},
    PosY:   sql.NullFloat64{Float64: 0, Valid: true},
    PosY_2: sql.NullFloat64{Float64: 50, Valid: true},
    Limit:  10000,
})

// Low detail (large area)
overviewNodes, _ := q.GetNodesInBoundingBox2D(ctx, db.GetNodesInBoundingBox2DParams{
    PosX:   sql.NullFloat64{Float64: -500, Valid: true},
    PosX_2: sql.NullFloat64{Float64: 500, Valid: true},
    PosY:   sql.NullFloat64{Float64: -500, Valid: true},
    PosY_2: sql.NullFloat64{Float64: 500, Valid: true},
    Limit:  1000,
})
```

### 3. Spatial Search / "Near Me"
Find nodes near a specific point:
```go
centerX, centerY := 100.0, 50.0
radius := 25.0

nodes, err := q.GetNodesInBoundingBox2D(ctx, db.GetNodesInBoundingBox2DParams{
    PosX:   sql.NullFloat64{Float64: centerX - radius, Valid: true},
    PosX_2: sql.NullFloat64{Float64: centerX + radius, Valid: true},
    PosY:   sql.NullFloat64{Float64: centerY - radius, Valid: true},
    PosY_2: sql.NullFloat64{Float64: centerY + radius, Valid: true},
    Limit:  100,
})
```

## Migration

### Running the Migration
The spatial index migration is automatically applied with:
```bash
make migrate-up
```

Or manually:
```bash
migrate -path backend/migrations -database "$DATABASE_URL" up
```

### Rollback
To remove the spatial indexes:
```bash
migrate -path backend/migrations -database "$DATABASE_URL" down 1
```

This will drop both spatial indexes (the btree_gist extension is left in place for safety).

## Future Enhancements

Potential improvements for v2.0+:

1. **API Endpoint**: Add `/api/graph/viewport` endpoint accepting bounding box parameters
2. **Streaming**: Combine with NDJSON streaming for progressive loading
3. **Caching**: Cache common viewport queries in Redis
4. **Multi-Resolution**: Precompute graphs at multiple zoom levels
5. **Spatial Joins**: Join with communities table for spatial-aware community queries

## References

- PostgreSQL GiST Indexes: https://www.postgresql.org/docs/current/gist.html
- btree_gist Extension: https://www.postgresql.org/docs/current/btree-gist.html
- sqlc Documentation: https://docs.sqlc.dev/
- Issue #169: Build spatial R-tree index for node positions
- Epic #141: Graph Data Pipeline (E3)
- Roadmap #138: MVP to Professional Grade v2.0
