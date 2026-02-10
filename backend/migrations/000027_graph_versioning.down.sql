-- Remove version tracking from precalc_state
ALTER TABLE precalc_state DROP COLUMN IF EXISTS current_version_id;

-- Drop indexes
DROP INDEX IF EXISTS idx_graph_diffs_action;
DROP INDEX IF EXISTS idx_graph_diffs_entity;
DROP INDEX IF EXISTS idx_graph_diffs_version_id;
DROP INDEX IF EXISTS idx_graph_versions_status;
DROP INDEX IF EXISTS idx_graph_versions_created_at;

-- Drop tables (cascade will handle foreign key constraints)
DROP TABLE IF EXISTS graph_diffs;
DROP TABLE IF EXISTS graph_versions;
