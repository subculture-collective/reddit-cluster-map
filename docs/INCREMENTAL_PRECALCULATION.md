# Incremental Precalculation

## Overview

Incremental precalculation is a performance optimization that significantly reduces the time required to update the graph visualization by only processing entities that have changed since the last precalculation run.

## Motivation

Previously, the graph precalculation process would:
- Clear all graph tables (`graph_nodes`, `graph_links`)
- Rebuild everything from scratch
- Take 10+ minutes for large datasets
- Cause all connected clients to lose their graph during rebuild

With incremental precalculation:
- Only changed entities are processed
- Graph tables are updated incrementally (no clearing)
- <5% data change completes in <2 minutes
- Node IDs remain stable across rebuilds
- No service disruption for clients

## How It Works

### 1. Change Detection

The system tracks when entities were last modified using `updated_at` timestamps on:
- `subreddits` table
- `users` table  
- `posts` table
- `comments` table

A new `precalc_state` table tracks:
- `last_precalc_at`: Timestamp of last precalculation (incremental or full)
- `last_full_precalc_at`: Timestamp of last full rebuild
- `total_nodes`: Count of nodes in last run
- `total_links`: Count of links in last run
- `precalc_duration_ms`: Duration of last run in milliseconds

### 2. Incremental vs Full Decision

On each precalculation run, the system:

1. Checks if a previous precalculation has occurred (`last_precalc_at`)
2. If no previous run exists → **Full rebuild**
3. If `--full` flag is passed → **Full rebuild**
4. If `PRECALC_CLEAR_ON_START=true` → **Full rebuild**
5. Counts changed entities since last run
6. If changes > 20% of total graph → **Full rebuild** (for performance)
7. Otherwise → **Incremental update**

### 3. Incremental Processing

In incremental mode:
- Fetches only users/subreddits modified since `last_precalc_at`
- Uses `INSERT ... ON CONFLICT DO UPDATE` instead of `TRUNCATE` for nodes/links
- Node IDs remain stable (e.g., `user_123`, `subreddit_456`)
- **Note:** User activity (`user_subreddit_activity`) and subreddit relationships are currently recomputed from all users each run for correctness. Future optimization could make these incremental as well.
- Community detection runs on the updated graph

## Usage

### Running Precalculation

**Default (automatic mode selection):**
```bash
make precalculate
```

**Force full rebuild:**
```bash
# Using Docker
docker exec reddit-cluster-precalculate ./precalculate --full

# Or directly if binary is available
./precalculate --full
```

**Check precalculation status:**
```sql
SELECT * FROM precalc_state;
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PRECALC_INTERVAL` | `1h` | Time between automatic precalc runs |
| `PRECALC_CLEAR_ON_START` | `false` | Force full rebuild on every run |
| `PRECALC_FORCE_CLEAR` | `false` | Clear graph tables on startup (one-time) |
| `GRAPH_NODE_BATCH_SIZE` | `1000` | Batch size for node upserts |
| `GRAPH_LINK_BATCH_SIZE` | `2000` | Batch size for link inserts |
| `GRAPH_PROGRESS_INTERVAL` | `10000` | Progress logging interval |

### Docker Compose

The precalculation service runs continuously in Docker:

```yaml
reddit-cluster-precalculate:
  environment:
    - PRECALC_INTERVAL=1h  # Run every hour
    - PRECALC_CLEAR_ON_START=false  # Use incremental mode
```

To trigger a full rebuild without restarting:
```bash
docker exec reddit-cluster-precalculate /bin/sh -c "pkill -SIGTERM precalculate"
docker exec reddit-cluster-precalculate ./precalculate --full
```

## Database Schema

### Migration 000026: Incremental Precalculation

**Added columns:**
- `subreddits.updated_at` - Timestamp of last modification
- `users.updated_at` - Timestamp of last modification  
- `posts.updated_at` - Timestamp of last modification
- `comments.updated_at` - Timestamp of last modification

**New table:**
```sql
CREATE TABLE precalc_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_precalc_at TIMESTAMPTZ,
    last_full_precalc_at TIMESTAMPTZ,
    total_nodes INTEGER DEFAULT 0,
    total_links INTEGER DEFAULT 0,
    precalc_duration_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT single_row_constraint CHECK (id = 1)
);
```

**Triggers:**
Automatic `updated_at` triggers on all source tables ensure timestamps are always current.

**Indexes:**
```sql
CREATE INDEX idx_subreddits_updated_at ON subreddits(updated_at);
CREATE INDEX idx_users_updated_at ON users(updated_at);
CREATE INDEX idx_posts_updated_at ON posts(updated_at);
CREATE INDEX idx_comments_updated_at ON comments(updated_at);
```

## SQL Queries

New queries added for change detection:

- `GetPrecalcState` - Fetch current precalculation state
- `UpdatePrecalcState` - Update state after each run
- `GetChangedSubredditsSince` - Subreddits modified since timestamp
- `GetChangedUsersSince` - Users modified since timestamp
- `GetChangedPostsSince` - Posts modified since timestamp
- `GetChangedCommentsSince` - Comments modified since timestamp
- `CountChangedEntities` - Count changes across all entity types
- `GetUserActivitySince` - User activity changes since timestamp
- `GetAffectedUserIDs` - User IDs with changed content
- `GetAffectedSubredditIDs` - Subreddit IDs with changed content

## Performance Benchmarks

Expected performance improvements with incremental mode:

| Data Change | Full Rebuild | Incremental | Improvement |
|-------------|--------------|-------------|-------------|
| 0.5% | 10 min | 30 sec | **20x faster** |
| 2% | 10 min | 1 min | **10x faster** |
| 5% | 10 min | 2 min | **5x faster** |
| 20% | 10 min | 8 min | **1.25x faster** |
| >20% | 10 min | 10 min | Full rebuild triggered |

