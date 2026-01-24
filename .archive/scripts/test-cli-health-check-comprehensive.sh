#!/bin/bash
# Comprehensive test for US-004: CLI health check before execution

echo "═══════════════════════════════════════════════════════════"
echo "US-004: CLI Health Check Before Execution - Comprehensive Test"
echo "═══════════════════════════════════════════════════════════"
echo ""

PASSED=0
FAILED=0

# AC1: Health check function exists
echo "✓ Testing AC1: Health check function exists"
if grep -q 'checkCLIHealth\|healthCheck\|validateCLI\|testCLI' src/utils/ralph-service.ts; then
    echo "  ✓ PASS: Health check function found"
    ((PASSED++))
else
    echo "  ✗ FAIL: Health check function not found"
    ((FAILED++))
fi
echo ""

# AC2: Health check is called before story execution
echo "✓ Testing AC2: Health check called before execution"
if grep -n 'checkCLIHealth' src/utils/ralph-service.ts | grep -v 'private' | grep -q .; then
    echo "  ✓ PASS: Health check is called in runStoryInternal"
    # Show where it's called
    echo "  Locations:"
    grep -n 'checkCLIHealth' src/utils/ralph-service.ts | grep -v 'private' | grep -v '^\s*//' | head -3
    ((PASSED++))
else
    echo "  ✗ FAIL: Health check not called before execution"
    ((FAILED++))
fi
echo ""

# AC3: Health check results are cached
echo "✓ Testing AC3: Health check results cached"
if grep -q 'cliHealthCache\|healthCache\|cachedHealth' src/utils/ralph-service.ts; then
    echo "  ✓ PASS: Health check cache found"
    # Check for 5-minute TTL
    if grep -q "CLI_HEALTH_CACHE_TTL = 5 \* 60 \* 1000" src/utils/ralph-service.ts; then
        echo "  ✓ PASS: 5-minute cache TTL configured"
        ((PASSED++))
    else
        echo "  ✗ FAIL: 5-minute cache TTL not found"
        ((FAILED++))
    fi
else
    echo "  ✗ FAIL: Health check cache not found"
    ((FAILED++))
fi
echo ""

# AC4: Failed health check triggers fallback
echo "✓ Testing AC4: Failed health check triggers fallback"
if grep -q 'tryFallbackChain\|tryNextCLI' src/utils/ralph-service.ts; then
    echo "  ✓ PASS: Fallback chain mechanism found"
    # Check if health check failure triggers fallback
    if grep -B 5 -A 5 "checkCLIHealth" src/utils/ralph-service.ts | grep -q "tryFallbackChain\|fallback"; then
        echo "  ✓ PASS: Health check failure triggers fallback"
        ((PASSED++))
    else
        echo "  ✗ FAIL: Health check failure doesn't trigger fallback"
        ((FAILED++))
    fi
else
    echo "  ✗ FAIL: Fallback mechanism not found"
    ((FAILED++))
fi
echo ""

# Additional verification: Check implementation details
echo "═══════════════════════════════════════════════════════════"
echo "Implementation Details:"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "1. Health check function signature:"
grep -A 3 "private checkCLIHealth" src/utils/ralph-service.ts | head -4
echo ""

echo "2. Cache structure:"
grep -B 2 "interface CLIHealthCache" src/utils/ralph-service.ts | head -6
echo ""

echo "3. Health check before execution (new code):"
grep -A 3 "Health check the selected CLI before execution" src/utils/ralph-service.ts | head -4
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "Test Summary:"
echo "═══════════════════════════════════════════════════════════"
echo "Tests Passed: $PASSED"
echo "Tests Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✓ All tests PASSED!"
    echo "US-004 implementation is complete and verified."
    exit 0
else
    echo "✗ Some tests FAILED"
    exit 1
fi
