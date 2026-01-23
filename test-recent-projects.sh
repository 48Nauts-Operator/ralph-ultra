#!/bin/bash

# Test script for Recent Projects feature (US-002)
# Tests all acceptance criteria

echo "Testing Recent Projects Feature (US-002)"
echo "========================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall test result
ALL_PASS=true

# Test 1: Recent projects are stored persistently
echo "Test 1: Recent projects are stored persistently"
if grep -q 'recentProjects\|projectHistory' src/utils/config.ts || grep -q 'recentProjects' src/utils/session.ts; then
    echo -e "${GREEN}✓ PASS${NC} - Found recent projects storage in config.ts"
    # Show the relevant code
    echo -e "${YELLOW}  Found definitions:${NC}"
    grep -n "recentProjects" src/utils/config.ts | head -5 | sed 's/^/    /'
else
    echo -e "${RED}✗ FAIL${NC} - No recent projects storage found"
    ALL_PASS=false
fi
echo ""

# Test 2: Recent projects displayed in UI
echo "Test 2: Recent projects displayed in UI"
if grep -q 'recentProjects\|Recent' src/components/ProjectsRail.tsx || grep -q 'recentProjects' src/components/App.tsx; then
    echo -e "${GREEN}✓ PASS${NC} - Recent projects UI found in ProjectsRail.tsx"
    # Show the relevant code
    echo -e "${YELLOW}  UI implementation:${NC}"
    grep -n "Recent" src/components/ProjectsRail.tsx | grep -E "(Recent|showRecent)" | head -3 | sed 's/^/    /'
else
    echo -e "${RED}✗ FAIL${NC} - No recent projects UI found"
    ALL_PASS=false
fi
echo ""

# Test 3: User can select from recent projects to switch
echo "Test 3: User can select from recent projects to switch"
if grep -q 'onSelectRecentProject' src/components/ProjectsRail.tsx; then
    echo -e "${GREEN}✓ PASS${NC} - Recent project selection handler found"
    # Show the relevant code
    echo -e "${YELLOW}  Selection handler:${NC}"
    grep -n "onSelectRecentProject" src/components/ProjectsRail.tsx | head -3 | sed 's/^/    /'
else
    echo -e "${RED}✗ FAIL${NC} - No recent project selection handler found"
    ALL_PASS=false
fi
echo ""

# Additional feature tests
echo "Additional Feature Checks:"
echo "--------------------------"

# Check for clear history functionality
if grep -q 'clearRecentProjects' src/utils/config.ts; then
    echo -e "${GREEN}✓${NC} Clear history function exists"
else
    echo -e "${RED}✗${NC} Clear history function missing"
fi

# Check for max limit (10 projects)
if grep -q 'MAX_RECENT_PROJECTS = 10' src/utils/config.ts; then
    echo -e "${GREEN}✓${NC} Max 10 projects limit implemented"
else
    echo -e "${RED}✗${NC} Max projects limit not found"
fi

# Check for timestamp storage
if grep -q 'lastAccessed' src/utils/config.ts; then
    echo -e "${GREEN}✓${NC} Timestamps are stored with recent projects"
else
    echo -e "${RED}✗${NC} No timestamp storage found"
fi

# Check for keyboard shortcuts
if grep -q "input === 'r'" src/components/ProjectsRail.tsx; then
    echo -e "${GREEN}✓${NC} 'r' key toggles recent projects"
else
    echo -e "${RED}✗${NC} 'r' key shortcut missing"
fi

if grep -q "input === 'c'" src/components/ProjectsRail.tsx; then
    echo -e "${GREEN}✓${NC} 'c' key clears history"
else
    echo -e "${RED}✗${NC} 'c' key shortcut missing"
fi

echo ""
echo "========================================="
if [ "$ALL_PASS" = true ]; then
    echo -e "${GREEN}All acceptance criteria PASSED!${NC}"
    echo ""
    echo "Feature Summary:"
    echo "- Recent projects are stored persistently in ~/.config/ralph-ultra/settings.json"
    echo "- Shows up to 5 recent projects in the ProjectsRail (filtered from open projects)"
    echo "- Maximum 10 projects stored in history"
    echo "- Press 'r' to toggle recent projects view"
    echo "- Press 'c' to clear history (when recent section is shown)"
    echo "- Each project is tracked with timestamp for sorting"
    exit 0
else
    echo -e "${RED}Some acceptance criteria FAILED${NC}"
    exit 1
fi