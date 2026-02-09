-- Optimize graph queries for large datasets
-- This migration adds covering indexes and optimizations for the graph retrieval queries
-- Note: CONCURRENTLY removed because golang-migrate runs migrations in transactions

-- Create a covering index for node queries that include positions
-- This allows index-only scans for queries that need id, val, type, and positions
CREATE INDEX IF NOT EXISTS idx_graph_nodes_val_covering
ON graph_nodes (
    (CASE WHEN val ~ '^[0-9]+$' THEN CAST(val AS BIGINT) ELSE 0 END) DESC NULLS LAST,
    id
) INCLUDE (name, type, pos_x, pos_y, pos_z);

-- Add index for link lookups by source (complements existing target index)
-- The idx_graph_links_source_target already exists from migration 18
-- But ensure we have an index optimized for source lookups
CREATE INDEX IF NOT EXISTS idx_graph_links_source
ON graph_links (source);

-- Add index for link lookups by target (for reverse direction)
CREATE INDEX IF NOT EXISTS idx_graph_links_target
ON graph_links (target);

-- Analyze tables to update statistics for query planner
ANALYZE graph_nodes;
ANALYZE graph_links;
