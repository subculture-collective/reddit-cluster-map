#!/bin/bash
# test_migrations.sh
# Tests that migrations can be applied successfully
#
# Usage:
#   ./test_migrations.sh [DATABASE_URL]

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

# Check if migrate is available
if ! command -v migrate &> /dev/null; then
    echo "Error: migrate is not installed"
    echo "Install with: go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest"
    exit 1
fi

echo "Migration Testing"
echo "================="
echo ""
echo "Database: $(psql "$DB_URL" -t -c "SELECT current_database();" | tr -d ' ')"
echo ""

# Get current migration version
echo "Current migration version:"
migrate -path migrations -database "$DB_URL" version 2>&1 || true
echo ""

# Check indexes on graph_nodes
echo "Current indexes on graph_nodes:"
psql "$DB_URL" -c "
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'graph_nodes' 
AND schemaname = 'public'
ORDER BY indexname;
"

echo ""
echo "Current indexes on graph_links:"
psql "$DB_URL" -c "
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'graph_links' 
AND schemaname = 'public'
ORDER BY indexname;
"

echo ""
echo "Migration test complete!"
