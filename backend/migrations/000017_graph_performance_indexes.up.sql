-- Add indexes to optimize graph query performance

-- Index on type for filtered queries (GetPrecalculatedGraphDataCappedFiltered)
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(type) WHERE type IS NOT NULL;

-- Index on val for ORDER BY operations in node selection
-- Using expression index for numeric comparison
CREATE INDEX IF NOT EXISTS idx_graph_nodes_val_numeric ON graph_nodes(
    (CASE WHEN val ~ '^[0-9]+$' THEN CAST(val AS BIGINT) ELSE 0 END) DESC NULLS LAST, id
);

-- Composite index for link queries joining against selected nodes
-- The UNIQUE constraint on (source, target) already provides efficient lookups,
-- but we add a reverse composite index for target->source queries
CREATE INDEX IF NOT EXISTS idx_graph_links_target_source ON graph_links(target, source);
