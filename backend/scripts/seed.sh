#!/usr/bin/env bash
# Seed script - populate the database with sample crawl jobs

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
TIMEOUT=10

# Sample subreddits to seed
SUBREDDITS=(
    "AskReddit"
    "programming"
    "golang"
    "webdev"
    "dataisbeautiful"
)

echo "🌱 Seeding database with sample crawl jobs"
echo "API: ${API_URL}"
echo ""

# Check if API is reachable
echo -n "Checking API connectivity... "
if ! curl -s --max-time ${TIMEOUT} "${API_URL}/api/graph?max_nodes=1&max_links=1" > /dev/null 2>&1; then
    echo -e "${RED}✗${NC}"
    echo "Error: API is not reachable at ${API_URL}"
    echo "Make sure the API server is running with: docker compose up -d api"
    exit 1
fi
echo -e "${GREEN}✓${NC}"

# Submit crawl jobs
echo ""
echo "Submitting crawl jobs..."
for sub in "${SUBREDDITS[@]}"; do
    echo -n "  - ${sub}... "
    RESPONSE=$(curl -s --max-time ${TIMEOUT} -X POST "${API_URL}/api/crawl" \
        -H "Content-Type: application/json" \
        -d "{\"subreddit\": \"${sub}\"}" -w "\n%{http_code}" 2>&1)
    
    # Separate response body and status code
    HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    # Check if request was successful (status 200-299)
    if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠${NC} (HTTP $HTTP_CODE, Response: ${HTTP_BODY})"
    fi
done

echo ""
echo -e "${GREEN}✓ Seeding complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Check crawl job status: curl ${API_URL}/jobs"
echo "  2. Wait for crawler to process jobs (monitor with: make logs-crawler)"
echo "  3. Generate graph: make precalculate"
echo "  4. View graph: open your frontend at http://localhost (or your configured domain)"
