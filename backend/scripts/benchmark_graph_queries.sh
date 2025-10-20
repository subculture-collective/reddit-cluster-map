#!/bin/bash
# benchmark_graph_queries.sh
# Benchmark graph query performance for precalculated graph data queries
#
# Usage:
#   ./benchmark_graph_queries.sh [DATABASE_URL]
#
# If DATABASE_URL is not provided, it will be read from environment or .env file

set -e

# Load .env if it exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

DB_URL="${1:-${DATABASE_URL:-postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}?sslmode=disable}}"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "Error: psql is not installed"
    exit 1
fi

# Check database connection
if ! psql "$DB_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo "Error: Cannot connect to database"
    echo "URL: $DB_URL"
    exit 1
fi

echo "Graph Query Performance Benchmark"
echo "=================================="
echo ""
echo "Database: $(psql "$DB_URL" -t -c "SELECT current_database();" | tr -d ' ')"
echo "Node count: $(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM graph_nodes;" | tr -d ' ')"
echo "Link count: $(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM graph_links;" | tr -d ' ')"
echo ""

# Helper function to run a query multiple times and extract timing
run_benchmark() {
    local name="$1"
    local query="$2"
    local iterations="${3:-5}"
    
    echo "Running: $name"
    echo "Iterations: $iterations"
    
    local sum=0
    local count=0
    
    for i in $(seq 1 $iterations); do
        # Run EXPLAIN ANALYZE and extract execution time
        local result=$(psql "$DB_URL" -t -c "EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON) $query" 2>&1 | grep "Execution Time" | grep -oP '\d+\.\d+')
        
        if [ -n "$result" ]; then
            echo "  Run $i: ${result}ms"
            sum=$(echo "$sum + $result" | bc)
            count=$((count + 1))
        else
            echo "  Run $i: Failed to extract timing"
        fi
    done
    
    if [ $count -gt 0 ]; then
        local avg=$(echo "scale=3; $sum / $count" | bc)
        echo "  Average: ${avg}ms"
    else
        echo "  Average: N/A (no successful runs)"
    fi
    echo ""
}

# Test 1: Full query - Select top nodes and their links
echo "Test 1: GetPrecalculatedGraphDataCappedAll"
echo "-------------------------------------------"
run_benchmark "Top 20K nodes + 50K links" \
"WITH sel_nodes AS (
    SELECT gn.id, gn.name, gn.val, gn.type, gn.pos_x, gn.pos_y, gn.pos_z
    FROM graph_nodes gn
    ORDER BY (
        CASE WHEN gn.val ~ '^[0-9]+\$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
    ) DESC NULLS LAST, gn.id
    LIMIT 20000
), sel_links AS (
    SELECT id, source, target
    FROM graph_links gl
    WHERE gl.source IN (SELECT id FROM sel_nodes)
        AND gl.target IN (SELECT id FROM sel_nodes)
    LIMIT 50000
)
SELECT COUNT(*) FROM sel_nodes
UNION ALL
SELECT COUNT(*) FROM sel_links;"

# Test 2: Filtered query - Select nodes of specific types
echo "Test 2: GetPrecalculatedGraphDataCappedFiltered"
echo "------------------------------------------------"
run_benchmark "Top 20K subreddit+user nodes + 50K links" \
"WITH sel_nodes AS (
    SELECT gn.id, gn.name, gn.val, gn.type, gn.pos_x, gn.pos_y, gn.pos_z
    FROM graph_nodes gn
    WHERE gn.type IS NOT NULL AND gn.type = ANY(ARRAY['subreddit', 'user'])
    ORDER BY (
        CASE WHEN gn.val ~ '^[0-9]+\$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
    ) DESC NULLS LAST, gn.id
    LIMIT 20000
), sel_links AS (
    SELECT id, source, target
    FROM graph_links gl
    WHERE gl.source IN (SELECT id FROM sel_nodes)
        AND gl.target IN (SELECT id FROM sel_nodes)
    LIMIT 50000
)
SELECT COUNT(*) FROM sel_nodes
UNION ALL
SELECT COUNT(*) FROM sel_links;"

# Test 3: Node selection only (no links)
echo "Test 3: Node Selection Only"
echo "---------------------------"
run_benchmark "Top 20K nodes" \
"SELECT COUNT(*)
FROM (
    SELECT gn.id
    FROM graph_nodes gn
    ORDER BY (
        CASE WHEN gn.val ~ '^[0-9]+\$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
    ) DESC NULLS LAST, gn.id
    LIMIT 20000
) AS nodes;"

# Test 4: Link selection with pre-selected node set
echo "Test 4: Link Selection Between Nodes"
echo "------------------------------------"
run_benchmark "Links between top 10K nodes" \
"WITH sel_nodes AS (
    SELECT gn.id
    FROM graph_nodes gn
    ORDER BY (
        CASE WHEN gn.val ~ '^[0-9]+\$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
    ) DESC NULLS LAST, gn.id
    LIMIT 10000
)
SELECT COUNT(*)
FROM graph_links gl
WHERE gl.source IN (SELECT id FROM sel_nodes)
    AND gl.target IN (SELECT id FROM sel_nodes);"

# Test 5: Type-filtered node selection
echo "Test 5: Type-Filtered Node Selection"
echo "------------------------------------"
run_benchmark "Top 10K subreddit nodes" \
"SELECT COUNT(*)
FROM (
    SELECT gn.id
    FROM graph_nodes gn
    WHERE gn.type = 'subreddit'
    ORDER BY (
        CASE WHEN gn.val ~ '^[0-9]+\$' THEN CAST(gn.val AS BIGINT) ELSE 0 END
    ) DESC NULLS LAST, gn.id
    LIMIT 10000
) AS nodes;"

echo ""
echo "Benchmark Summary"
echo "================="
echo ""
echo "Index Usage Statistics:"
psql "$DB_URL" -c "
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
"

echo ""
echo "Table Statistics:"
psql "$DB_URL" -c "
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    last_vacuum,
    last_analyze
FROM pg_stat_user_tables
WHERE tablename IN ('graph_nodes', 'graph_links')
ORDER BY tablename;
"

echo ""
echo "Benchmark complete!"
echo ""
echo "To run EXPLAIN ANALYZE on a specific query, use:"
echo "  psql \"$DB_URL\" -c \"EXPLAIN (ANALYZE, BUFFERS, VERBOSE) <your-query>\""
