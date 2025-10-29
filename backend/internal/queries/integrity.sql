-- name: FindOrphanPosts :many
-- Find posts that reference non-existent subreddits or users
SELECT p.id, p.subreddit_id, p.author_id, p.title
FROM posts p
WHERE NOT EXISTS (SELECT 1 FROM subreddits s WHERE s.id = p.subreddit_id)
   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.author_id)
LIMIT $1 OFFSET $2;

-- name: CountOrphanPosts :one
SELECT COUNT(*) FROM posts p
WHERE NOT EXISTS (SELECT 1 FROM subreddits s WHERE s.id = p.subreddit_id)
   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.author_id);

-- name: FindOrphanComments :many
-- Find comments that reference non-existent posts, users, or subreddits
SELECT c.id, c.post_id, c.author_id, c.subreddit_id
FROM comments c
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = c.post_id)
   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.author_id)
   OR NOT EXISTS (SELECT 1 FROM subreddits s WHERE s.id = c.subreddit_id)
LIMIT $1 OFFSET $2;

-- name: CountOrphanComments :one
SELECT COUNT(*) FROM comments c
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = c.post_id)
   OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.author_id)
   OR NOT EXISTS (SELECT 1 FROM subreddits s WHERE s.id = c.subreddit_id);

-- name: FindDanglingGraphLinks :many
-- Find graph_links that reference non-existent nodes
SELECT gl.id, gl.source, gl.target
FROM graph_links gl
WHERE NOT EXISTS (SELECT 1 FROM graph_nodes gn WHERE gn.id = gl.source)
   OR NOT EXISTS (SELECT 1 FROM graph_nodes gn WHERE gn.id = gl.target)
LIMIT $1 OFFSET $2;

-- name: CountDanglingGraphLinks :one
SELECT COUNT(*) FROM graph_links gl
WHERE NOT EXISTS (SELECT 1 FROM graph_nodes gn WHERE gn.id = gl.source)
   OR NOT EXISTS (SELECT 1 FROM graph_nodes gn WHERE gn.id = gl.target);

-- name: FindOrphanGraphNodes :many
-- Find graph_nodes that have no links (neither as source nor target)
SELECT gn.id, gn.name, gn.type
FROM graph_nodes gn
WHERE NOT EXISTS (SELECT 1 FROM graph_links gl WHERE gl.source = gn.id OR gl.target = gn.id)
LIMIT $1 OFFSET $2;

-- name: CountOrphanGraphNodes :one
SELECT COUNT(*) FROM graph_nodes gn
WHERE NOT EXISTS (SELECT 1 FROM graph_links gl WHERE gl.source = gn.id OR gl.target = gn.id);

-- name: DeleteOrphanPosts :exec
-- Delete posts that reference non-existent subreddits or users
DELETE FROM posts
WHERE id IN (
    SELECT p.id FROM posts p
    WHERE NOT EXISTS (SELECT 1 FROM subreddits s WHERE s.id = p.subreddit_id)
       OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.author_id)
    LIMIT $1
);

-- name: DeleteOrphanComments :exec
-- Delete comments that reference non-existent posts, users, or subreddits
DELETE FROM comments
WHERE id IN (
    SELECT c.id FROM comments c
    WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = c.post_id)
       OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.author_id)
       OR NOT EXISTS (SELECT 1 FROM subreddits s WHERE s.id = c.subreddit_id)
    LIMIT $1
);

-- name: DeleteDanglingGraphLinks :exec
-- Delete graph_links that reference non-existent nodes
DELETE FROM graph_links
WHERE id IN (
    SELECT gl.id FROM graph_links gl
    WHERE NOT EXISTS (SELECT 1 FROM graph_nodes gn WHERE gn.id = gl.source)
       OR NOT EXISTS (SELECT 1 FROM graph_nodes gn WHERE gn.id = gl.target)
    LIMIT $1
);

-- name: DeleteOrphanGraphNodes :exec
-- Delete graph_nodes that have no links
DELETE FROM graph_nodes
WHERE id IN (
    SELECT gn.id FROM graph_nodes gn
    WHERE NOT EXISTS (SELECT 1 FROM graph_links gl WHERE gl.source = gn.id OR gl.target = gn.id)
    LIMIT $1
);

-- name: FindInvalidCommentParents :many
-- Find comments with parent_id that doesn't exist in comments table
SELECT c.id, c.parent_id, c.post_id
FROM comments c
WHERE c.parent_id IS NOT NULL
  AND c.parent_id NOT LIKE 't1_%'  -- Not a comment reference
  AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = c.parent_id)
  AND NOT EXISTS (SELECT 1 FROM comments c2 WHERE c2.id = c.parent_id)
LIMIT $1 OFFSET $2;

-- name: CountInvalidCommentParents :one
SELECT COUNT(*) FROM comments c
WHERE c.parent_id IS NOT NULL
  AND c.parent_id NOT LIKE 't1_%'
  AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = c.parent_id)
  AND NOT EXISTS (SELECT 1 FROM comments c2 WHERE c2.id = c.parent_id);

-- name: GetStaleData :many
-- Find data that hasn't been updated in a long time (potential for backfill)
SELECT 
    'user' as entity_type,
    username as entity_name,
    last_seen,
    EXTRACT(EPOCH FROM (NOW() - last_seen))/86400 as days_since_seen
FROM users
WHERE last_seen < NOW() - INTERVAL '30 days'
UNION ALL
SELECT 
    'subreddit' as entity_type,
    name as entity_name,
    last_seen,
    EXTRACT(EPOCH FROM (NOW() - last_seen))/86400 as days_since_seen
FROM subreddits
WHERE last_seen < NOW() - INTERVAL '30 days'
ORDER BY days_since_seen DESC
LIMIT $1 OFFSET $2;

-- These queries use PostgreSQL system views and should be executed directly, not through sqlc
-- See internal/integrity package for implementation
