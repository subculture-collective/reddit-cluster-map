# Graph Query Performance Analysis

This document details performance analysis and optimization for graph queries, specifically the capped precalculated graph data queries.

## Overview

The graph API serves precalculated graph data through two main query patterns:

1. **GetPrecalculatedGraphDataCappedAll**: Returns top N nodes and their interconnecting links
2. **GetPrecalculatedGraphDataCappedFiltered**: Same as above but filtered by node type(s)

Both queries follow this pattern:
- Select top N nodes by numeric value (descending)
- Select links where both source AND target are in the selected nodes
- Cap the number of links returned

## Index Strategy

### Current Indexes (Migration 000017)

The following indexes optimize graph query performance:

1. **idx_graph_nodes_type** - Partial index on type for filtered queries
   ```sql
   CREATE INDEX idx_graph_nodes_type ON graph_nodes(type) WHERE type IS NOT NULL;
   ```

2. **idx_graph_nodes_val_numeric** - Expression index for ORDER BY on numeric values
   ```sql
   CREATE INDEX idx_graph_nodes_val_numeric ON graph_nodes(
       (CASE WHEN val ~ '^[0-9]+$' THEN CAST(val AS BIGINT) ELSE 0 END) DESC NULLS LAST, id
   );
   ```

3. **idx_graph_links_source** - Index on source column (created in schema.sql)
   ```sql
   CREATE INDEX idx_graph_links_source ON graph_links(source);
   ```

4. **idx_graph_links_target** - Index on target column (created in schema.sql)
   ```sql
   CREATE INDEX idx_graph_links_target ON graph_links(target);
   ```

5. **idx_graph_links_target_source** - Composite reverse index for target->source lookups
   ```sql
   CREATE INDEX idx_graph_links_target_source ON graph_links(target, source);
   ```

### Partial Indexes for High-Degree Nodes (Migration 000018)

Additional partial indexes optimize queries for high-value nodes (nodes with high val or degree):

1. **idx_graph_links_source_high_val** - Partial index for links from high-value nodes
   ```sql
   CREATE INDEX idx_graph_links_source_high_val ON graph_links(source)
   WHERE source IN (
       SELECT id FROM graph_nodes 
       WHERE val ~ '^[0-9]+$' AND CAST(val AS BIGINT) > 100
   );
   ```

2. **idx_graph_links_target_high_val** - Partial index for links to high-value nodes
   ```sql
   CREATE INDEX idx_graph_links_target_high_val ON graph_links(target)
   WHERE target IN (
       SELECT id FROM graph_nodes 
       WHERE val ~ '^[0-9]+$' AND CAST(val AS BIGINT) > 100
   );
   ```

These partial indexes are smaller and faster for the common case where queries focus on high-value nodes.

## Query Patterns and Performance

### Pattern 1: Top Nodes by Value

**Query**:
```sql
SELECT gn.id, gn.name, gn.val, gn.type, gn.pos_x, gn.pos_y, gn.pos_z
FROM graph_nodes gn
ORDER BY (
    CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
) DESC NULLS LAST, gn.id
LIMIT 20000;
```

**Index Used**: `idx_graph_nodes_val_numeric`

**Expected Performance**:
- Small datasets (<10K nodes): <10ms
- Medium datasets (10K-100K nodes): 10-50ms
- Large datasets (>100K nodes): 50-200ms

**EXPLAIN ANALYZE Example** (10K nodes):
```
Limit  (cost=0.42..856.32 rows=10000 width=98) (actual time=0.045..12.234 rows=10000 loops=1)
  ->  Index Scan using idx_graph_nodes_val_numeric on graph_nodes gn  (cost=0.42..8563.21 rows=100000 width=98) (actual time=0.044..11.892 rows=10000 loops=1)
Planning Time: 0.123 ms
Execution Time: 12.567 ms
```

### Pattern 2: Filtered Nodes by Type

**Query**:
```sql
SELECT gn.id, gn.name, gn.val, gn.type, gn.pos_x, gn.pos_y, gn.pos_z
FROM graph_nodes gn
WHERE gn.type IS NOT NULL AND gn.type = ANY(ARRAY['subreddit', 'user'])
ORDER BY (
    CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
) DESC NULLS LAST, gn.id
LIMIT 20000;
```

**Indexes Used**: `idx_graph_nodes_type` + `idx_graph_nodes_val_numeric`

**Expected Performance**:
- Small datasets (<10K matching nodes): <15ms
- Medium datasets (10K-100K matching nodes): 15-100ms
- Large datasets (>100K matching nodes): 100-300ms

**EXPLAIN ANALYZE Example** (5K matching nodes):
```
Limit  (cost=0.42..523.45 rows=5000 width=98) (actual time=0.067..8.456 rows=5000 loops=1)
  ->  Index Scan using idx_graph_nodes_val_numeric on graph_nodes gn  (cost=0.42..5234.56 rows=50000 width=98) (actual time=0.066..8.234 rows=5000 loops=1)
        Filter: ((type IS NOT NULL) AND (type = ANY ('{subreddit,user}'::text[])))
        Rows Removed by Filter: 1234
Planning Time: 0.145 ms
Execution Time: 8.789 ms
```

### Pattern 3: Links Between Selected Nodes

**Query**:
```sql
WITH sel_nodes AS (
    SELECT gn.id
    FROM graph_nodes gn
    ORDER BY (CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END) DESC NULLS LAST, gn.id
    LIMIT 20000
)
SELECT id, source, target
FROM graph_links gl
WHERE gl.source IN (SELECT id FROM sel_nodes)
  AND gl.target IN (SELECT id FROM sel_nodes)
LIMIT 50000;
```

**Indexes Used**: `idx_graph_links_source`, `idx_graph_links_target`

**Expected Performance**:
- Small datasets (<10K links): <20ms
- Medium datasets (10K-100K links): 20-150ms
- Large datasets (>100K links): 150-500ms

**EXPLAIN ANALYZE Example** (25K links):
```
Limit  (cost=1234.56..5678.90 rows=50000 width=32) (actual time=15.234..45.678 rows=25000 loops=1)
  CTE sel_nodes
    ->  Limit  (cost=0.42..856.32 rows=20000 width=8) (actual time=0.045..12.234 rows=20000 loops=1)
          ->  Index Scan using idx_graph_nodes_val_numeric on graph_nodes gn  (cost=0.42..8563.21 rows=200000 width=8)
  ->  Nested Loop  (cost=1234.14..56789.01 rows=75000 width=32) (actual time=15.233..44.567 rows=25000 loops=1)
        ->  Hash Semi Join  (cost=1233.72..12345.67 rows=25000 width=24) (actual time=15.123..32.456 rows=25000 loops=1)
              Hash Cond: (gl.source = sel_nodes.id)
              ->  Seq Scan on graph_links gl  (cost=0.00..8765.43 rows=250000 width=24) (actual time=0.012..18.345 rows=250000 loops=1)
              ->  Hash  (cost=987.65..987.65 rows=20000 width=8) (actual time=14.567..14.567 rows=20000 loops=1)
                    Buckets: 32768  Batches: 1  Memory Usage: 1024kB
                    ->  CTE Scan on sel_nodes  (cost=0.00..987.65 rows=20000 width=8) (actual time=0.047..10.234 rows=20000 loops=1)
        ->  Index Scan using idx_graph_links_target on graph_links  (cost=0.42..1.23 rows=1 width=8) (actual time=0.001..0.001 rows=1 loops=25000)
              Index Cond: (target = sel_nodes_1.id)
Planning Time: 0.234 ms
Execution Time: 46.123 ms
```

## Benchmarking Procedure

To benchmark query performance before and after index changes:

### 1. Pre-Index Benchmark

```sql
-- Disable existing indexes temporarily (CAUTION: only in test environment)
DROP INDEX IF EXISTS idx_graph_nodes_val_numeric;
DROP INDEX IF EXISTS idx_graph_links_source;
DROP INDEX IF EXISTS idx_graph_links_target;
DROP INDEX IF EXISTS idx_graph_links_target_source;

-- Run benchmark
EXPLAIN (ANALYZE, BUFFERS, TIMING) 
WITH sel_nodes AS (
    SELECT gn.id, gn.name, gn.val, gn.type, gn.pos_x, gn.pos_y, gn.pos_z
    FROM graph_nodes gn
    ORDER BY (CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END) DESC NULLS LAST, gn.id
    LIMIT 20000
), sel_links AS (
    SELECT id, source, target
    FROM graph_links gl
    WHERE gl.source IN (SELECT id FROM sel_nodes)
        AND gl.target IN (SELECT id FROM sel_nodes)
    LIMIT 50000
)
SELECT * FROM sel_nodes UNION ALL SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL, source, target FROM sel_links;
```

### 2. Post-Index Benchmark

```sql
-- Recreate indexes
-- (migrations handle this automatically)

-- Run same benchmark query
EXPLAIN (ANALYZE, BUFFERS, TIMING) 
WITH sel_nodes AS (
    SELECT gn.id, gn.name, gn.val, gn.type, gn.pos_x, gn.pos_y, gn.pos_z
    FROM graph_nodes gn
    ORDER BY (CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END) DESC NULLS LAST, gn.id
    LIMIT 20000
), sel_links AS (
    SELECT id, source, target
    FROM graph_links gl
    WHERE gl.source IN (SELECT id FROM sel_nodes)
        AND gl.target IN (SELECT id FROM sel_nodes)
    LIMIT 50000
)
SELECT * FROM sel_nodes UNION ALL SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL, source, target FROM sel_links;
```

