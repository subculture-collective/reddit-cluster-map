-- name: ListSubreddits :many
SELECT id, name, title FROM subreddits ORDER BY id DESC LIMIT 100;