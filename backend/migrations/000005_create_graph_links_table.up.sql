CREATE TABLE IF NOT EXISTS graph_links (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source) REFERENCES graph_nodes(subreddit),
    FOREIGN KEY (target) REFERENCES graph_nodes(subreddit)
);

CREATE INDEX IF NOT EXISTS idx_graph_links_source ON graph_links(source);
CREATE INDEX IF NOT EXISTS idx_graph_links_target ON graph_links(target); 