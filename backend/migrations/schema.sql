CREATE TABLE subreddits (
    name TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    subscribers INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_seen TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
    username TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_seen TIMESTAMPTZ DEFAULT now(),
    first_seen TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    subreddit TEXT NOT NULL REFERENCES subreddits(name),
    author TEXT NOT NULL REFERENCES users(username),
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

CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author TEXT NOT NULL REFERENCES users(username),
    subreddit TEXT NOT NULL REFERENCES subreddits(name),
    parent_id TEXT,
    body TEXT,
    created_at TIMESTAMPTZ,
    score INT,
    last_seen TIMESTAMPTZ DEFAULT now(),
    depth INT DEFAULT 0
);

CREATE INDEX idx_comments_parent_id ON comments(parent_id);

CREATE TABLE subreddit_edges (
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  shared_users INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (source, target)
);

CREATE TABLE crawl_jobs (
  id SERIAL PRIMARY KEY,
  subreddit TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, crawling, success, failed
  retries INT DEFAULT 0,
  last_attempt TIMESTAMPTZ DEFAULT now(),
  duration_ms INT,
  enqueued_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crawl_jobs_status ON crawl_jobs(status);