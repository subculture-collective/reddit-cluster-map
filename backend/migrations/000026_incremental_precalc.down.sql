-- Drop triggers
DROP TRIGGER IF EXISTS trigger_comments_updated_at ON comments;
DROP TRIGGER IF EXISTS trigger_posts_updated_at ON posts;
DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
DROP TRIGGER IF EXISTS trigger_subreddits_updated_at ON subreddits;

-- Drop trigger functions
DROP FUNCTION IF EXISTS update_comments_updated_at();
DROP FUNCTION IF EXISTS update_posts_updated_at();
DROP FUNCTION IF EXISTS update_users_updated_at();
DROP FUNCTION IF EXISTS update_subreddits_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_comments_updated_at;
DROP INDEX IF EXISTS idx_posts_updated_at;
DROP INDEX IF EXISTS idx_users_updated_at;
DROP INDEX IF EXISTS idx_subreddits_updated_at;

-- Drop precalc_state table
DROP TABLE IF EXISTS precalc_state;

-- Remove updated_at columns
ALTER TABLE comments DROP COLUMN IF EXISTS updated_at;
ALTER TABLE posts DROP COLUMN IF EXISTS updated_at;
ALTER TABLE users DROP COLUMN IF EXISTS updated_at;
ALTER TABLE subreddits DROP COLUMN IF EXISTS updated_at;
