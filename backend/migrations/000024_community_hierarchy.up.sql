-- Create table to store hierarchical community structure
CREATE TABLE IF NOT EXISTS graph_community_hierarchy (
    node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level >= 0),
    community_id INTEGER NOT NULL,
    parent_community_id INTEGER,
    centroid_x DOUBLE PRECISION,
    centroid_y DOUBLE PRECISION,
    centroid_z DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (node_id, level)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_hierarchy_level ON graph_community_hierarchy(level);
CREATE INDEX IF NOT EXISTS idx_hierarchy_community ON graph_community_hierarchy(level, community_id);
CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON graph_community_hierarchy(level, parent_community_id);
