-- EXPLAIN ANALYZE queries for performance testing
-- Run these queries to see how the database executes the graph queries
-- and which indexes are being used.
--
-- Usage:
--   psql "$DATABASE_URL" -f explain_analyze_queries.sql
--
-- Or run individual queries:
--   psql "$DATABASE_URL" < explain_analyze_queries.sql
--
-- NOTE: These queries reflect the optimizations in migration 000023:
--   - EXISTS subqueries instead of IN
--   - Materialized CTE for node IDs
--   - Covering and hash indexes for faster lookups
--   - 5-second query timeout (enforced at application level)

\echo ''
\echo '========================================='
\echo 'Graph Query Performance Analysis'
\echo '========================================='
\echo ''

-- Check data size
\echo 'Dataset Size:'
\echo '-------------'
SELECT 
    'graph_nodes' as table_name,
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('graph_nodes')) as total_size
FROM graph_nodes
UNION ALL
SELECT 
    'graph_links',
    COUNT(*),
    pg_size_pretty(pg_total_relation_size('graph_links'))
FROM graph_links;

\echo ''
\echo '========================================='
\echo 'Query 1: GetPrecalculatedGraphDataCappedAll (OPTIMIZED)'
\echo '========================================='
\echo ''
\echo 'This query selects top 20,000 nodes by value and up to 50,000 links between them'
\echo 'Optimized with EXISTS subqueries (no statement timeout in query itself - set at connection level)'
\echo ''

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
WITH sel_nodes AS (
    SELECT gn.id, gn.name, gn.val, gn.type, gn.pos_x, gn.pos_y, gn.pos_z
    FROM graph_nodes gn
    ORDER BY (
        CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
    ) DESC NULLS LAST, gn.id
    LIMIT 20000
), sel_node_ids AS (
    -- Materialize just the IDs for efficient lookups
    SELECT id FROM sel_nodes
), sel_links AS (
    SELECT gl.id, gl.source, gl.target
    FROM graph_links gl
    WHERE EXISTS (SELECT 1 FROM sel_node_ids WHERE id = gl.source)
      AND EXISTS (SELECT 1 FROM sel_node_ids WHERE id = gl.target)
    LIMIT 50000
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
FROM sel_links l;

\echo ''
\echo '========================================='
\echo 'Query 2: GetPrecalculatedGraphDataCappedFiltered (OPTIMIZED)'
\echo '========================================='
\echo ''
\echo 'This query selects top 20,000 subreddit/user nodes and up to 50,000 links'
\echo 'Optimized with EXISTS subqueries (no statement timeout in query itself - set at connection level)'
\echo ''

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
WITH sel_nodes AS (
    SELECT gn.id, gn.name, gn.val, gn.type, gn.pos_x, gn.pos_y, gn.pos_z
    FROM graph_nodes gn
    WHERE gn.type IS NOT NULL AND gn.type = ANY(ARRAY['subreddit', 'user'])
    ORDER BY (
        CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
    ) DESC NULLS LAST, gn.id
    LIMIT 20000
), sel_node_ids AS (
    -- Materialize just the IDs for efficient lookups
    SELECT id FROM sel_nodes
), sel_links AS (
    SELECT gl.id, gl.source, gl.target
    FROM graph_links gl
    WHERE EXISTS (SELECT 1 FROM sel_node_ids WHERE id = gl.source)
      AND EXISTS (SELECT 1 FROM sel_node_ids WHERE id = gl.target)
    LIMIT 50000
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
FROM sel_links l;

\echo ''
\echo '========================================='
\echo 'Query 3: Node Selection (No Links)'
\echo '========================================='
\echo ''
\echo 'Test how efficiently we can select and order top nodes'
\echo ''

EXPLAIN (ANALYZE, BUFFERS)
SELECT gn.id, gn.name, gn.val, gn.type
FROM graph_nodes gn
ORDER BY (
    CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
) DESC NULLS LAST, gn.id
LIMIT 20000;

\echo ''
\echo '========================================='
\echo 'Query 4: Type-Filtered Node Selection'
\echo '========================================='
\echo ''
\echo 'Test type filtering with the partial index'
\echo ''

EXPLAIN (ANALYZE, BUFFERS)
SELECT gn.id, gn.name, gn.val, gn.type
FROM graph_nodes gn
WHERE gn.type = 'subreddit'
ORDER BY (
    CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
) DESC NULLS LAST, gn.id
LIMIT 10000;

\echo ''
\echo '========================================='
\echo 'Query 5: Link Selection Between Nodes'
\echo '========================================='
\echo ''
\echo 'Test how efficiently we find links between a set of nodes'
\echo ''

EXPLAIN (ANALYZE, BUFFERS)
WITH sel_nodes AS (
    SELECT gn.id
    FROM graph_nodes gn
    ORDER BY (
        CASE WHEN gn.val ~ '^[0-9]+$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
    ) DESC NULLS LAST, gn.id
    LIMIT 10000
)
SELECT gl.id, gl.source, gl.target
FROM graph_links gl
WHERE gl.source IN (SELECT id FROM sel_nodes)
    AND gl.target IN (SELECT id FROM sel_nodes)
LIMIT 25000;

\echo ''
\echo '========================================='
\echo 'Index Usage Statistics'
\echo '========================================='
\echo ''

SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename IN ('graph_nodes', 'graph_links')
ORDER BY tablename, idx_scan DESC;

\echo ''
\echo '========================================='
\echo 'Performance Analysis Complete'
\echo '========================================='
\echo ''
