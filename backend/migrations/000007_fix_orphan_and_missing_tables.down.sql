-- Drop newly created tables
DROP TABLE IF EXISTS user_subreddit_activity;
DROP TABLE IF EXISTS subreddit_relationships;

-- Recreate orphan table
CREATE TABLE IF NOT EXISTS subreddit_edges (
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  shared_users INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (source, target)
); 