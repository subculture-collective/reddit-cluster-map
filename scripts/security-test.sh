#!/bin/bash

# Security Testing Script
# Automated security testing for Reddit Cluster Map

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8080}"
ADMIN_TOKEN="${ADMIN_API_TOKEN:-test-admin-token}"
RESULTS_DIR="./security-test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${RESULTS_DIR}/security-test-${TIMESTAMP}.log"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNINGS=0

# Create results directory
mkdir -p "${RESULTS_DIR}"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "${REPORT_FILE}"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" | tee -a "${REPORT_FILE}"
    ((PASSED_TESTS++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1" | tee -a "${REPORT_FILE}"
    ((FAILED_TESTS++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "${REPORT_FILE}"
    ((WARNINGS++))
}

# Test helper function
run_test() {
    local test_name="$1"
    ((TOTAL_TESTS++))
    log_info "Running: ${test_name}"
}

# Check if API is running
check_api_health() {
    log_info "Checking API health..."
    if curl -s -f "${API_URL}/health" > /dev/null 2>&1; then
        log_success "API is running and healthy"
        return 0
    else
        log_fail "API is not responding at ${API_URL}"
        return 1
    fi
}

# ============================================================================
# Authentication & Authorization Tests
# ============================================================================

test_admin_auth() {
    log_info ""
    log_info "=== Authentication & Authorization Tests ==="
    
    # Test 1: Admin endpoint without token
    run_test "Admin endpoint rejects request without token"
    response=$(curl -s -w "%{http_code}" -o /dev/null "${API_URL}/api/admin/services")
    if [ "$response" = "401" ]; then
        log_success "Correctly rejected unauthorized request (401)"
    else
        log_fail "Expected 401, got ${response}"
    fi
    
    # Test 2: Admin endpoint with invalid token
    run_test "Admin endpoint rejects invalid token"
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearer invalid-token-12345" \
        "${API_URL}/api/admin/services")
    if [ "$response" = "401" ]; then
        log_success "Correctly rejected invalid token (401)"
    else
        log_fail "Expected 401, got ${response}"
    fi
    
    # Test 3: Admin endpoint with valid token
    run_test "Admin endpoint accepts valid token"
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        "${API_URL}/api/admin/services")
    if [ "$response" = "200" ] || [ "$response" = "503" ]; then
        log_success "Valid token accepted (${response})"
    else
        log_fail "Expected 200 or 503, got ${response}"
    fi
    
    # Test 4: Malformed authorization header
    run_test "Admin endpoint rejects malformed auth header"
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Authorization: InvalidScheme token" \
        "${API_URL}/api/admin/services")
    if [ "$response" = "401" ]; then
        log_success "Correctly rejected malformed header (401)"
    else
        log_fail "Expected 401, got ${response}"
    fi
    
    # Test 5: Bearer token without space
    run_test "Admin endpoint rejects bearer token without space"
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearertoken" \
        "${API_URL}/api/admin/services")
    if [ "$response" = "401" ]; then
        log_success "Correctly rejected malformed bearer (401)"
    else
        log_fail "Expected 401, got ${response}"
    fi
}

# ============================================================================
# Input Validation Tests
# ============================================================================

test_input_validation() {
    log_info ""
    log_info "=== Input Validation Tests ==="
    
    # Test 1: SQL injection in query parameters
    run_test "SQL injection protection in query params"
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        "${API_URL}/api/graph?max_nodes=' OR '1'='1")
    if [ "$response" = "400" ] || [ "$response" = "200" ]; then
        log_success "SQL injection attempt handled safely (${response})"
    else
        log_warn "Unexpected response to SQL injection: ${response}"
    fi
    
    # Test 2: XSS in query parameters
    run_test "XSS protection in query params"
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        "${API_URL}/api/graph?test=<script>alert('XSS')</script>")
    if [ "$response" != "500" ]; then
        log_success "XSS attempt handled safely (${response})"
    else
        log_fail "Server error on XSS attempt (500)"
    fi
    
    # Test 3: Negative values
    run_test "Negative value validation"
    response=$(curl -s "${API_URL}/api/graph?max_nodes=-1")
    if echo "$response" | grep -qi "error\|invalid"; then
        log_success "Negative values rejected"
    else
        log_warn "Negative values may not be properly validated"
    fi
    
    # Test 4: Extremely large values
    run_test "Large value validation"
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        "${API_URL}/api/graph?max_nodes=999999999999999")
    if [ "$response" = "400" ] || [ "$response" = "200" ]; then
        log_success "Large values handled (${response})"
    else
        log_warn "Unexpected response to large value: ${response}"
    fi
    
    # Test 5: Invalid data types
    run_test "Invalid data type validation"
    response=$(curl -s "${API_URL}/api/graph?max_nodes=abc")
    if echo "$response" | grep -qi "error\|invalid"; then
        log_success "Invalid data types rejected"
    else
        log_warn "Invalid data types may not be properly validated"
    fi
    
    # Test 6: Path traversal
    run_test "Path traversal protection"
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        "${API_URL}/api/admin/backups/../../../etc/passwd")
    if [ "$response" = "400" ] || [ "$response" = "404" ]; then
        log_success "Path traversal blocked (${response})"
    else
        log_warn "Path traversal may not be properly blocked: ${response}"
    fi
}

