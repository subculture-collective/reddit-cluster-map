-- name: InsertComment :exec
INSERT INTO comments (id, post_id, subreddit, author, body, created_at, parent_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (id) DO NOTHING;

-- name: GetCommentsByPost :many
SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at DESC;

-- name: GetCommentsByUser :many
SELECT * FROM comments WHERE author = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: ListComments :many
SELECT * FROM comments ORDER BY created_at DESC LIMIT 100;

-- name: UpsertComment :exec
INSERT INTO comments (id, post_id, author, subreddit, body, parent_id, depth)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (id) DO UPDATE
SET
  body = EXCLUDED.body,
  parent_id = EXCLUDED.parent_id,
  depth = EXCLUDED.depth;