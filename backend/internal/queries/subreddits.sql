-- name: UpsertSubreddit :one
INSERT INTO subreddits (name, title, description, subscribers, created_at, last_seen)
VALUES ($1, $2, $3, $4, now(), now())
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  subscribers = EXCLUDED.subscribers,
  last_seen = now()
RETURNING id;

-- name: GetSubreddit :one
SELECT * FROM subreddits WHERE name = $1;

-- name: GetSubredditByID :one
SELECT * FROM subreddits WHERE id = $1;

-- name: ListSubreddits :many
SELECT * FROM subreddits ORDER BY last_seen DESC LIMIT $1 OFFSET $2;

-- name: TouchSubreddit :exec
UPDATE subreddits SET last_seen = now() WHERE name = $1;

-- name: GetStaleSubreddits :many
SELECT name FROM subreddits 
WHERE last_seen < NOW() - INTERVAL '7 days'
ORDER BY last_seen ASC;
