-- Drop precomputed position columns from graph_nodes
ALTER TABLE graph_nodes
    DROP COLUMN IF EXISTS pos_x,
    DROP COLUMN IF EXISTS pos_y,
    DROP COLUMN IF EXISTS pos_z;
