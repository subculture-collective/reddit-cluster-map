-- Rollback graph query optimization indexes

DROP INDEX CONCURRENTLY IF EXISTS idx_graph_nodes_val_covering;
DROP INDEX CONCURRENTLY IF EXISTS idx_graph_nodes_id_hash;
DROP INDEX CONCURRENTLY IF EXISTS idx_graph_links_source;
DROP INDEX CONCURRENTLY IF EXISTS idx_graph_links_target;
