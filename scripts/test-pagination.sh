#!/bin/bash
# Example script demonstrating the paginated graph API

API_URL="${API_URL:-http://localhost:8000}"
PAGE_SIZE="${PAGE_SIZE:-1000}"

echo "=== Fetching Graph Data with Pagination ==="
echo "API URL: $API_URL"
echo "Page Size: $PAGE_SIZE"
echo ""

# Fetch first page
echo "Fetching first page..."
RESPONSE=$(curl -s "${API_URL}/api/graph?page_size=${PAGE_SIZE}")

# Extract pagination info using jq if available
if command -v jq &> /dev/null; then
    echo "First page results:"
    echo "  Nodes: $(echo "$RESPONSE" | jq '.nodes | length')"
    echo "  Links: $(echo "$RESPONSE" | jq '.links | length')"
    echo "  Has more: $(echo "$RESPONSE" | jq '.pagination.has_more')"
    
    NEXT_CURSOR=$(echo "$RESPONSE" | jq -r '.pagination.next_cursor // empty')
    
    if [ -n "$NEXT_CURSOR" ]; then
        echo ""
        echo "Fetching second page with cursor..."
        RESPONSE2=$(curl -s "${API_URL}/api/graph?page_size=${PAGE_SIZE}&cursor=${NEXT_CURSOR}")
        
        echo "Second page results:"
        echo "  Nodes: $(echo "$RESPONSE2" | jq '.nodes | length')"
        echo "  Links: $(echo "$RESPONSE2" | jq '.links | length')"
        echo "  Has more: $(echo "$RESPONSE2" | jq '.pagination.has_more')"
    else
        echo "No more pages available."
    fi
else
    echo "Install 'jq' to see formatted output"
    echo "$RESPONSE" | head -c 500
    echo "..."
fi

echo ""
echo "=== Example with Type Filtering ==="
echo "Fetching users only..."
curl -s "${API_URL}/api/graph?page_size=100&types=user" | \
    if command -v jq &> /dev/null; then
        jq '{node_count: (.nodes | length), sample_node: .nodes[0]}'
    else
        head -c 300
    fi

echo ""
echo "=== Example with Positions ==="
echo "Fetching with positions..."
curl -s "${API_URL}/api/graph?page_size=10&with_positions=true" | \
    if command -v jq &> /dev/null; then
        jq '{nodes: [.nodes[] | {id, x, y, z}] | .[0:3]}'
    else
        head -c 300
    fi
