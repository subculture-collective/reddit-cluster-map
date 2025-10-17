# Graph API Performance Improvements - Migration Guide

## Overview

This update addresses timeout and cancellation issues in the graph API's precalculated queries under load by adding:

1. **Database indexes** for faster query execution
2. **Configurable timeouts** with proper error handling
3. **Better error messages** for clients
4. **Updated schema** with performance optimizations

## Changes

### 1. New Database Indexes (Migration 000017)

Three new indexes are added to optimize graph query performance:

- `idx_graph_nodes_type` - Partial index on `graph_nodes(type)` for filtered queries
- `idx_graph_nodes_val_numeric` - Expression index for efficient ORDER BY on numeric values
- `idx_graph_links_target_source` - Composite index for reverse link lookups

### 2. New Environment Variables

Two new optional configuration variables:

```bash
# Graph API query timeout (default: 30000ms / 30 seconds)
GRAPH_QUERY_TIMEOUT_MS=30000

# Database statement timeout (default: 25000ms / 25 seconds)
# Note: Currently unused; reserved for future direct database timeout enforcement.
# When implemented, should be less than GRAPH_QUERY_TIMEOUT_MS to allow graceful error handling.
DB_STATEMENT_TIMEOUT_MS=25000
```

### 3. API Behavior Changes

**Graph endpoint (`GET /api/graph`):**
- Now returns HTTP 408 (Request Timeout) when queries exceed the configured timeout
- Error response includes helpful message: `{"error":"Graph query timeout - dataset may be too large. Try reducing max_nodes or max_links parameters."}`
- Query parameters `max_nodes` and `max_links` are now documented in API docs
- Cache keys properly distinguish between requests with and without `with_positions=true`

## Migration Steps

### For Docker Deployments

1. **Pull the latest changes:**
   ```bash
   git pull origin main
   ```

2. **Apply database migrations:**
   ```bash
   cd backend
   make migrate-up
   ```
   
   Or manually:
   ```bash
   migrate -path migrations -database "$DATABASE_URL" up
   ```

3. **Rebuild and restart services:**
   ```bash
   docker compose down
   docker compose up -d --build
   ```

4. **(Optional) Configure timeouts:**
   
   Add to your `.env` file if you need different timeout values:
   ```bash
   GRAPH_QUERY_TIMEOUT_MS=45000  # Increase if you have a very large dataset
   DB_STATEMENT_TIMEOUT_MS=40000
   ```

### For Existing Databases

If you already have a populated database, the migration will:
- Add indexes to existing tables
- Not modify any existing data
- Be idempotent (safe to run multiple times due to `IF NOT EXISTS` clauses)

**Index creation time estimates:**
- Small datasets (<100K nodes/links): Seconds
- Medium datasets (100K-1M nodes/links): 10-60 seconds
- Large datasets (>1M nodes/links): 1-5 minutes

**Recommended:** For datasets with >500K nodes or >1M links, consider running the migration during a maintenance window or low-traffic period to avoid potential lock contention.

### Verification

After migration, verify the indexes were created:

```sql
-- Check graph_nodes indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'graph_nodes' 
AND schemaname = 'public';

-- Check graph_links indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'graph_links' 
AND schemaname = 'public';
```

You should see:
- `idx_graph_nodes_type`
- `idx_graph_nodes_val_numeric`
- `idx_graph_links_target_source`

## Expected Performance Impact

### Query Performance
- **Node selection with type filter:** 2-5x faster (depends on data distribution)
- **Node selection with ORDER BY val:** 3-10x faster for large datasets
- **Link filtering:** 1.5-2x faster for reverse lookups

### Timeout Handling
- Queries that previously hung indefinitely now fail gracefully after 30 seconds
- Clients receive clear error messages instead of connection timeouts
- Cache prevents repeated expensive queries

## Rollback

If you need to rollback these changes:

```bash
cd backend
migrate -path migrations -database "$DATABASE_URL" down 1
```

This will:
- Remove the three new indexes
- Not affect any data
- Revert to previous query performance characteristics

## Troubleshooting

### "timeout" errors after migration

If you see increased timeout errors after migration:

1. **Check dataset size:**
   ```sql
   SELECT COUNT(*) FROM graph_nodes;
   SELECT COUNT(*) FROM graph_links;
   ```

2. **Increase timeout if needed:**
   ```bash
   GRAPH_QUERY_TIMEOUT_MS=60000  # 60 seconds
   ```

3. **Reduce request caps:**
   - Use smaller `max_nodes` and `max_links` parameters in API calls
   - Example: `GET /api/graph?max_nodes=10000&max_links=20000`

4. **Check index creation:**
   Verify all indexes exist (see Verification section above)

### Slow migration application

For very large tables (>10M rows), index creation may take several minutes. This is normal. Monitor progress:

```sql
-- Check for running index builds
SELECT * FROM pg_stat_progress_create_index;
```

### Memory issues during index creation

If index creation fails due to memory, you can:
1. Increase PostgreSQL `maintenance_work_mem`
2. Create indexes one at a time manually
3. Run during low-traffic period

## Support

For issues or questions:
- File an issue on GitHub
- Check existing issues for similar problems
- Include query execution plans when reporting performance issues
