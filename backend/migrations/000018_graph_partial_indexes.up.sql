-- Add partial indexes for high-degree/high-value nodes to optimize common query patterns
-- These indexes are smaller and faster than full indexes for the typical case where
-- queries focus on the most connected or valuable nodes


-- Composite index on (source, target) for fast bidirectional lookups
-- This complements the existing (target, source) index to cover both directions
CREATE INDEX IF NOT EXISTS idx_graph_links_source_target ON graph_links(source, target);

-- Partial index for graph_nodes filtered by common types
-- Optimizes queries that filter by specific node types (subreddit, user, post, comment)
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type_val ON graph_nodes(type, (
    CASE WHEN val ~ '^[0-9]+$' THEN CAST(val AS BIGINT) ELSE 0 END
) DESC NULLS LAST)
WHERE type IN ('subreddit', 'user', 'post', 'comment');
