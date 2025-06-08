-- name: GetAllPosts :many
SELECT * FROM posts;

-- name: GetAllComments :many
SELECT * FROM comments;

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
DELETE FROM graph_nodes;
DELETE FROM graph_links;

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