-- Remove partial indexes for high-degree nodes

DROP INDEX IF EXISTS idx_graph_links_source_target;
DROP INDEX IF EXISTS idx_graph_nodes_type_val;
