-- Add a hash index on the first 10 characters of the name
CREATE INDEX idx_graph_nodes_name_hash ON graph_nodes (substring(name, 1, 10)); 