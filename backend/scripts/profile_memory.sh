#!/bin/bash
# profile_memory.sh
# Collect memory profile from a running API server
#
# Usage:
#   ./profile_memory.sh [output_file]
#
# Requires:
#   - ADMIN_API_TOKEN environment variable or .env file
#   - go tool pprof installed
#   - ENABLE_PROFILING=true in server config

set -e

# Load .env if it exists (safe parser: only export lines matching KEY=VALUE, ignore comments/commands)
if [ -f .env ]; then
    while IFS= read -r line; do
        # Skip comments and blank lines
        if [[ "$line" =~ ^[[:space:]]*# ]] || [[ "$line" =~ ^[[:space:]]*$ ]]; then
            continue
        fi
        # Only export lines that look like KEY=VALUE (no spaces, no shell metacharacters)
        if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
            export "$line"
        fi
    done < .env
fi

# Configuration
OUTPUT="${1:-heap.prof}"
API_URL="${API_URL:-http://localhost:8000}"
ADMIN_TOKEN="${ADMIN_API_TOKEN}"

if [ -z "$ADMIN_TOKEN" ]; then
    echo "Error: ADMIN_API_TOKEN not set"
    echo "Set it in .env or pass via environment"
    exit 1
fi

echo "Collecting memory (heap) profile..."
echo "Output: $OUTPUT"
echo ""

# Collect profile
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
    -o "$OUTPUT" \
    "${API_URL}/debug/pprof/heap"

if [ ! -f "$OUTPUT" ]; then
    echo "Error: Failed to collect profile"
    exit 1
fi

echo ""
echo "Profile saved to: $OUTPUT"
echo ""
echo "To analyze the profile:"
echo "  go tool pprof $OUTPUT"
echo ""
echo "Common pprof commands:"
echo "  top                - Show top functions by memory allocation"
echo "  top -cum           - Show top functions by cumulative allocation"
echo "  list <fn>          - Show source code for function"
echo "  web                - Open interactive web UI (requires graphviz)"
echo "  -alloc_space       - Show total allocation (default)"
echo "  -alloc_objects     - Show allocation counts"
echo "  -inuse_space       - Show currently in-use memory"
echo "  -inuse_objects     - Show currently in-use object counts"
echo ""
echo "Web UI:"
echo "  go tool pprof -http=:8080 $OUTPUT"
echo ""
echo "Compare two profiles:"
echo "  go tool pprof -base=baseline.prof current.prof"
