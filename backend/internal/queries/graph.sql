-- name: GetPrecalculatedGraphData :many
SELECT
    'node' as data_type,
    id,
    name,
    val,
    type,
    NULL as source,
    NULL as target
FROM graph_nodes
UNION ALL
SELECT
    'link' as data_type,
    id::text,
    NULL as name,
    NULL as val,
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

-- name: BulkInsertGraphLink :exec
INSERT INTO graph_links (source, target)
VALUES ($1, $2);

-- name: GetGraphData :many
SELECT 
    'node'::TEXT as data_type,
    id::TEXT as id,
    name,
    val::TEXT as val,
    type
FROM graph_nodes
UNION ALL
SELECT 
    'link'::TEXT as data_type,
    source::TEXT as id,
    target::TEXT as name,
    '1'::TEXT as val,
    'connection'::TEXT as type
FROM graph_links; 