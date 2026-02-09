-- Enable btree_gist extension for spatial indexing
-- This is included in standard PostgreSQL and doesn't require PostGIS
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create a GiST index on (pos_x, pos_y, pos_z) for efficient bounding box queries
-- This uses range types which are supported by btree_gist
-- The index supports queries like: WHERE pos_x BETWEEN x1 AND x2 AND pos_y BETWEEN y1 AND y2
CREATE INDEX IF NOT EXISTS idx_graph_nodes_spatial ON graph_nodes 
USING gist (pos_x, pos_y, pos_z);

-- Add a partial index for nodes that have positions (optimization)
-- This makes the spatial index smaller and faster by excluding NULL positions
CREATE INDEX IF NOT EXISTS idx_graph_nodes_spatial_nonnull ON graph_nodes 
USING gist (pos_x, pos_y, pos_z)
WHERE pos_x IS NOT NULL AND pos_y IS NOT NULL AND pos_z IS NOT NULL;
