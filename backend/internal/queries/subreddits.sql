-- name: UpsertSubreddit :exec
INSERT INTO subreddits (name, title, description, subscribers, last_seen)
VALUES ($1, $2, $3, $4, now())
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  subscribers = EXCLUDED.subscribers,
  last_seen = now();

-- name: GetSubreddit :one
SELECT * FROM subreddits WHERE name = $1;

-- name: ListSubreddits :many
SELECT * FROM subreddits ORDER BY last_seen DESC LIMIT $1 OFFSET $2;

-- name: TouchSubreddit :exec
UPDATE subreddits SET last_seen = now() WHERE name = $1;
