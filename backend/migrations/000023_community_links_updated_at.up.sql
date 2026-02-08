-- Add missing updated_at column to graph_community_links
ALTER TABLE graph_community_links
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