# ============================================================================
# Rate Limiting Tests
# ============================================================================

test_rate_limiting() {
    log_info ""
    log_info "=== Rate Limiting Tests ==="
    
    # Test 1: Rapid requests to trigger rate limit
    run_test "Global rate limiting"
    rate_limited=false
    for i in {1..15}; do
        response=$(curl -s -w "%{http_code}" -o /dev/null "${API_URL}/api/graph")
        if [ "$response" = "429" ]; then
            rate_limited=true
            break
        fi
        sleep 0.05
    done
    
    if [ "$rate_limited" = true ]; then
        log_success "Rate limiting is enforced (429 Too Many Requests)"
    else
        log_warn "Rate limiting may not be active or threshold not reached"
    fi
    
    # Wait for rate limit to reset
    sleep 2
}

# ============================================================================
# Security Headers Tests
# ============================================================================

test_security_headers() {
    log_info ""
    log_info "=== Security Headers Tests ==="
    
    headers=$(curl -s -I "${API_URL}/api/graph")
    
    # Test 1: X-Content-Type-Options
    run_test "X-Content-Type-Options header"
    if echo "$headers" | grep -qi "X-Content-Type-Options.*nosniff"; then
        log_success "X-Content-Type-Options: nosniff is set"
    else
        log_fail "X-Content-Type-Options header missing or incorrect"
    fi
    
    # Test 2: X-Frame-Options
    run_test "X-Frame-Options header"
    if echo "$headers" | grep -qi "X-Frame-Options.*DENY"; then
        log_success "X-Frame-Options: DENY is set"
    else
        log_fail "X-Frame-Options header missing or incorrect"
    fi
    
    # Test 3: Content-Security-Policy
    run_test "Content-Security-Policy header"
    if echo "$headers" | grep -qi "Content-Security-Policy"; then
        log_success "Content-Security-Policy header is set"
    else
        log_fail "Content-Security-Policy header missing"
    fi
    
    # Test 4: Referrer-Policy
    run_test "Referrer-Policy header"
    if echo "$headers" | grep -qi "Referrer-Policy"; then
        log_success "Referrer-Policy header is set"
    else
        log_warn "Referrer-Policy header missing"
    fi
    
    # Test 5: Permissions-Policy
    run_test "Permissions-Policy header"
    if echo "$headers" | grep -qi "Permissions-Policy"; then
        log_success "Permissions-Policy header is set"
    else
        log_warn "Permissions-Policy header missing"
    fi
}

# ============================================================================
# CORS Tests
# ============================================================================

test_cors() {
    log_info ""
    log_info "=== CORS Tests ==="
    
    # Test 1: CORS with allowed origin
    run_test "CORS allows configured origins"
    response=$(curl -s -H "Origin: http://localhost:5173" \
        -I "${API_URL}/api/graph")
    if echo "$response" | grep -qi "Access-Control-Allow-Origin"; then
        log_success "CORS headers present for allowed origin"
    else
        log_warn "CORS may not be configured"
    fi
    
    # Test 2: CORS preflight
    run_test "CORS preflight handling"
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -X OPTIONS \
        -H "Origin: http://localhost:5173" \
        -H "Access-Control-Request-Method: POST" \
        "${API_URL}/api/crawl")
    if [ "$response" = "200" ] || [ "$response" = "204" ]; then
        log_success "CORS preflight handled (${response})"
    else
        log_warn "CORS preflight response unexpected: ${response}"
    fi
}

