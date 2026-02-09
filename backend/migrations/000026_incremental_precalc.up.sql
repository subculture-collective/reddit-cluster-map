-- Add updated_at columns to source tables for change detection
-- These will track when entities were last modified

-- Add updated_at to subreddits (if not already exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'subreddits' AND column_name = 'updated_at') THEN
    ALTER TABLE subreddits ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    -- Backfill with created_at or now() for existing rows
    UPDATE subreddits SET updated_at = COALESCE(created_at, now());
  END IF;
END $$;

-- Add updated_at to users (if not already exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'updated_at') THEN
    ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    UPDATE users SET updated_at = COALESCE(created_at, now());
  END IF;
END $$;

-- Add updated_at to posts (if not already exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'posts' AND column_name = 'updated_at') THEN
    ALTER TABLE posts ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    UPDATE posts SET updated_at = COALESCE(last_seen, now());
  END IF;
END $$;

-- Add updated_at to comments (if not already exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'comments' AND column_name = 'updated_at') THEN
    ALTER TABLE comments ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    UPDATE comments SET updated_at = COALESCE(last_seen, now());
  END IF;
END $$;

-- Create table to track precalculation state
CREATE TABLE IF NOT EXISTS precalc_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_precalc_at TIMESTAMPTZ,
    last_full_precalc_at TIMESTAMPTZ,
    total_nodes INTEGER DEFAULT 0,
    total_links INTEGER DEFAULT 0,
    precalc_duration_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT single_row_constraint CHECK (id = 1)
);

-- Initialize with a single row
INSERT INTO precalc_state (id, last_precalc_at, last_full_precalc_at)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Create indexes on updated_at for efficient change detection queries
CREATE INDEX IF NOT EXISTS idx_subreddits_updated_at ON subreddits(updated_at);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);
CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts(updated_at);
CREATE INDEX IF NOT EXISTS idx_comments_updated_at ON comments(updated_at);

-- Add trigger to auto-update updated_at on subreddits
CREATE OR REPLACE FUNCTION update_subreddits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_subreddits_updated_at ON subreddits;
CREATE TRIGGER trigger_subreddits_updated_at
    BEFORE UPDATE ON subreddits
    FOR EACH ROW
    EXECUTE FUNCTION update_subreddits_updated_at();

-- Add trigger to auto-update updated_at on users
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Add trigger to auto-update updated_at on posts
CREATE OR REPLACE FUNCTION update_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_posts_updated_at ON posts;
CREATE TRIGGER trigger_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_posts_updated_at();

-- Add trigger to auto-update updated_at on comments
CREATE OR REPLACE FUNCTION update_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_comments_updated_at ON comments;
CREATE TRIGGER trigger_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION update_comments_updated_at();

COMMENT ON TABLE precalc_state IS 'Tracks the state and timestamp of graph precalculation runs';
COMMENT ON COLUMN precalc_state.last_precalc_at IS 'Timestamp of the last precalculation (incremental or full)';
COMMENT ON COLUMN precalc_state.last_full_precalc_at IS 'Timestamp of the last full precalculation';
COMMENT ON COLUMN precalc_state.total_nodes IS 'Total number of nodes in the last precalculation';
COMMENT ON COLUMN precalc_state.total_links IS 'Total number of links in the last precalculation';
COMMENT ON COLUMN precalc_state.precalc_duration_ms IS 'Duration of the last precalculation in milliseconds';