*Note: Actual times depend on dataset size and hardware.*

## Monitoring

### Logs

Incremental precalculation logs:
```
INFO Starting graph data precalculation
INFO Change detection changed_subreddits=5 changed_users=12 changed_posts=45 changed_comments=123 change_percent=2.5
INFO Running incremental precalculation last_precalc_at=2026-02-09T04:00:00Z change_percent=2.5
INFO Incremental mode: processing only changed entities changed_users=12 changed_subreddits=5
INFO Graph precalculation completed duration=1m15s incremental=true
```

Full rebuild logs:
```
INFO Starting graph data precalculation
INFO No previous precalculation found, running full build
INFO Running full precalculation rebuild
INFO Cleared existing graph data
INFO Graph precalculation completed duration=10m30s incremental=false
```

### Metrics

Monitor these Prometheus metrics:
- `graph_precalc_duration_seconds` - Time to complete precalculation
- `graph_precalc_total_nodes` - Total nodes in graph
- `graph_precalc_total_links` - Total links in graph
- `graph_precalc_change_percent` - Percentage of data changed

### Database Queries

Check incremental status:
```sql
-- View precalc state
SELECT 
    last_precalc_at,
    last_full_precalc_at,
    total_nodes,
    total_links,
    precalc_duration_ms,
    precalc_duration_ms / 1000.0 as duration_seconds,
    NOW() - last_precalc_at as time_since_last_run
FROM precalc_state;

-- Count changes since last run
SELECT 
    (SELECT COUNT(*) FROM subreddits WHERE updated_at > (SELECT last_precalc_at FROM precalc_state)) as changed_subreddits,
    (SELECT COUNT(*) FROM users WHERE updated_at > (SELECT last_precalc_at FROM precalc_state)) as changed_users,
    (SELECT COUNT(*) FROM posts WHERE updated_at > (SELECT last_precalc_at FROM precalc_state)) as changed_posts,
    (SELECT COUNT(*) FROM comments WHERE updated_at > (SELECT last_precalc_at FROM precalc_state)) as changed_comments;
```

## Troubleshooting

### Issue: Incremental mode not being used

**Symptoms:** Every run shows "Running full precalculation rebuild"

**Solutions:**
1. Check precalc_state exists and has valid `last_precalc_at`:
   ```sql
   SELECT * FROM precalc_state;
   ```
2. Verify `PRECALC_CLEAR_ON_START` is not set to `true`
3. Check if change percentage exceeds 20% threshold
4. Ensure migration 000026 has been applied:
   ```bash
   make migrate-status
   ```

### Issue: Nodes not updating after changes

**Symptoms:** New data not appearing in graph

**Solutions:**
1. Trigger manual precalculation:
   ```bash
   make precalculate
   ```
2. Check if precalc service is running:
   ```bash
   docker ps | grep precalculate
   ```
3. Force full rebuild:
   ```bash
   docker exec reddit-cluster-precalculate ./precalculate --full
   ```

### Issue: Performance degraded

**Symptoms:** Incremental runs taking longer than expected

**Solutions:**
1. Check change percentage in logs - may be exceeding threshold
2. Verify indexes exist on `updated_at` columns:
   ```sql
   SELECT * FROM pg_indexes WHERE indexname LIKE '%updated_at%';
   ```
3. Run ANALYZE on tables:
   ```sql
   ANALYZE subreddits, users, posts, comments;
   ```
4. Consider running full rebuild if >20% data has changed

### Issue: Timestamps not updating

**Symptoms:** `updated_at` columns not changing on updates

**Solutions:**
1. Verify triggers are in place:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname LIKE '%updated_at%';
   ```
2. Re-apply migration 000026:
   ```bash
   make migrate-down
   make migrate-up
   ```

## API Impact

### No Breaking Changes

Incremental precalculation is backward compatible:
- All existing API endpoints work unchanged
- Graph data format remains identical
- Node IDs are stable (same as before)
- Client applications require no modifications

### Benefits to API Clients

- **Reduced downtime:** No more complete graph clearing during updates
- **Stable node references:** Can cache node IDs reliably
- **Faster updates:** Changes propagate to API in <2 minutes instead of 10+

## Migration Guide

### Upgrading from Previous Version

1. **Run database migration:**
   ```bash
   make migrate-up
   ```

2. **Verify migration succeeded:**
   ```bash
   make migrate-status
   # Should show 000026_incremental_precalc applied
   ```

3. **Initialize precalc state** (automatic on first run):
   The system will detect no previous run and perform a full rebuild, initializing the state.

4. **Monitor first few runs:**
   Check logs to confirm incremental mode activates:
   ```bash
   docker logs -f reddit-cluster-precalculate
   ```

### Rollback

To rollback incremental precalculation:

```bash
make migrate-down
```

This will:
- Drop `precalc_state` table
- Remove `updated_at` columns and triggers
- Remove indexes on `updated_at`

System will revert to full rebuild on every run.

## Future Enhancements

Potential improvements tracked in roadmap:

- **Per-community incremental updates:** Only recompute affected communities
- **Streaming precalculation:** Real-time graph updates as data arrives
- **Smart threshold tuning:** Adaptive decision between incremental/full based on performance
- **Differential layout computation:** Only re-layout nodes that moved
- **Parallel incremental processing:** Process multiple changed entities in parallel

## References

- Issue #172: Implement incremental precalculation
- Epic #141: Graph Data Pipeline (E3)
- Roadmap #138: MVP to Professional Grade v2.0
- Migration: `backend/migrations/000026_incremental_precalc.up.sql`
- Service implementation: `backend/internal/graph/service.go`
- SQL queries: `backend/internal/queries/graph.sql`
