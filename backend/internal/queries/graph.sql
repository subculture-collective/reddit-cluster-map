SELECT
    'node' as data_type,
    id,
    name,
    CAST(val AS TEXT) as val,
    type,
    pos_x,
    pos_y,
    pos_z,
    NULL as source,
    NULL as target
FROM graph_nodes
UNION ALL
SELECT
    'link' as data_type,
    CAST(id AS TEXT),
    NULL as name,
    CAST(NULL AS TEXT) as val,
    NULL as type,
    NULL as pos_x,
    NULL as pos_y,
    NULL as pos_z,
    source,
    target
FROM graph_links
ORDER BY data_type, id;

-- name: GetPrecalculatedGraphDataCappedAll :many
WITH sel_nodes AS (
    SELECT gn.id, gn.name, gn.val, gn.type, gn.pos_x, gn.pos_y, gn.pos_z
    FROM graph_nodes gn
    ORDER BY (
        CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
    ) DESC NULLS LAST, gn.id
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
        CAST(n.val AS TEXT) AS val,
    n.type,
    n.pos_x,
    n.pos_y,
    n.pos_z,
        NULL AS source,
        NULL AS target
FROM sel_nodes n
UNION ALL
SELECT
        'link' AS data_type,
        CAST(l.id AS TEXT),
        NULL AS name,
        CAST(NULL AS TEXT) AS val,
        NULL AS type,
    NULL as pos_x,
    NULL as pos_y,
    NULL as pos_z,
        l.source,
        l.target
FROM sel_links l
ORDER BY data_type, id;

-- name: GetPrecalculatedGraphDataCappedFiltered :many
WITH sel_nodes AS (
    SELECT gn.id, gn.name, gn.val, gn.type, gn.pos_x, gn.pos_y, gn.pos_z
    FROM graph_nodes gn
    WHERE gn.type IS NOT NULL AND gn.type = ANY($1::text[])
    ORDER BY (
        CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
    ) DESC NULLS LAST, gn.id
    LIMIT $2
), sel_links AS (
    SELECT id, source, target
    FROM graph_links gl
    WHERE gl.source IN (SELECT id FROM sel_nodes)
        AND gl.target IN (SELECT id FROM sel_nodes)
    LIMIT $3
)
SELECT
        'node' AS data_type,
        n.id,
        n.name,
        CAST(n.val AS TEXT) AS val,
    n.type,
    n.pos_x,
    n.pos_y,
    n.pos_z,
        NULL AS source,
        NULL AS target
FROM sel_nodes n
UNION ALL
SELECT
        'link' AS data_type,
        CAST(l.id AS TEXT),
        NULL AS name,
        CAST(NULL AS TEXT) AS val,
        NULL AS type,
    NULL as pos_x,
    NULL as pos_y,
    NULL as pos_z,
        l.source,
        l.target
FROM sel_links l
ORDER BY data_type, id;

-- name: GetPrecalculatedGraphDataNoPos :many
SELECT
    'node' as data_type,
    id,
    name,
    CAST(val AS TEXT) as val,
    type,
    NULL as source,
    NULL as target
FROM graph_nodes
UNION ALL
SELECT
    'link' as data_type,
    CAST(id AS TEXT),
    NULL as name,
    CAST(NULL AS TEXT) as val,
    NULL as type,
    source,
    target
FROM graph_links
ORDER BY data_type, id;


-- name: GetAllPosts :many
SELECT id, title, score
FROM posts;

-- name: GetAllComments :many
SELECT id, body, score, post_id
FROM comments;

-- name: BulkInsertGraphNode :exec
INSERT INTO graph_nodes (
    id,
    name,
    val,
    type
) VALUES (
    $1, $2, $3, $4
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    val = EXCLUDED.val,
    type = EXCLUDED.type,
    updated_at = now();

-- name: CreateGraphLink :one
INSERT INTO graph_links (
    source,
    target
) VALUES (
    $1, $2
) RETURNING *;

-- name: ClearGraphTables :exec
TRUNCATE TABLE graph_nodes, graph_links;

INSERT INTO graph_nodes (id, name, val, type)
VALUES ($1, $2, $3, $4);

-- name: BulkInsertGraphLink :exec
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

-- name: CreateSubredditRelationship :one
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

-- name: ListUsersWithActivity :many
SELECT
    u.id,
    u.username,
    COALESCE(p.post_count, 0) + COALESCE(c.comment_count, 0) AS total_activity
FROM users u
LEFT JOIN (
    SELECT author_id, CAST(COUNT(*) AS BIGINT) AS post_count
    FROM posts
    GROUP BY author_id
) p ON p.author_id = u.id
LEFT JOIN (
    SELECT author_id, CAST(COUNT(*) AS BIGINT) AS comment_count
    FROM comments
    GROUP BY author_id
) c ON c.author_id = u.id
ORDER BY total_activity DESC, u.id;

-- name: ListGraphNodesByWeight :many
SELECT id, name, val, type
FROM graph_nodes gn
ORDER BY (
    CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
) DESC NULLS LAST, gn.id
LIMIT $1;

-- name: ListGraphLinksAmong :many
SELECT source, target
FROM graph_links
WHERE source = ANY($1::text[]) AND target = ANY($1::text[]);

-- name: UpdateGraphNodePositions :exec
UPDATE graph_nodes g
SET pos_x = u.x, pos_y = u.y, pos_z = u.z, updated_at = now()
FROM (
    SELECT unnest($1::text[]) AS id,
           unnest($2::double precision[]) AS x,
           unnest($3::double precision[]) AS y,
           unnest($4::double precision[]) AS z
) AS u
WHERE g.id = u.id;

-- ============================================================
-- Community Detection Queries
-- ============================================================

-- name: ClearCommunityTables :exec
TRUNCATE TABLE graph_communities CASCADE;

-- name: CreateCommunity :one
INSERT INTO graph_communities (
    label,
    size,
    modularity
) VALUES (
    $1, $2, $3
) RETURNING *;

-- name: CreateCommunityMember :exec
INSERT INTO graph_community_members (
    community_id,
    node_id
) VALUES (
    $1, $2
) ON CONFLICT (community_id, node_id) DO NOTHING;

-- name: CreateCommunityLink :exec
INSERT INTO graph_community_links (
    source_community_id,
    target_community_id,
    weight
) VALUES (
    $1, $2, $3
) ON CONFLICT (source_community_id, target_community_id)
DO UPDATE SET weight = EXCLUDED.weight;

-- name: GetAllCommunities :many
SELECT * FROM graph_communities
ORDER BY size DESC;

-- name: GetCommunity :one
SELECT * FROM graph_communities
WHERE id = $1;

-- name: GetCommunityMembers :many
SELECT node_id FROM graph_community_members
WHERE community_id = $1;

-- name: GetCommunitySupernodesWithPositions :many
WITH community_stats AS (
    SELECT 
        gc.id,
        gc.label,
        gc.size,
        gc.modularity,
        AVG(gn.pos_x) as avg_x,
        AVG(gn.pos_y) as avg_y,
        AVG(gn.pos_z) as avg_z
    FROM graph_communities gc
    LEFT JOIN graph_community_members gcm ON gc.id = gcm.community_id
    LEFT JOIN graph_nodes gn ON gcm.node_id = gn.id
    GROUP BY gc.id, gc.label, gc.size, gc.modularity
)
SELECT 
    'node' as data_type,
    CAST('community_' || id AS TEXT) as id,
    label as name,
    CAST(size AS TEXT) as val,
    'community' as type,
    avg_x as pos_x,
    avg_y as pos_y,
    avg_z as pos_z,
    NULL as source,
    NULL as target
FROM community_stats
ORDER BY size DESC;

-- name: GetCommunityLinks :many
SELECT
    'link' as data_type,
    CAST(gcl.source_community_id || '_' || gcl.target_community_id AS TEXT) as id,
    NULL as name,
    CAST(gcl.weight AS TEXT) as val,
    NULL as type,
    NULL as pos_x,
    NULL as pos_y,
    NULL as pos_z,
    CAST('community_' || gcl.source_community_id AS TEXT) as source,
    CAST('community_' || gcl.target_community_id AS TEXT) as target
FROM graph_community_links gcl
ORDER BY gcl.weight DESC
LIMIT $1;

-- name: GetCommunitySubgraph :many
WITH member_nodes AS (
    SELECT node_id FROM graph_community_members
    WHERE community_id = $1
)
SELECT
    'node' as data_type,
    gn.id,
    gn.name,
    CAST(gn.val AS TEXT) as val,
    gn.type,
    gn.pos_x,
    gn.pos_y,
    gn.pos_z,
    NULL as source,
    NULL as target
FROM graph_nodes gn
WHERE gn.id IN (SELECT node_id FROM member_nodes)
UNION ALL
SELECT
    'link' as data_type,
    CAST(gl.id AS TEXT),
    NULL as name,
    CAST(NULL AS TEXT) as val,
    NULL as type,
    NULL as pos_x,
    NULL as pos_y,
    NULL as pos_z,
    gl.source,
    gl.target
FROM graph_links gl
WHERE gl.source IN (SELECT node_id FROM member_nodes)
    AND gl.target IN (SELECT node_id FROM member_nodes)
ORDER BY data_type, id
LIMIT $2;