-- Remove updated_at column from graph_community_links
ALTER TABLE graph_community_links DROP COLUMN IF EXISTS updated_at;
