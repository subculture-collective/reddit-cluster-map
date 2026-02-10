-- Remove spatial index
DROP INDEX IF EXISTS idx_graph_nodes_spatial_nonnull;

-- Note: We don't drop the btree_gist extension as it might be used by other features
-- and dropping extensions can be dangerous in production
-- DROP EXTENSION IF EXISTS btree_gist;