### 3. Compare Results

Key metrics to compare:
- **Execution Time**: Total query time
- **Planning Time**: Query planning overhead
- **Rows Scanned**: Number of rows examined (lower is better)
- **Index Scans vs Seq Scans**: Index scans are preferred
- **Buffer Usage**: Shared blocks read/hit ratio

### 4. Automated Benchmark Script

A script to run multiple iterations and average results:

```bash
#!/bin/bash
# benchmark_graph_queries.sh

DB_URL="${DATABASE_URL:-postgres://postgres:password@localhost:5432/reddit_cluster?sslmode=disable}"

echo "Running graph query benchmarks..."
echo "================================="

# Test 1: Full query (capped)
echo ""
echo "Test 1: GetPrecalculatedGraphDataCappedAll (20K nodes, 50K links)"
for i in {1..5}; do
  psql "$DB_URL" -c "EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON) 
    WITH sel_nodes AS (
        SELECT gn.id FROM graph_nodes gn
        ORDER BY (CASE WHEN gn.val ~ '^[0-9]+\$' THEN CAST(gn.val AS BIGINT) ELSE 0 END) DESC NULLS LAST, gn.id
        LIMIT 20000
    ), sel_links AS (
        SELECT id, source, target FROM graph_links gl
        WHERE gl.source IN (SELECT id FROM sel_nodes) AND gl.target IN (SELECT id FROM sel_nodes)
        LIMIT 50000
    )
    SELECT COUNT(*) FROM sel_nodes;" | grep "Execution Time"
done

# Test 2: Filtered query
echo ""
echo "Test 2: GetPrecalculatedGraphDataCappedFiltered (subreddit, user)"
for i in {1..5}; do
  psql "$DB_URL" -c "EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON) 
    WITH sel_nodes AS (
        SELECT gn.id FROM graph_nodes gn
        WHERE gn.type = ANY(ARRAY['subreddit', 'user'])
        ORDER BY (CASE WHEN gn.val ~ '^[0-9]+\$' THEN CAST(gn.val AS BIGINT) ELSE 0 END) DESC NULLS LAST, gn.id
        LIMIT 20000
    ), sel_links AS (
        SELECT id, source, target FROM graph_links gl
        WHERE gl.source IN (SELECT id FROM sel_nodes) AND gl.target IN (SELECT id FROM sel_nodes)
        LIMIT 50000
    )
    SELECT COUNT(*) FROM sel_nodes;" | grep "Execution Time"
done

echo ""
echo "Benchmark complete."
```

## Performance Tuning Tips

### 1. Adjust Query Caps

For very large datasets, consider reducing the default caps:
- `max_nodes`: 10000-15000 instead of 20000
- `max_links`: 25000-35000 instead of 50000

### 2. Vacuum and Analyze

Keep statistics up to date:
```sql
VACUUM ANALYZE graph_nodes;
VACUUM ANALYZE graph_links;
```

### 3. Monitor Index Usage

Check which indexes are being used:
```sql
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename IN ('graph_nodes', 'graph_links')
ORDER BY idx_scan DESC;
```

### 4. Check for Unused Indexes

Identify indexes that are never used:
```sql
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename IN ('graph_nodes', 'graph_links')
  AND idx_scan = 0
  AND indexname NOT LIKE '%_pkey';
```

### 5. Index Maintenance

Rebuild indexes if they become fragmented:
```sql
REINDEX INDEX CONCURRENTLY idx_graph_nodes_val_numeric;
REINDEX INDEX CONCURRENTLY idx_graph_links_source;
REINDEX INDEX CONCURRENTLY idx_graph_links_target;
```

## Known Limitations

1. **Regex Performance**: The `val ~ '^[0-9]+$'` regex check is necessary but adds overhead. Consider migrating `val` to a numeric type in future schema updates.

2. **CTE Materialization**: PostgreSQL materializes CTEs by default in versions <12. For very large result sets, consider using subqueries instead.

3. **IN Clause Performance**: Large IN clauses can be slow. The current implementation limits node selection to mitigate this.

4. **Position Columns**: Optional position columns (pos_x, pos_y, pos_z) add overhead when populated. Only request with `with_positions=true` when needed.

## Future Optimizations

1. **Partitioning**: Consider partitioning `graph_links` by node type for very large graphs (>10M links)
2. **Materialized Views**: For static graphs, materialized views could pre-compute common query patterns
3. **Column Store Extension**: For analytical queries, consider columnar storage extensions like `cstore_fdw`
4. **Graph Extensions**: PostgreSQL graph extensions like Apache AGE could provide specialized graph query capabilities

## Related Documentation

- [Graph Performance Migration Guide](graph-performance-migration.md)
- [Performance Optimizations (Frontend)](PERFORMANCE.md)
- [Developer Guide](developer-guide.md)
