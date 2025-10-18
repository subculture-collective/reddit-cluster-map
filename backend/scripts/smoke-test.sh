#!/usr/bin/env bash
# Smoke test script - performs basic health checks on the API

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
TIMEOUT=5

echo "🔍 Running smoke tests against ${API_URL}"
echo ""

# Check if API is reachable
echo -n "Testing API connectivity... "
if curl -s --max-time ${TIMEOUT} "${API_URL}/api/graph?max_nodes=1&max_links=1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo "Error: API is not reachable at ${API_URL}"
    exit 1
fi

# Test graph endpoint
echo -n "Testing /api/graph endpoint... "
RESPONSE=$(curl -s --max-time ${TIMEOUT} "${API_URL}/api/graph?max_nodes=10&max_links=10")
if echo "$RESPONSE" | grep -q '"nodes"' && echo "$RESPONSE" | grep -q '"links"'; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo "Error: /api/graph did not return expected format"
    echo "Response: $RESPONSE"
    exit 1
fi

# Test subreddits endpoint
echo -n "Testing /subreddits endpoint... "
if curl -s --max-time ${TIMEOUT} "${API_URL}/subreddits" | grep -q '\[' 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} (might be empty)"
fi

# Test users endpoint
echo -n "Testing /users endpoint... "
if curl -s --max-time ${TIMEOUT} "${API_URL}/users" | grep -q '\[' 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} (might be empty)"
fi

# Test posts endpoint
echo -n "Testing /posts endpoint... "
if curl -s --max-time ${TIMEOUT} "${API_URL}/posts" | grep -q '\[' 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} (might be empty)"
fi

# Test comments endpoint
echo -n "Testing /comments endpoint... "
if curl -s --max-time ${TIMEOUT} "${API_URL}/comments" | grep -q '\[' 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} (might be empty)"
fi

# Test jobs endpoint
echo -n "Testing /jobs endpoint... "
if curl -s --max-time ${TIMEOUT} "${API_URL}/jobs" | grep -q '\[' 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} (might be empty)"
fi

echo ""
echo -e "${GREEN}✓ All smoke tests passed!${NC}"
