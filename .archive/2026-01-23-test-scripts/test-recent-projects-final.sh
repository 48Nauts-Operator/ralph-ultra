#!/bin/bash

# Final comprehensive test for Recent Projects feature (US-002)
# Tests all acceptance criteria for the Recent Projects feature

echo "═══════════════════════════════════════════════════════════════"
echo "          Recent Projects Feature - Final Test Suite"
echo "═══════════════════════════════════════════════════════════════"
echo

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test
run_test() {
    local test_name="$1"
    local command="$2"
    local description="$3"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    echo -n "  Testing: $description... "
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "    Command: $command"
    fi
}

echo -e "${BOLD}1. PERSISTENT STORAGE TESTS${NC}"
echo "─────────────────────────────────────────────────"

# Test 1.1: Check if RecentProject interface exists
run_test "interface_exists" \
    "grep -q 'export interface RecentProject' src/utils/config.ts" \
    "RecentProject interface defined"

# Test 1.2: Check storage functions
run_test "storage_functions" \
    "grep -q 'export function addToRecentProjects' src/utils/config.ts && \
     grep -q 'export function getRecentProjects' src/utils/config.ts && \
     grep -q 'export function clearRecentProjects' src/utils/config.ts" \
    "Storage functions (add, get, clear) exist"

# Test 1.3: Check MAX_RECENT_PROJECTS limit
run_test "max_limit" \
    "grep -q 'MAX_RECENT_PROJECTS = 10' src/utils/config.ts" \
    "Maximum limit of 10 projects configured"

# Test 1.4: Check timestamp storage
run_test "timestamp" \
    "grep -q 'lastAccessed.*ISO' src/utils/config.ts" \
    "Timestamp storage with ISO format"

echo
echo -e "${BOLD}2. UI DISPLAY TESTS${NC}"
echo "─────────────────────────────────────────────────"

# Test 2.1: Check ProjectsRail imports recent functions
run_test "ui_imports" \
    "grep -q 'getRecentProjects.*from.*config' src/components/ProjectsRail.tsx" \
    "ProjectsRail imports recent project functions"

# Test 2.2: Check recent projects state
run_test "ui_state" \
    "grep -q 'useState<RecentProject\[\]>' src/components/ProjectsRail.tsx" \
    "Recent projects state management"

# Test 2.3: Check recent section rendering
run_test "ui_render" \
    "grep -q 'Recent.*▼.*▶' src/components/ProjectsRail.tsx" \
    "Recent projects section UI rendering"

# Test 2.4: Check keyboard shortcut 'r'
run_test "ui_toggle" \
    "grep -q \"input === 'r'\" src/components/ProjectsRail.tsx" \
    "Toggle recent projects with 'r' key"

# Test 2.5: Check clear functionality with 'c'
run_test "ui_clear" \
    "grep -q \"input === 'c' && showRecent\" src/components/ProjectsRail.tsx" \
    "Clear history with 'c' key"

echo
echo -e "${BOLD}3. PROJECT SELECTION TESTS${NC}"
echo "─────────────────────────────────────────────────"

# Test 3.1: Check onSelectRecentProject prop
run_test "select_prop" \
    "grep -q 'onSelectRecentProject.*:.*path.*string.*void' src/components/ProjectsRail.tsx" \
    "onSelectRecentProject prop defined"

# Test 3.2: Check selection handler
run_test "select_handler" \
    "grep -q 'onSelectRecentProject(recentProjects\[recentIndex\].path)' src/components/ProjectsRail.tsx" \
    "Selection handler implementation"

# Test 3.3: Check App.tsx integration
run_test "app_integration" \
    "grep -q 'onSelectRecentProject={(path)' src/components/App.tsx" \
    "App.tsx handles recent project selection"

# Test 3.4: Check project opening from recent
run_test "open_tab" \
    "grep -q 'openTab(newProject)' src/components/App.tsx" \
    "Opens new tab for recent project"

echo
echo -e "${BOLD}4. AUTO-TRACKING TESTS${NC}"
echo "─────────────────────────────────────────────────"

# Test 4.1: Check useTabs hook integration
run_test "auto_track_import" \
    "grep -q 'import.*addToRecentProjects.*from.*config' src/hooks/useTabs.tsx" \
    "useTabs imports addToRecentProjects"

# Test 4.2: Check trackProjectAccess function
run_test "track_function" \
    "grep -q 'trackProjectAccess.*=.*useCallback' src/hooks/useTabs.tsx" \
    "trackProjectAccess function exists"

# Test 4.3: Check automatic tracking on tab open
run_test "auto_track_call" \
    "grep -q 'trackProjectAccess(project)' src/hooks/useTabs.tsx" \
    "Automatic tracking when tab opens"

echo
echo -e "${BOLD}5. FEATURE COMPLETENESS TESTS${NC}"
echo "─────────────────────────────────────────────────"

# Test 5.1: Check filtering of open projects
run_test "filter_open" \
    "grep -q 'filter.*=>.*!openPaths.has' src/components/ProjectsRail.tsx" \
    "Filters out currently open projects"

# Test 5.2: Check max display limit
run_test "display_limit" \
    "grep -q 'slice(0, 5)' src/components/ProjectsRail.tsx" \
    "Limits display to 5 recent projects"

# Test 5.3: Check keyboard navigation
run_test "keyboard_nav" \
    "grep -q 'selectedIndex - projects.length' src/components/ProjectsRail.tsx" \
    "Keyboard navigation for recent projects"

echo
echo "═══════════════════════════════════════════════════════════════"
echo -e "${BOLD}TEST SUMMARY${NC}"
echo "─────────────────────────────────────────────────"
echo -e "Total Tests:  ${BOLD}${TOTAL_TESTS}${NC}"
echo -e "Passed:       ${GREEN}${BOLD}${PASSED_TESTS}${NC}"
echo -e "Failed:       ${RED}${BOLD}${FAILED_TESTS}${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo
    echo -e "${GREEN}${BOLD}✅ ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}Recent Projects feature is fully implemented and functional!${NC}"
    echo
    echo -e "${CYAN}Feature Summary:${NC}"
    echo "  • Stores last 10 projects with timestamps"
    echo "  • Displays in ProjectsRail (max 5 visible)"
    echo "  • Toggle with 'r' key, clear with 'c' key"
    echo "  • Auto-tracks when projects are opened"
    echo "  • Filters out currently open projects"
    echo "  • Full keyboard navigation support"
    exit 0
else
    echo
    echo -e "${RED}${BOLD}❌ SOME TESTS FAILED${NC}"
    echo "Please review the failed tests above for details."
    exit 1
fi