-- Drop indexes
DROP INDEX IF EXISTS idx_subreddit_relationships_source;
DROP INDEX IF EXISTS idx_subreddit_relationships_target;
DROP INDEX IF EXISTS idx_user_subreddit_activity_user;
DROP INDEX IF EXISTS idx_user_subreddit_activity_subreddit;

-- Drop tables
DROP TABLE IF EXISTS user_subreddit_activity;
DROP TABLE IF EXISTS subreddit_relationships; 