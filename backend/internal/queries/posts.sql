-- name: InsertPost :exec
INSERT INTO posts (id, author, subreddit, title, permalink, created_at, score, flair, url, is_self)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT DO NOTHING;

-- name: GetPostsBySubreddit :many
SELECT * FROM posts WHERE subreddit = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: GetPostsByUser :many
SELECT * FROM posts WHERE author = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: ListPosts :many
SELECT * FROM posts ORDER BY created_at DESC LIMIT 100;

-- name: UpsertPost :exec
INSERT INTO posts (id, author, subreddit, title, permalink, created_at, score, flair, url, is_self)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  permalink = EXCLUDED.permalink,
  created_at = EXCLUDED.created_at,
  score = EXCLUDED.score,
  flair = EXCLUDED.flair,
  url = EXCLUDED.url,
  is_self = EXCLUDED.is_self;