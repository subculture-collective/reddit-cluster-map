CREATE TABLE subreddits (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    title TEXT,
    description TEXT,
    subscribers INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_seen TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_seen TIMESTAMPTZ DEFAULT now(),
    first_seen TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    subreddit_id INTEGER NOT NULL REFERENCES subreddits(id),
    author_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT,
    selftext TEXT,
    permalink TEXT,
    created_at TIMESTAMPTZ,
    score INT,
    flair TEXT,
    url TEXT,
    is_self BOOLEAN,
    last_seen TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_posts_subreddit_id ON posts(subreddit_id);
CREATE INDEX idx_posts_author_id ON posts(author_id);

CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id),
    subreddit_id INTEGER NOT NULL REFERENCES subreddits(id),
    parent_id TEXT,
    body TEXT,
    created_at TIMESTAMPTZ,
    score INT,
    last_seen TIMESTAMPTZ DEFAULT now(),
    depth INT DEFAULT 0
);

CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
CREATE INDEX idx_comments_subreddit_id ON comments(subreddit_id);

CREATE TABLE crawl_jobs (
  id SERIAL PRIMARY KEY,
  subreddit_id INTEGER NOT NULL REFERENCES subreddits(id) UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, crawling, success, failed
  retries INT DEFAULT 0,
  last_attempt TIMESTAMPTZ DEFAULT now(),
  duration_ms INT,
  enqueued_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX idx_crawl_jobs_subreddit_id ON crawl_jobs(subreddit_id);

CREATE TABLE graph_nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    val TEXT,
    type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_graph_nodes_name ON graph_nodes(name);
CREATE INDEX idx_graph_nodes_name_hash ON graph_nodes (substring(name, 1, 10));

CREATE TABLE graph_links (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source) REFERENCES graph_nodes(id),
    FOREIGN KEY (target) REFERENCES graph_nodes(id)
);

CREATE INDEX idx_graph_links_source ON graph_links(source);
CREATE INDEX idx_graph_links_target ON graph_links(target);

CREATE TABLE subreddit_relationships (
    id SERIAL PRIMARY KEY,
    source_subreddit_id INTEGER NOT NULL REFERENCES subreddits(id),
    target_subreddit_id INTEGER NOT NULL REFERENCES subreddits(id),
    overlap_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_subreddit_id, target_subreddit_id)
);

CREATE INDEX idx_subreddit_relationships_source ON subreddit_relationships(source_subreddit_id);
CREATE INDEX idx_subreddit_relationships_target ON subreddit_relationships(target_subreddit_id);
CREATE INDEX idx_subreddit_relationships_composite ON subreddit_relationships(source_subreddit_id, target_subreddit_id);

CREATE TABLE user_subreddit_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    subreddit_id INTEGER NOT NULL REFERENCES subreddits(id),
    activity_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, subreddit_id)
);

CREATE INDEX idx_user_subreddit_activity_user ON user_subreddit_activity(user_id);
CREATE INDEX idx_user_subreddit_activity_subreddit ON user_subreddit_activity(subreddit_id);
CREATE INDEX idx_user_subreddit_activity_composite ON user_subreddit_activity(user_id, subreddit_id);

CREATE TABLE graph_data (
    id SERIAL PRIMARY KEY,
    data_type TEXT NOT NULL,
    node_id TEXT,
    node_name TEXT,
    node_value TEXT,
    node_type TEXT,
    source TEXT,
    target TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_graph_data_data_type ON graph_data(data_type);
CREATE INDEX idx_graph_data_node_id ON graph_data(node_id);
CREATE INDEX idx_graph_data_source ON graph_data(source);
CREATE INDEX idx_graph_data_target ON graph_data(target);