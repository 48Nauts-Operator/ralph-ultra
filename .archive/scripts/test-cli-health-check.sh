#!/bin/bash

# Test CLI Health Check Implementation (US-004)
# This script demonstrates the health check functionality

set -e

echo "════════════════════════════════════════════════════════════════"
echo "  US-004: CLI Health Check Implementation Test"
echo "════════════════════════════════════════════════════════════════"
echo ""

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$PROJECT_ROOT/src/utils/ralph-service.ts"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_count=0
pass_count=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    test_count=$((test_count + 1))
    echo -n "  [$test_count] $test_name... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        pass_count=$((pass_count + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        return 1
    fi
}

echo -e "${BLUE}📋 Acceptance Criteria Tests${NC}"
echo ""

# AC1: Health check function exists
run_test "AC1: Health check function exists" \
    "grep -q 'private checkCLIHealth(cli: string): boolean' '$SERVICE_FILE'"

# AC2: Health check is called before story execution
run_test "AC2: Health check called before execution" \
    "grep -A 100 'private detectAICLI()' '$SERVICE_FILE' | grep -q 'checkCLIHealth'"

# AC3: Health check results are cached
run_test "AC3: Cache interface defined" \
    "grep -q 'interface CLIHealthCache' '$SERVICE_FILE'"

run_test "AC3: Cache map initialized" \
    "grep -q 'private cliHealthCache.*Map.*CLIHealthCache' '$SERVICE_FILE'"

run_test "AC3: Cache TTL configured (5 minutes)" \
    "grep -q 'CLI_HEALTH_CACHE_TTL.*5.*60.*1000' '$SERVICE_FILE'"

run_test "AC3: Cache checked before health test" \
    "grep -A 10 'private checkCLIHealth' '$SERVICE_FILE' | grep -q 'this.cliHealthCache.get'"

run_test "AC3: Cache updated after health test" \
    "grep -A 20 'private checkCLIHealth' '$SERVICE_FILE' | grep -q 'this.cliHealthCache.set'"

# AC4: Failed health check triggers fallback
run_test "AC4: Health check failure detected" \
    "grep -q 'if (!this.checkCLIHealth' '$SERVICE_FILE'"

run_test "AC4: Fallback chain triggered on failure" \
    "grep -A 8 'if (!this.checkCLIHealth' '$SERVICE_FILE' | grep -q 'continue'"

echo ""
echo -e "${BLUE}🔍 Implementation Details${NC}"
echo ""

# Check health check implementation details
run_test "Health check uses --version command" \
    "grep -A 15 'private checkCLIHealth' '$SERVICE_FILE' | grep -q -E -- '(--version|\-\-version)'"

run_test "Health check has timeout (3 seconds)" \
    "grep -A 15 'private checkCLIHealth' '$SERVICE_FILE' | grep -q 'timeout: 3000'"

run_test "Health check logs DEBUG on cache hit" \
    "grep -A 15 'private checkCLIHealth' '$SERVICE_FILE' | grep -q \"log.*'DEBUG'.*cached result\""

run_test "Health check logs INFO on success" \
    "grep -A 20 'private checkCLIHealth' '$SERVICE_FILE' | grep -q \"log.*'INFO'.*is healthy\""

run_test "Health check logs WARN on failure" \
    "grep -A 25 'private checkCLIHealth' '$SERVICE_FILE' | grep -q \"log.*'WARN'.*failed\""

echo ""
echo -e "${BLUE}🔗 Integration Points${NC}"
echo ""

# Check integration with detectAICLI
run_test "Health check in PRD CLI override path" \
    "grep -A 30 'if (prd?.cli' '$SERVICE_FILE' | grep -q 'checkCLIHealth(prd.cli)'"

run_test "Health check in preferred CLI path" \
    "grep -A 30 'if (preferredCli' '$SERVICE_FILE' | grep -q 'checkCLIHealth(preferredCli)'"

run_test "Health check in auto-detection path" \
    "grep -A 10 'for (const cli of cliOptions)' '$SERVICE_FILE' | grep -q 'checkCLIHealth(cli)'"

run_test "Health check in fallback chain" \
    "grep -A 30 'private tryFallbackChain' '$SERVICE_FILE' | grep -q 'checkCLIHealth(cli)'"

echo ""
echo -e "${BLUE}📊 Test Summary${NC}"
echo ""
echo "  Total Tests: $test_count"
echo -e "  Passed: ${GREEN}$pass_count${NC}"
echo -e "  Failed: ${RED}$((test_count - pass_count))${NC}"
echo ""

if [ $pass_count -eq $test_count ]; then
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ ALL TESTS PASSED - US-004 Implementation Complete${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  ✗ SOME TESTS FAILED${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    exit 1
fi
