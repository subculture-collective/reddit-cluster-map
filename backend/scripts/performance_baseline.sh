#!/bin/bash
# performance_baseline.sh
# Collect comprehensive performance baseline for the application
#
# This script:
# 1. Runs Go benchmarks
# 2. Runs database query benchmarks
# 3. Collects runtime profiles (if server is running)
# 4. Generates a baseline report
#
# Usage:
#   ./performance_baseline.sh [output_dir]

set -e

# Load .env if it exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Configuration
OUTPUT_DIR="${1:-./performance_baseline_$(date +%Y%m%d_%H%M%S)}"
API_URL="${API_URL:-http://localhost:8000}"

echo "Performance Baseline Collection"
echo "==============================="
echo "Output directory: $OUTPUT_DIR"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check if server is running
SERVER_RUNNING=false
if curl -s -f "${API_URL}/health" > /dev/null 2>&1; then
    SERVER_RUNNING=true
    echo "✓ API server is running at $API_URL"
else
    echo "⚠ API server is not running at $API_URL"
    echo "  Runtime profiles will be skipped"
fi
echo ""

# 1. Go Benchmarks
echo "1. Running Go Benchmarks"
echo "------------------------"
echo "This may take several minutes..."
echo ""

go test -bench=. -benchmem -benchtime=5s ./... > "$OUTPUT_DIR/go_benchmarks.txt" 2>&1
echo "✓ Go benchmarks saved to: $OUTPUT_DIR/go_benchmarks.txt"
echo ""

# Extract key benchmark results
echo "Key Benchmark Results:"
grep "^Benchmark" "$OUTPUT_DIR/go_benchmarks.txt" | grep -E "(Cache|Graph|Serialization)" | head -10
echo ""

# 2. Database Query Benchmarks
if command -v psql &> /dev/null && [ ! -z "$DATABASE_URL" ] || [ ! -z "$POSTGRES_PASSWORD" ]; then
    echo "2. Running Database Query Benchmarks"
    echo "------------------------------------"
    ./scripts/benchmark_graph_queries.sh > "$OUTPUT_DIR/db_benchmarks.txt" 2>&1 || true
    echo "✓ Database benchmarks saved to: $OUTPUT_DIR/db_benchmarks.txt"
    echo ""
else
    echo "2. Skipping Database Query Benchmarks (psql not available or DB not configured)"
    echo ""
fi

# 3. Runtime Profiles (if server is running and profiling is enabled)
if [ "$SERVER_RUNNING" = true ] && [ ! -z "$ADMIN_API_TOKEN" ] && [ "$ENABLE_PROFILING" = "true" ]; then
    echo "3. Collecting Runtime Profiles"
    echo "------------------------------"
    
    # CPU Profile
    echo "Collecting CPU profile (30s)..."
    ./scripts/profile_cpu.sh 30 "$OUTPUT_DIR/cpu_baseline.prof" > /dev/null 2>&1 || true
    if [ -f "$OUTPUT_DIR/cpu_baseline.prof" ]; then
        echo "✓ CPU profile saved to: $OUTPUT_DIR/cpu_baseline.prof"
        # Generate text report
        go tool pprof -text "$OUTPUT_DIR/cpu_baseline.prof" > "$OUTPUT_DIR/cpu_baseline_report.txt" 2>&1 || true
    fi
    
    # Memory Profile
    echo "Collecting memory profile..."
    ./scripts/profile_memory.sh "$OUTPUT_DIR/heap_baseline.prof" > /dev/null 2>&1 || true
    if [ -f "$OUTPUT_DIR/heap_baseline.prof" ]; then
        echo "✓ Memory profile saved to: $OUTPUT_DIR/heap_baseline.prof"
        # Generate text report
        go tool pprof -text "$OUTPUT_DIR/heap_baseline.prof" > "$OUTPUT_DIR/heap_baseline_report.txt" 2>&1 || true
    fi
    
    # Goroutine Profile
    echo "Collecting goroutine profile..."
    ./scripts/profile_goroutines.sh "$OUTPUT_DIR/goroutine_baseline.prof" > /dev/null 2>&1 || true
    if [ -f "$OUTPUT_DIR/goroutine_baseline.prof" ]; then
        echo "✓ Goroutine profile saved to: $OUTPUT_DIR/goroutine_baseline.prof"
        # Generate text report
        go tool pprof -text "$OUTPUT_DIR/goroutine_baseline.prof" > "$OUTPUT_DIR/goroutine_baseline_report.txt" 2>&1 || true
    fi
    echo ""
else
    echo "3. Skipping Runtime Profiles"
    if [ "$SERVER_RUNNING" = false ]; then
        echo "   Reason: Server not running"
    elif [ -z "$ADMIN_API_TOKEN" ]; then
        echo "   Reason: ADMIN_API_TOKEN not set"
    elif [ "$ENABLE_PROFILING" != "true" ]; then
        echo "   Reason: ENABLE_PROFILING not set to true"
    fi
    echo ""
