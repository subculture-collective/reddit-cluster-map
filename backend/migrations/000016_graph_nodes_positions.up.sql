-- Add optional precomputed position columns to graph_nodes
ALTER TABLE graph_nodes
    ADD COLUMN IF NOT EXISTS pos_x DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pos_y DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pos_z DOUBLE PRECISION;

-- Optional index if we later query by presence of positions
-- CREATE INDEX IF NOT EXISTS idx_graph_nodes_pos ON graph_nodes (pos_x, pos_y, pos_z);
