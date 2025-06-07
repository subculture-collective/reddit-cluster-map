-- name: GetGraphData :many
WITH post_nodes AS (
    SELECT 
        id as node_id,
        title as node_name,
        score as node_value,
        'post' as node_type
    FROM posts
),
comment_nodes AS (
    SELECT 
        id as node_id,
        LEFT(body, 50) as node_name,
        score as node_value,
        'comment' as node_type
    FROM comments
),
all_nodes AS (
    SELECT * FROM post_nodes
    UNION ALL
    SELECT * FROM comment_nodes
),
post_comment_links AS (
    SELECT 
        post_id as source,
        id as target
    FROM comments
),
user_links AS (
    SELECT DISTINCT
        p1.id as source,
        p2.id as target
    FROM posts p1
    JOIN posts p2 ON p1.author = p2.author AND p1.id < p2.id
    UNION
    SELECT DISTINCT
        c1.id as source,
        c2.id as target
    FROM comments c1
    JOIN comments c2 ON c1.author = c2.author AND c1.id < c2.id
    UNION
    SELECT DISTINCT
        p.id as source,
        c.id as target
    FROM posts p
    JOIN comments c ON p.author = c.author
)
SELECT 
    'node' as data_type,
    node_id as id,
    node_name as name,
    node_value as val,
    node_type as type
FROM all_nodes
UNION ALL
SELECT 
    'link' as data_type,
    source as id,
    target as name,
    1 as val,
    'connection' as type
FROM post_comment_links
UNION ALL
SELECT 
    'link' as data_type,
    source as id,
    target as name,
    1 as val,
    'user' as type
FROM user_links; 