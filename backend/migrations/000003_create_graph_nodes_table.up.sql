CREATE TABLE IF NOT EXISTS graph_nodes (
    id SERIAL PRIMARY KEY,
    subreddit TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    val INTEGER NOT NULL DEFAULT 1,
    type TEXT NOT NULL DEFAULT 'subreddit',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_subreddit ON graph_nodes(subreddit);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_name ON graph_nodes(name); 