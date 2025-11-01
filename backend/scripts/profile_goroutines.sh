#!/bin/bash
# profile_goroutines.sh
# Collect goroutine profile from a running API server
#
# Usage:
#   ./profile_goroutines.sh [output_file]
#
# Requires:
#   - ADMIN_API_TOKEN environment variable or .env file
#   - go tool pprof installed
#   - ENABLE_PROFILING=true in server config

set -e

# Load .env if it exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Configuration
OUTPUT="${1:-goroutine.prof}"
API_URL="${API_URL:-http://localhost:8000}"
ADMIN_TOKEN="${ADMIN_API_TOKEN}"

if [ -z "$ADMIN_TOKEN" ]; then
    echo "Error: ADMIN_API_TOKEN not set"
    echo "Set it in .env or pass via environment"
    exit 1
fi

echo "Collecting goroutine profile..."
echo "Output: $OUTPUT"
echo ""

# Collect profile
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
    -o "$OUTPUT" \
    "${API_URL}/debug/pprof/goroutine"

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
echo "  top       - Show top functions by goroutine count"
echo "  list <fn> - Show source code for function"
echo "  web       - Open interactive web UI (requires graphviz)"
echo "  traces    - Show goroutine stack traces"
echo ""
echo "Web UI:"
echo "  go tool pprof -http=:8080 $OUTPUT"
echo ""
echo "Text output of goroutines:"
echo "  go tool pprof -text $OUTPUT"
