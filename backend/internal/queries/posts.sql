-- name: UpsertPost :exec
INSERT INTO posts (id, subreddit_id, author_id, title, selftext, permalink, created_at, score, flair, url, is_self, last_seen)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
ON CONFLICT (id) DO UPDATE SET
  subreddit_id = EXCLUDED.subreddit_id,
  author_id = EXCLUDED.author_id,
  title = EXCLUDED.title,
  selftext = EXCLUDED.selftext,
  permalink = EXCLUDED.permalink,
  created_at = EXCLUDED.created_at,
  score = EXCLUDED.score,
  flair = EXCLUDED.flair,
  url = EXCLUDED.url,
  is_self = EXCLUDED.is_self,
  last_seen = now();

-- name: GetPost :one
SELECT * FROM posts WHERE id = $1;

-- name: ListPostsBySubreddit :many
SELECT * FROM posts WHERE subreddit_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;