-- Create table to store precomputed edge bundles between communities
CREATE TABLE IF NOT EXISTS graph_bundles (
    source_community_id INTEGER NOT NULL REFERENCES graph_communities(id) ON DELETE CASCADE,
    target_community_id INTEGER NOT NULL REFERENCES graph_communities(id) ON DELETE CASCADE,
    weight INTEGER NOT NULL DEFAULT 0,
    avg_strength DOUBLE PRECISION,
    control_x DOUBLE PRECISION,
    control_y DOUBLE PRECISION,
    control_z DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source_community_id, target_community_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bundles_source ON graph_bundles(source_community_id);
CREATE INDEX IF NOT EXISTS idx_bundles_target ON graph_bundles(target_community_id);
CREATE INDEX IF NOT EXISTS idx_bundles_weight ON graph_bundles(weight DESC);