fi

# 4. System Information
echo "4. Collecting System Information"
echo "--------------------------------"

cat > "$OUTPUT_DIR/system_info.txt" << EOF
System Information
==================

Date: $(date)
Host: $(hostname)
Go Version: $(go version)
OS: $(uname -s)
Architecture: $(uname -m)
EOF

if command -v nproc &> /dev/null; then
    echo "CPU Cores: $(nproc)" >> "$OUTPUT_DIR/system_info.txt"
fi

if command -v free &> /dev/null; then
    echo "" >> "$OUTPUT_DIR/system_info.txt"
    echo "Memory:" >> "$OUTPUT_DIR/system_info.txt"
    free -h >> "$OUTPUT_DIR/system_info.txt"
fi

if [ "$SERVER_RUNNING" = true ]; then
    echo "" >> "$OUTPUT_DIR/system_info.txt"
    echo "Server Health:" >> "$OUTPUT_DIR/system_info.txt"
    curl -s "${API_URL}/health" >> "$OUTPUT_DIR/system_info.txt" 2>&1 || echo "Failed to get health" >> "$OUTPUT_DIR/system_info.txt"
fi

echo "✓ System information saved to: $OUTPUT_DIR/system_info.txt"
echo ""

# 5. Generate Summary Report
echo "5. Generating Summary Report"
echo "---------------------------"

cat > "$OUTPUT_DIR/README.md" << 'EOF'
# Performance Baseline Report

This directory contains performance baseline measurements for the Reddit Cluster Map application.

## Contents

- `go_benchmarks.txt` - Go benchmark test results
- `db_benchmarks.txt` - Database query benchmark results (if available)
- `cpu_baseline.prof` - CPU profile snapshot (if available)
- `cpu_baseline_report.txt` - CPU profile text report (if available)
- `heap_baseline.prof` - Memory/heap profile snapshot (if available)
- `heap_baseline_report.txt` - Memory profile text report (if available)
- `goroutine_baseline.prof` - Goroutine profile snapshot (if available)
- `goroutine_baseline_report.txt` - Goroutine profile text report (if available)
- `system_info.txt` - System configuration and runtime information
- `README.md` - This file

## Analyzing Results

### Go Benchmarks

View the full results:
```bash
cat go_benchmarks.txt
```

Key metrics to examine:
- Operations per second (higher is better)
- Nanoseconds per operation (lower is better)
- Bytes allocated per operation (lower is better)
- Allocations per operation (lower is better)

### Database Benchmarks

View the full results:
```bash
cat db_benchmarks.txt
```

Look for:
- Execution times for common queries
- Index usage statistics
- Table statistics

### Runtime Profiles

#### CPU Profile

Interactive analysis:
```bash
go tool pprof -http=:8080 cpu_baseline.prof
```

Text report (top functions):
```bash
go tool pprof -top cpu_baseline.prof
```

#### Memory Profile

Interactive analysis:
```bash
go tool pprof -http=:8080 heap_baseline.prof
```

Show in-use memory:
```bash
go tool pprof -inuse_space heap_baseline.prof
```

Show total allocations:
```bash
go tool pprof -alloc_space heap_baseline.prof
```

#### Goroutine Profile

View goroutine stacks:
```bash
go tool pprof -text goroutine_baseline.prof
```

Interactive analysis:
```bash
go tool pprof -http=:8080 goroutine_baseline.prof
```

## Comparing Baselines

To compare with a future baseline:

```bash
# CPU comparison
go tool pprof -base=baseline1/cpu_baseline.prof baseline2/cpu_baseline.prof

# Memory comparison
go tool pprof -base=baseline1/heap_baseline.prof baseline2/heap_baseline.prof

# Benchmark comparison (requires benchstat)
benchstat baseline1/go_benchmarks.txt baseline2/go_benchmarks.txt
```

## Continuous Monitoring

- Run baseline collection weekly
- Compare results to detect regressions
- Track trends over time
- Update optimization priorities based on findings

## Next Steps

1. Review all collected metrics
2. Identify performance bottlenecks
3. Prioritize optimization efforts
4. Implement improvements
5. Collect new baseline to verify improvements
EOF

echo "✓ Summary report saved to: $OUTPUT_DIR/README.md"
echo ""

# Final summary
echo "Baseline Collection Complete"
echo "============================"
echo ""
echo "Results saved to: $OUTPUT_DIR"
echo ""
echo "Files created:"
ls -lh "$OUTPUT_DIR/" | tail -n +2 | awk '{print "  " $9 " (" $5 ")"}'
echo ""
echo "To view the summary:"
echo "  cat $OUTPUT_DIR/README.md"
echo ""
echo "To analyze profiles:"
echo "  go tool pprof -http=:8080 $OUTPUT_DIR/cpu_baseline.prof"
echo "  go tool pprof -http=:8080 $OUTPUT_DIR/heap_baseline.prof"
