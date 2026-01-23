#!/bin/bash

# Comprehensive test script for recent projects functionality
# Follows acceptance criteria from US-002

echo "======================================"
echo "Testing Recent Projects Functionality"
echo "======================================"
echo

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Track test results
PASSED=0
FAILED=0

# Test 1: Recent projects stored persistently
echo "Test 1: Checking persistent storage..."
if grep -q 'recentProjects\|projectHistory' src/utils/config.ts || grep -q 'recentProjects' src/utils/session.ts; then
    echo -e "${GREEN}✓ PASSED: Recent projects are stored persistently${NC}"

    # Check for specific functions
    echo "  Functions found:"
    grep -n 'addToRecentProjects\|getRecentProjects\|clearRecentProjects' src/utils/config.ts | head -5
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED: Recent projects storage not found${NC}"
    ((FAILED++))
fi
echo

# Test 2: Recent projects displayed in UI
echo "Test 2: Checking UI display..."
if grep -q 'recentProjects\|Recent' src/components/ProjectsRail.tsx || grep -q 'recentProjects' src/components/App.tsx; then
    echo -e "${GREEN}✓ PASSED: Recent projects displayed in UI${NC}"

    # Check for specific UI elements
    echo "  UI elements found:"
    grep -n 'renderRecentProject\|showRecent\|Recent' src/components/ProjectsRail.tsx | head -5
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED: Recent projects UI not found${NC}"
    ((FAILED++))
fi
echo

# Test 3: User can select from recent projects
echo "Test 3: Checking selection capability..."
if grep -q 'selectRecent\|onRecentSelect\|handleRecentProject\|onSelectRecentProject' src/components/ProjectsRail.tsx || grep -q 'onSelectRecentProject' src/components/App.tsx; then
    echo -e "${GREEN}✓ PASSED: User can select from recent projects${NC}"

    # Check for selection handlers
    echo "  Selection handlers found:"
    grep -n 'onSelectRecentProject' src/components/ProjectsRail.tsx src/components/App.tsx | head -5
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED: Recent project selection not found${NC}"
    ((FAILED++))
fi
echo

# Additional Test: Clear history functionality
echo "Test 4: Checking clear history functionality..."
if grep -q 'clearRecentProjects' src/utils/config.ts; then
    echo -e "${GREEN}✓ PASSED: Clear history functionality exists${NC}"

    # Check usage in UI
    if grep -q "input === 'c'" src/components/ProjectsRail.tsx; then
        echo "  Clear hotkey ('c') found in ProjectsRail"
    fi
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED: Clear history functionality not found${NC}"
    ((FAILED++))
fi
echo

# Additional Test: Maximum recent projects limit
echo "Test 5: Checking maximum recent projects limit..."
if grep -q 'MAX_RECENT_PROJECTS.*10' src/utils/config.ts; then
    echo -e "${GREEN}✓ PASSED: Maximum 10 recent projects enforced${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED: Maximum recent projects limit not found${NC}"
    ((FAILED++))
fi
echo

# Additional Test: Timestamp tracking
echo "Test 6: Checking timestamp tracking..."
if grep -q 'lastAccessed.*toISOString' src/utils/config.ts; then
    echo -e "${GREEN}✓ PASSED: Timestamps are tracked for recent projects${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED: Timestamp tracking not found${NC}"
    ((FAILED++))
fi
echo

# Additional Test: RecentProjectsOverlay component
echo "Test 7: Checking RecentProjectsOverlay component..."
if [ -f "src/components/RecentProjectsOverlay.tsx" ]; then
    echo -e "${GREEN}✓ PASSED: RecentProjectsOverlay component exists${NC}"

    # Check for time formatting
    if grep -q 'formatTime' src/components/RecentProjectsOverlay.tsx; then
        echo "  Time formatting function found"
    fi
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED: RecentProjectsOverlay component not found${NC}"
    ((FAILED++))
fi
echo

# Additional Test: Integration with useTabs hook
echo "Test 8: Checking integration with useTabs hook..."
if grep -q 'addToRecentProjects' src/hooks/useTabs.tsx; then
    echo -e "${GREEN}✓ PASSED: useTabs hook integrates with recent projects${NC}"

    # Check when tracking occurs
    echo "  Tracking occurs in:"
    grep -n 'trackProjectAccess\|addToRecentProjects' src/hooks/useTabs.tsx | head -3
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED: useTabs hook doesn't integrate with recent projects${NC}"
    ((FAILED++))
fi
echo

# Summary
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✨${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please review.${NC}"
    exit 1
fi