-- name: GetPrecalculatedGraphData :many
SELECT
    data_type,
    node_id as id,
    node_name as name,
    node_value as val,
    node_type as type,
    source,
    target
FROM graph_data
ORDER BY id; 