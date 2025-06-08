-- Create subreddit_relationships table
CREATE TABLE IF NOT EXISTS subreddit_relationships (
    id SERIAL PRIMARY KEY,
    source_subreddit_id INTEGER REFERENCES subreddits(id),
    target_subreddit_id INTEGER REFERENCES subreddits(id),
    overlap_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_subreddit_id, target_subreddit_id)
);

-- Create user_subreddit_activity table
CREATE TABLE IF NOT EXISTS user_subreddit_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    subreddit_id INTEGER REFERENCES subreddits(id),
    activity_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, subreddit_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subreddit_relationships_source ON subreddit_relationships(source_subreddit_id);
CREATE INDEX IF NOT EXISTS idx_subreddit_relationships_target ON subreddit_relationships(target_subreddit_id);
CREATE INDEX IF NOT EXISTS idx_user_subreddit_activity_user ON user_subreddit_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subreddit_activity_subreddit ON user_subreddit_activity(subreddit_id); 