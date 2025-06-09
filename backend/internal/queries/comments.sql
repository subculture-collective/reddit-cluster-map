-- name: GetCommentsByPost :many
SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at DESC;

-- name: GetCommentsByUser :many
SELECT * FROM comments WHERE author_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: UpsertComment :exec
INSERT INTO comments (id, post_id, author_id, subreddit_id, parent_id, body, created_at, score, last_seen, depth)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)
ON CONFLICT (id) DO UPDATE SET
  post_id = EXCLUDED.post_id,
  author_id = EXCLUDED.author_id,
  subreddit_id = EXCLUDED.subreddit_id,
  parent_id = EXCLUDED.parent_id,
  body = EXCLUDED.body,
  created_at = EXCLUDED.created_at,
  score = EXCLUDED.score,
  last_seen = now(),
  depth = EXCLUDED.depth;

-- name: GetComment :one
SELECT * FROM comments WHERE id = $1;

-- name: ListCommentsByPost :many
SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC;