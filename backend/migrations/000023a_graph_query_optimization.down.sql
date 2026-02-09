-- Rollback graph query optimization indexes

DROP INDEX IF EXISTS idx_graph_nodes_val_covering;
DROP INDEX IF EXISTS idx_graph_links_source;
DROP INDEX IF EXISTS idx_graph_links_target;
