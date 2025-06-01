-- name: UpsertSubredditEdge :exec
INSERT INTO subreddit_edges (source, target, shared_users, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (source, target) DO UPDATE SET
  shared_users = subreddit_edges.shared_users + EXCLUDED.shared_users,
  updated_at = now();

-- name: GetEdgesForSubreddit :many
SELECT * FROM subreddit_edges WHERE source = $1 OR target = $1;

-- name: ListTopEdges :many
SELECT * FROM subreddit_edges ORDER BY shared_users DESC LIMIT $1 OFFSET $2;

-- name: ListSubredditEdges :many
SELECT * FROM subreddit_edges ORDER BY created_at DESC LIMIT 100;