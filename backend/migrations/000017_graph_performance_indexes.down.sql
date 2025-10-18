-- Remove performance indexes

DROP INDEX IF EXISTS idx_graph_nodes_type;
DROP INDEX IF EXISTS idx_graph_nodes_val_numeric;
DROP INDEX IF EXISTS idx_graph_links_target_source;
