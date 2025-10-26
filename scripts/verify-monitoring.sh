#!/bin/bash
# Integration test script for monitoring stack
# This script verifies that all monitoring components are properly configured

set -e

echo "🔍 Verifying monitoring configuration..."

# Check if required files exist
echo ""
echo "📁 Checking configuration files..."

REQUIRED_FILES=(
    "monitoring/prometheus/prometheus.yml"
    "monitoring/prometheus/alerts/reddit-cluster-map.yml"
    "monitoring/grafana/provisioning/datasources/prometheus.yml"
    "monitoring/grafana/provisioning/dashboards/default.yml"
    "monitoring/grafana/provisioning/dashboards/reddit-cluster-map-overview.json"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file (missing)"
        exit 1
    fi
done

# Verify Prometheus config syntax (requires promtool, optional)
echo ""
echo "🔧 Checking Prometheus configuration syntax..."
if command -v promtool &> /dev/null; then
    promtool check config monitoring/prometheus/prometheus.yml
    promtool check rules monitoring/prometheus/alerts/reddit-cluster-map.yml
    echo "  ✓ Prometheus configuration is valid"
else
    echo "  ⚠️  promtool not found, skipping validation (optional)"
fi

# Check docker-compose includes monitoring services
echo ""
echo "🐳 Verifying docker-compose configuration..."
cd backend
if grep -q "prometheus:" docker-compose.yml && grep -q "grafana:" docker-compose.yml; then
    echo "  ✓ Monitoring services defined in docker-compose.yml"
else
    echo "  ✗ Monitoring services missing in docker-compose.yml"
    exit 1
fi

# Verify volumes are defined
if grep -q "prometheus_data:" docker-compose.yml && grep -q "grafana_data:" docker-compose.yml; then
    echo "  ✓ Data volumes defined for persistence"
else
    echo "  ✗ Data volumes missing in docker-compose.yml"
    exit 1
fi

cd ..

# Check that metrics are exported
echo ""
echo "📊 Checking metrics implementation..."
if grep -q "GraphNodesTotal" backend/internal/metrics/metrics.go; then
    echo "  ✓ Graph metrics defined"
else
    echo "  ✗ Graph metrics missing"
    exit 1
fi

if grep -q "APIRequestDuration" backend/internal/metrics/metrics.go; then
    echo "  ✓ API metrics defined"
else
    echo "  ✗ API metrics missing"
    exit 1
fi

if grep -q "CrawlJobsPending" backend/internal/metrics/metrics.go; then
    echo "  ✓ Crawl job metrics defined"
else
    echo "  ✗ Crawl job metrics missing"
    exit 1
fi

# Check metrics collector integration
echo ""
echo "🔄 Checking metrics collector integration..."
if grep -q "metricsCollector" backend/internal/server/server.go; then
    echo "  ✓ Metrics collector integrated in server"
else
    echo "  ✗ Metrics collector not integrated"
    exit 1
fi

# Check SQL queries exist
echo ""
echo "📝 Checking metrics SQL queries..."
if [ -f "backend/internal/queries/metrics.sql" ]; then
    echo "  ✓ Metrics SQL queries defined"
else
    echo "  ✗ Metrics SQL queries missing"
    exit 1
fi

# Check documentation
echo ""
echo "📚 Checking documentation..."
if [ -f "docs/monitoring.md" ]; then
    echo "  ✓ Monitoring documentation exists"
else
    echo "  ✗ Monitoring documentation missing"
    exit 1
fi

if [ -f "monitoring/README.md" ]; then
    echo "  ✓ Monitoring README exists"
else
    echo "  ✗ Monitoring README missing"
    exit 1
fi

echo ""
echo "✅ All monitoring configuration checks passed!"
echo ""
echo "To start the monitoring stack:"
echo "  cd backend"
echo "  docker compose up -d"
echo ""
echo "Access the services at:"
echo "  - Prometheus: http://localhost:9090"
echo "  - Grafana: http://localhost:3000"
echo "  - Metrics: http://localhost:8000/metrics"
