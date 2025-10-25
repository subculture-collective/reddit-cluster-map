-- Create table to store detected communities
CREATE TABLE IF NOT EXISTS graph_communities (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    modularity DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table to store community membership (which nodes belong to which community)
CREATE TABLE IF NOT EXISTS graph_community_members (
    community_id INTEGER NOT NULL REFERENCES graph_communities(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    PRIMARY KEY (community_id, node_id)
);

-- Create table to store inter-community links (aggregated weighted links between communities)
CREATE TABLE IF NOT EXISTS graph_community_links (
    source_community_id INTEGER NOT NULL REFERENCES graph_communities(id) ON DELETE CASCADE,
    target_community_id INTEGER NOT NULL REFERENCES graph_communities(id) ON DELETE CASCADE,
    weight INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source_community_id, target_community_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_members_node ON graph_community_members(node_id);
CREATE INDEX IF NOT EXISTS idx_community_links_source ON graph_community_links(source_community_id);
CREATE INDEX IF NOT EXISTS idx_community_links_target ON graph_community_links(target_community_id);
