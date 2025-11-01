#!/bin/bash
# profile_cpu.sh
# Collect CPU profile from a running API server
#
# Usage:
#   ./profile_cpu.sh [duration_seconds] [output_file]
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
DURATION="${1:-30}"
OUTPUT="${2:-cpu.prof}"
API_URL="${API_URL:-http://localhost:8000}"
ADMIN_TOKEN="${ADMIN_API_TOKEN}"

if [ -z "$ADMIN_TOKEN" ]; then
    echo "Error: ADMIN_API_TOKEN not set"
    echo "Set it in .env or pass via environment"
    exit 1
fi

echo "Collecting CPU profile..."
echo "Duration: ${DURATION}s"
echo "Output: $OUTPUT"
echo ""

# Collect profile
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
    -o "$OUTPUT" \
    "${API_URL}/debug/pprof/profile?seconds=${DURATION}"

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
echo "  top       - Show top functions by CPU time"
echo "  list <fn> - Show source code for function"
echo "  web       - Open interactive web UI (requires graphviz)"
echo "  pdf       - Generate PDF visualization (requires graphviz)"
echo ""
echo "Web UI:"
echo "  go tool pprof -http=:8080 $OUTPUT"
