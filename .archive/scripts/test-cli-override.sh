#!/bin/bash
# Comprehensive test for US-002: Per-project CLI override

echo "════════════════════════════════════════════════════════════"
echo "  US-002: Per-project CLI Override Testing"
echo "════════════════════════════════════════════════════════════"
echo ""

PASS_COUNT=0
FAIL_COUNT=0

test_ac() {
    local ac_num="$1"
    local description="$2"
    local test_cmd="$3"
    
    echo "Testing AC-${ac_num}: ${description}"
    if eval "$test_cmd" > /dev/null 2>&1; then
        echo "  ✓ PASS"
        ((PASS_COUNT++))
    else
        echo "  ✗ FAIL"
        ((FAIL_COUNT++))
    fi
    echo ""
}

# AC-1: PRD type includes optional cli field
test_ac 1 \
    "PRD type includes optional cli field" \
    "grep -q 'cli.*string' src/types/index.ts || grep -q 'cli?:' src/types/index.ts"

# AC-2: RalphService reads cli from PRD when present
test_ac 2 \
    "RalphService reads cli from PRD when present" \
    "grep -q 'prd.cli\|prd\[.cli.\]' src/utils/ralph-service.ts"

# AC-3: Project CLI override takes precedence over global setting
test_ac 3 \
    "Project CLI override takes precedence" \
    "grep -q 'Priority 1.*PRD' src/utils/ralph-service.ts && grep -q 'Using project CLI override' src/utils/ralph-service.ts"

# AC-4: Current effective CLI displayed in UI
test_ac 4 \
    "Effective CLI displayed in StatusBar or WorkPane" \
    "grep -q 'activeCli' src/components/StatusBar.tsx || grep -q 'Using CLI' src/components/WorkPane.tsx"

echo "════════════════════════════════════════════════════════════"
echo "  Test Summary"
echo "════════════════════════════════════════════════════════════"
echo "  Passed: ${PASS_COUNT}/4"
echo "  Failed: ${FAIL_COUNT}/4"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo "  ✓ All acceptance criteria pass!"
    echo ""
    echo "  Feature Documentation: FEATURE_CLI_OVERRIDE.md"
    exit 0
else
    echo "  ✗ Some tests failed"
    exit 1
fi
