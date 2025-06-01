-- name: UpsertUser :exec
INSERT INTO users (username, first_seen, last_seen)
VALUES ($1, now(), now())
ON CONFLICT (username) DO UPDATE SET last_seen = now();

-- name: GetUser :one
SELECT * FROM users WHERE username = $1;

-- name: ListUsers :many
SELECT * FROM users ORDER BY last_seen DESC LIMIT $1 OFFSET $2;

-- name: GetUserSubreddits :many
SELECT DISTINCT posts.subreddit FROM posts WHERE posts.author = $1
UNION
SELECT DISTINCT comments.subreddit FROM comments WHERE comments.author = $1;