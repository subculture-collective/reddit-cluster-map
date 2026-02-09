-- Enable btree_gist extension for spatial indexing
-- This is included in standard PostgreSQL and doesn't require PostGIS
-- NOTE: Creating this extension requires superuser or appropriate privileges.
-- In managed PostgreSQL environments, ensure the extension is enabled before running migrations.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create a partial GiST index on (pos_x, pos_y, pos_z) for efficient bounding box queries
-- This uses btree_gist GiST operator classes for scalar DOUBLE PRECISION comparisons
-- The index is useful for predicates like: WHERE pos_x BETWEEN x1 AND x2 AND pos_y BETWEEN y1 AND y2 AND pos_z IS NOT NULL
-- Partial index only covers nodes with non-NULL positions, reducing index size and maintenance overhead
CREATE INDEX IF NOT EXISTS idx_graph_nodes_spatial_nonnull ON graph_nodes 
USING gist (pos_x, pos_y, pos_z)
WHERE pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL;
