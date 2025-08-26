-- name: GetPrecalculatedGraphData :many
SELECT
    'node' as data_type,
    id,
    name,
    val::TEXT as val,
    type,
    NULL as source,
    NULL as target
FROM graph_nodes
UNION ALL
SELECT
    'link' as data_type,
    id::text,
    NULL as name,
    NULL::TEXT as val,
    NULL as type,
    source,
    target
FROM graph_links
ORDER BY data_type, id;

-- name: GetPrecalculatedGraphDataCapped :many
WITH sel_nodes AS (
    SELECT id, name, val, type
    FROM graph_nodes
    ORDER BY (
        CASE WHEN val ~ '^[0-9]+$' THEN val::BIGINT ELSE 0 END
    ) DESC NULLS LAST, id
    LIMIT $1
), sel_links AS (
    SELECT id, source, target
    FROM graph_links gl
    WHERE gl.source IN (SELECT id FROM sel_nodes)
      AND gl.target IN (SELECT id FROM sel_nodes)
    LIMIT $2
)
SELECT
    'node' AS data_type,
    n.id,
    n.name,
    n.val::TEXT AS val,
    n.type,
    NULL AS source,
    NULL AS target
FROM sel_nodes n
UNION ALL
SELECT
    'link' AS data_type,
    l.id::TEXT,
    NULL AS name,
    NULL::TEXT AS val,
    NULL AS type,
    l.source,
    l.target
FROM sel_links l
ORDER BY data_type, id;

-- name: GetAllPosts :many
SELECT id, title, score
FROM posts;

-- name: GetAllComments :many
SELECT id, body, score, post_id
FROM comments;

-- name: CreateGraphNode :one
INSERT INTO graph_nodes (
    id,
    name,
    val,
    type
) VALUES (
    $1, $2, $3, $4
) RETURNING *;

-- name: CreateGraphLink :one
INSERT INTO graph_links (
    source,
    target
) VALUES (
    $1, $2
) RETURNING *;

-- name: ClearGraphTables :exec
TRUNCATE TABLE graph_nodes, graph_links;

-- name: BulkInsertGraphNode :exec
INSERT INTO graph_nodes (id, name, val, type)
VALUES ($1, $2, $3, $4);

INSERT INTO graph_links (source, target)
SELECT $1, $2
WHERE EXISTS (SELECT 1 FROM graph_nodes WHERE id = $1)
    AND EXISTS (SELECT 1 FROM graph_nodes WHERE id = $2)
ON CONFLICT (source, target) DO NOTHING;

-- name: GetAllSubreddits :many
SELECT id, name, subscribers
FROM subreddits;

-- name: GetAllUsers :many
SELECT id, username
FROM users;

-- name: GetSubredditOverlap :one
WITH user_activity AS (
    SELECT DISTINCT p.author_id
    FROM posts p
    WHERE p.subreddit_id = $1
    UNION
    SELECT DISTINCT c.author_id
    FROM comments c
    WHERE c.subreddit_id = $1
),
other_activity AS (
    SELECT DISTINCT p.author_id
    FROM posts p
    WHERE p.subreddit_id = $2
    UNION
    SELECT DISTINCT c.author_id
    FROM comments c
    WHERE c.subreddit_id = $2
)
SELECT COUNT(*)
FROM user_activity ua
JOIN other_activity oa ON ua.author_id = oa.author_id;

INSERT INTO subreddit_relationships (
    source_subreddit_id,
    target_subreddit_id,
    overlap_count
) VALUES (
    $1, $2, $3
) ON CONFLICT (source_subreddit_id, target_subreddit_id)
DO UPDATE SET
    overlap_count = EXCLUDED.overlap_count,
    updated_at = now()
RETURNING *;

-- name: ClearSubredditRelationships :exec
TRUNCATE TABLE subreddit_relationships;

-- name: GetUserSubreddits :many
SELECT DISTINCT s.id, s.name
FROM subreddits s
JOIN posts p ON p.subreddit_id = s.id
WHERE p.author_id = $1
UNION
SELECT DISTINCT s.id, s.name
FROM subreddits s
JOIN comments c ON c.subreddit_id = s.id
WHERE c.author_id = $1;

-- name: GetUserSubredditActivityCount :one
SELECT (
    (SELECT COUNT(*) FROM posts p WHERE p.author_id = $1 AND p.subreddit_id = $2) +
    (SELECT COUNT(*) FROM comments c WHERE c.author_id = $1 AND c.subreddit_id = $2)
) as activity_count;

-- name: CreateUserSubredditActivity :one
INSERT INTO user_subreddit_activity (
    user_id,
    subreddit_id,
    activity_count
) VALUES (
    $1, $2, $3
) RETURNING *;

-- name: ClearUserSubredditActivity :exec
TRUNCATE TABLE user_subreddit_activity;

-- name: GetAllSubredditRelationships :many
SELECT source_subreddit_id, target_subreddit_id, overlap_count
FROM subreddit_relationships;

-- name: GetAllUserSubredditActivity :many
SELECT user_id, subreddit_id, activity_count
FROM user_subreddit_activity;

-- name: GetUserTotalActivity :one
SELECT (
    (SELECT COUNT(*) FROM posts p WHERE p.author_id = $1) +
    (SELECT COUNT(*) FROM comments c WHERE c.author_id = $1)
) as total_activity; 