-- name: UpsertUser :exec
INSERT INTO users (username, created_at, last_seen)
VALUES ($1, now(), now())
ON CONFLICT (username) DO UPDATE SET
  last_seen = now();

-- name: GetUser :one
SELECT * FROM users WHERE username = $1;

-- name: ListUsers :many
SELECT * FROM users ORDER BY last_seen DESC LIMIT $1 OFFSET $2;