# ============================================================================
# Information Disclosure Tests
# ============================================================================

test_information_disclosure() {
    log_info ""
    log_info "=== Information Disclosure Tests ==="
    
    # Test 1: Error messages
    run_test "Error messages don't expose sensitive data"
    response=$(curl -s "${API_URL}/api/nonexistent")
    if echo "$response" | grep -qi "stack\|debug\|internal"; then
        log_fail "Error messages may expose sensitive information"
    else
        log_success "Error messages appear safe"
    fi
    
    # Test 2: Version disclosure
    run_test "Version information disclosure"
    headers=$(curl -s -I "${API_URL}/")
    if echo "$headers" | grep -qi "server:"; then
        server_header=$(echo "$headers" | grep -i "server:" | cut -d: -f2)
        log_warn "Server header disclosed: ${server_header}"
    else
        log_success "Server version not disclosed"
    fi
}

# ============================================================================
# API Endpoint Tests
# ============================================================================

test_api_endpoints() {
    log_info ""
    log_info "=== API Endpoint Security Tests ==="
    
    # Test 1: Health endpoint (should be public)
    run_test "Health endpoint is accessible"
    response=$(curl -s -w "%{http_code}" -o /dev/null "${API_URL}/health")
    if [ "$response" = "200" ]; then
        log_success "Health endpoint accessible (200)"
    else
        log_warn "Health endpoint returned: ${response}"
    fi
    
    # Test 2: Metrics endpoint (should have some protection)
    run_test "Metrics endpoint security"
    response=$(curl -s -w "%{http_code}" -o /dev/null "${API_URL}/metrics")
    if [ "$response" = "200" ]; then
        log_warn "Metrics endpoint is publicly accessible - consider protection"
    else
        log_success "Metrics endpoint has access control (${response})"
    fi
    
    # Test 3: Graph endpoint
    run_test "Graph endpoint is accessible"
    response=$(curl -s -w "%{http_code}" -o /dev/null "${API_URL}/api/graph")
    if [ "$response" = "200" ]; then
        log_success "Graph endpoint accessible (200)"
    else
        log_fail "Graph endpoint not accessible: ${response}"
    fi
}

# ============================================================================
# Main execution
# ============================================================================

main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Reddit Cluster Map - Security Testing${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    log_info "Starting security tests at $(date)"
    log_info "API URL: ${API_URL}"
    log_info "Results: ${REPORT_FILE}"
    echo ""
    
    # Check if API is running
    if ! check_api_health; then
        log_fail "API is not available. Please start the API server first."
        exit 1
    fi
    
    # Run test suites based on arguments
    if [ "$1" = "--suite" ]; then
        case "$2" in
            auth)
                test_admin_auth
                ;;
            input)
                test_input_validation
                ;;
            rate-limit)
                test_rate_limiting
                ;;
            headers)
                test_security_headers
                ;;
            cors)
                test_cors
                ;;
            info)
                test_information_disclosure
                ;;
            api)
                test_api_endpoints
                ;;
            *)
                echo "Unknown suite: $2"
                echo "Available suites: auth, input, rate-limit, headers, cors, info, api"
                exit 1
                ;;
        esac
    else
        # Run all tests
        test_admin_auth
        test_input_validation
        test_rate_limiting
        test_security_headers
        test_cors
        test_information_disclosure
        test_api_endpoints
    fi
    
    # Print summary
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Test Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "Total Tests: ${TOTAL_TESTS}"
    echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
    echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"
    echo -e "${YELLOW}Warnings: ${WARNINGS}${NC}"
    echo ""
    
    if [ $FAILED_TESTS -gt 0 ]; then
        echo -e "${RED}Security tests FAILED${NC}"
        echo -e "Review the report: ${REPORT_FILE}"
        exit 1
    elif [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}Security tests passed with WARNINGS${NC}"
        echo -e "Review the report: ${REPORT_FILE}"
        exit 0
    else
        echo -e "${GREEN}All security tests PASSED${NC}"
        exit 0
    fi
}

# Run main function
main "$@"
