-- Drop orphan table
DROP TABLE IF EXISTS subreddit_edges;

-- Create missing table: subreddit_relationships
CREATE TABLE IF NOT EXISTS subreddit_relationships (
    id SERIAL PRIMARY KEY,
    source_subreddit TEXT REFERENCES subreddits(name),
    target_subreddit TEXT REFERENCES subreddits(name),
    overlap_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_subreddit, target_subreddit)
);

CREATE INDEX IF NOT EXISTS idx_subreddit_relationships_source ON subreddit_relationships(source_subreddit);
CREATE INDEX IF NOT EXISTS idx_subreddit_relationships_target ON subreddit_relationships(target_subreddit);
CREATE INDEX IF NOT EXISTS idx_subreddit_relationships_composite ON subreddit_relationships(source_subreddit, target_subreddit);

-- Create missing table: user_subreddit_activity
CREATE TABLE IF NOT EXISTS user_subreddit_activity (
    id SERIAL PRIMARY KEY,
    username TEXT REFERENCES users(username),
    subreddit TEXT REFERENCES subreddits(name),
    activity_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, subreddit)
);

CREATE INDEX IF NOT EXISTS idx_user_subreddit_activity_user ON user_subreddit_activity(username);
CREATE INDEX IF NOT EXISTS idx_user_subreddit_activity_subreddit ON user_subreddit_activity(subreddit);
CREATE INDEX IF NOT EXISTS idx_user_subreddit_activity_composite ON user_subreddit_activity(username, subreddit); 