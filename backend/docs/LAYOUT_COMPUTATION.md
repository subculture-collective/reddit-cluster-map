# Layout Computation: Robust and Incremental Improvements

## Overview

The graph layout computation system has been enhanced to be more robust, efficient, and configurable. It now handles missing database columns gracefully and supports batched updates with epsilon filtering.

## Key Features

### 1. Feature Detection
- **Automatic Detection**: On startup, the system detects whether `pos_x`, `pos_y`, and `pos_z` columns exist in the `graph_nodes` table
- **Graceful Degradation**: If columns are missing, layout computation is skipped with a clear log message instead of failing
- **Clear Logging**: Capability flags are logged at startup for transparency

### 2. Batched Updates
- **Chunked Processing**: Position updates are processed in configurable batches (default: 5000 nodes per batch)
- **Reduced Lock Contention**: Smaller batches reduce database lock duration and improve concurrency
- **Memory Efficient**: Large graphs are processed incrementally without excessive memory usage

### 3. Epsilon Filtering
- **Smart Updates**: Only nodes that moved significantly (beyond epsilon threshold) are updated
- **Reduced Write Load**: Skips updates for nodes with negligible position changes
- **Configurable Threshold**: Set via `LAYOUT_EPSILON` environment variable

### 4. Enhanced Metrics and Logging
- **Detailed Timing**: Separate metrics for layout computation and position updates
- **Update Count**: Reports how many nodes were actually updated
- **Configuration Display**: All layout parameters are logged at startup

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LAYOUT_MAX_NODES` | 5000 | Maximum number of nodes to include in layout computation |
| `LAYOUT_ITERATIONS` | 400 | Number of force-directed layout iterations |
| `LAYOUT_BATCH_SIZE` | 5000 | Number of nodes to update in each database batch |
| `LAYOUT_EPSILON` | 0.0 | Distance threshold for filtering updates (0 = update all) |

## Usage Examples

### Default Configuration
```bash
# Run precalculation with default settings
docker compose run --rm precalculate /app/precalculate
```

### Custom Configuration
```bash
# Larger graph with more iterations
docker compose run --rm \
  -e LAYOUT_MAX_NODES=10000 \
  -e LAYOUT_ITERATIONS=600 \
  -e LAYOUT_BATCH_SIZE=2000 \
  precalculate /app/precalculate
```

### With Epsilon Filtering
```bash
# Only update positions that changed by more than 5 units
docker compose run --rm \
  -e LAYOUT_EPSILON=5.0 \
  precalculate /app/precalculate
```

### Disable Layout Computation
```bash
# Skip layout computation entirely
docker compose run --rm \
  -e LAYOUT_MAX_NODES=0 \
  precalculate /app/precalculate
```

## Log Output Examples

### With Position Columns Present
```
✅ position columns detected: layout computation enabled
⚙️ layout configuration: max_nodes=5000, iterations=400, batch_size=5000, epsilon=0.00
📊 computing layout for 5000 nodes with 400 iterations
🔗 found 12345 links among selected nodes
🌐 initialized layout: 5000 nodes, 12345 edges, radius=316.2
⏱️ layout computation completed in 2.3s
🗺️ layout complete: 5000/5000 positions updated in 150ms (total: 2.45s)
```

### With Position Columns Missing
```
ℹ️ layout computation skipped: position columns (pos_x/pos_y/pos_z) not present in graph_nodes table (run migrations to enable)
```

### With Epsilon Filtering
```
⚙️ layout configuration: max_nodes=5000, iterations=400, batch_size=5000, epsilon=5.00
📊 computing layout for 5000 nodes with 400 iterations
⏱️ layout computation completed in 2.3s
🗺️ layout complete: 1247/5000 positions updated in 80ms (total: 2.38s)
```

## Database Schema Requirements

The position columns are optional and added by migration `000016_graph_nodes_positions.up.sql`:

```sql
ALTER TABLE graph_nodes
    ADD COLUMN IF NOT EXISTS pos_x DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pos_y DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pos_z DOUBLE PRECISION;
```

To enable layout computation:
1. Run migrations: `make migrate-up` or `make migrate-up-local`
2. Verify columns exist: Check logs during next precalculation run

## Testing

### Unit Tests
```bash
# Run all graph tests
go test ./internal/graph/...

# Run specific test
go test ./internal/graph/... -run TestCheckPositionColumnsExist
```

### Integration Tests
```bash
# Requires TEST_DATABASE_URL to be set
export TEST_DATABASE_URL="postgres://user:pass@localhost:5432/reddit_cluster_test?sslmode=disable"
go test ./internal/graph/... -run Integration
```

## Performance Considerations

### Batch Size Selection
- **Small batches (1000-2000)**: Better for high-concurrency environments, less lock contention
- **Medium batches (5000-10000)**: Good balance for most use cases
- **Large batches (>10000)**: Better throughput but increased lock duration

### Epsilon Threshold
- **epsilon=0.0**: Update all positions (most accurate, highest write load)
- **epsilon=1.0-5.0**: Balance accuracy and write reduction
- **epsilon>10.0**: Minimal updates, may skip significant layout improvements

### Iteration Count
- **iterations<200**: Fast but may not converge to stable layout
- **iterations=400**: Good balance (default)
- **iterations>600**: Better convergence but slower computation
