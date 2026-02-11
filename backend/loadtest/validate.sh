#!/bin/bash

# Validate all k6 load test scripts
# This script checks if all test scripts are syntactically valid

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Validating k6 load test scripts..."
echo ""

# Array of test scripts to validate
TESTS=(
    "smoke.js"
    "load.js"
    "stress.js"
    "soak.js"
)

# Validation results
PASSED=0
FAILED=0

# Validate each script
for test in "${TESTS[@]}"; do
    echo -n "Validating $test... "
    
    if docker run --rm -v "$(pwd)":/scripts grafana/k6 inspect /scripts/"$test" > /tmp/k6_validate_output.txt 2>&1; then
        echo "✓ PASS"
        ((PASSED++))
    else
        echo "✗ FAIL"
        ((FAILED++))
        # Show error details
        grep -A 5 "error" /tmp/k6_validate_output.txt || cat /tmp/k6_validate_output.txt
    fi
done

echo ""
echo "==> Validation Results"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✓ All tests are valid!"
    exit 0
else
    echo "✗ Some tests failed validation"
    exit 1
fi
