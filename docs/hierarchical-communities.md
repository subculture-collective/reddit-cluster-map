# Hierarchical Multi-Level Louvain Clustering

## Overview

This implementation extends the existing single-pass Louvain community detection to produce a hierarchical cluster tree with 3-4 levels, enabling multi-resolution graph views.

## Architecture

### Database Schema

The `graph_community_hierarchy` table stores the hierarchical structure:

```sql
CREATE TABLE graph_community_hierarchy (
    node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level >= 0),
    community_id INTEGER NOT NULL,
    parent_community_id INTEGER,
    centroid_x DOUBLE PRECISION,
    centroid_y DOUBLE PRECISION,
    centroid_z DOUBLE PRECISION,
    PRIMARY KEY (node_id, level)
);
```

### Hierarchy Levels

- **Level 0**: Individual nodes (each node is its own community)
- **Level 1**: Fine-grained communities (50-500 nodes each, depending on graph structure)
- **Level 2**: Medium communities (merged from level 1)
- **Level 3**: Macro communities (5-20 clusters, adaptive)

The algorithm adaptively stops when:
- Meta-graph becomes too small (< 3 communities)
- Communities don't effectively cluster (all nodes in 1 community or each in their own)
- Maximum level (4) is reached

### Algorithm

1. **Initial Pass**: Run Louvain on original graph to create Level 1
2. **Meta-Graph Construction**: Create a meta-graph where:
   - Each community from the previous level becomes a node
   - Links between meta-nodes represent aggregated connections between communities
3. **Iterative Application**: Repeat Louvain on meta-graph for Level 2, 3, etc.
4. **Centroid Calculation**: Compute average position of nodes in each community for visualization
5. **Storage**: Store hierarchy with parent references and centroids in database

### Code Structure

- `communities.go`:
  - `detectHierarchicalCommunities()` - Main hierarchical detection
  - `runSinglePassLouvain()` - Single pass of Louvain algorithm
  - `calculateCentroidsForLevel()` - Compute community centroids
  - `storeHierarchy()` - Persist hierarchy to database

- SQL Queries (`queries/graph.sql`):
  - `ClearCommunityHierarchy` - Clear existing hierarchy
  - `InsertCommunityHierarchy` - Insert hierarchy entry
  - `GetCommunityHierarchy` - Retrieve full hierarchy
  - `GetNodesAtLevel` - Get nodes at specific level
  - `GetHierarchyLevels` - List available levels
  - `GetCommunitiesAtLevel` - Get community statistics per level

## API Usage

### Query Hierarchy

```go
// Get all hierarchy data
hierarchy, err := queries.GetCommunityHierarchy(ctx)

// Get nodes at a specific level
nodesAtLevel, err := queries.GetNodesAtLevel(ctx, level)

// Get available levels
levels, err := queries.GetHierarchyLevels(ctx)

// Get community statistics at level
communities, err := queries.GetCommunitiesAtLevel(ctx, level)
```

### Integration with Precalculation

The hierarchical detection runs automatically during graph precalculation (`PrecalculateGraphData`):

1. Graph nodes and links are computed
2. Hierarchical community detection runs on the full graph
3. Hierarchy is stored in the database
4. Flat community detection still runs for backward compatibility

## Performance

### Characteristics

- **Time Complexity**: O(n log n) per level for sparse graphs
- **Space Complexity**: O(n + m) where n = nodes, m = edges
- **Typical Runtime**: 
  - 1,000 nodes: < 1 second
  - 10,000 nodes: < 10 seconds
  - 100,000 nodes: < 2 minutes (target < 5 minutes)

### Optimization Techniques

1. **Adaptive Stopping**: Stops when clustering becomes ineffective
2. **Meta-Graph Reduction**: Each level reduces graph size significantly
3. **Limited Iterations**: Maximum 50 iterations per Louvain pass
4. **Individual Inserts**: Hierarchy storage performs one insert per node per level (future optimization may add true batching via transactions or COPY)

## Testing

### Unit Tests

- `TestHierarchicalCommunityDetection` - Basic hierarchy generation
- `TestHierarchyValidation` - Validates hierarchy properties (all nodes present, valid parents)
- `TestRunSinglePassLouvain` - Single-pass Louvain correctness
- `TestCalculateCentroidsForLevel` - Centroid calculation accuracy

### Integration Tests

- `TestIntegration_HierarchicalCommunityDetection` - Full workflow with real database
  - Creates 20 test nodes in 3 clusters
  - Verifies hierarchy generation and storage
  - Validates database queries

## Future Enhancements

1. **Parallel Processing**: Parallelize Louvain optimization phase
2. **Incremental Updates**: Support incremental hierarchy updates
3. **Quality Metrics**: Track modularity improvements across levels
4. **Visualization API**: Endpoints for level-based graph rendering
5. **Community Merging**: Smart merging strategies for macro levels

## Migration

The migration `000024_community_hierarchy.up.sql` adds the new table. To apply:

```bash
make migrate-up
```

To rollback:

```bash
make migrate-down
```

## Backward Compatibility

- Existing flat community detection (`graph_communities`) still runs
- Frontend can continue using existing community APIs
- New hierarchy APIs are additive, not breaking
