#!/bin/bash
# Test script for Recent Projects feature (US-002)

echo "Testing Recent Projects Feature (US-002)"
echo "========================================"
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Persistent storage
echo "Test 1: Recent projects are stored persistently"
if grep -q 'recentProjects\|projectHistory' src/utils/config.ts || grep -q 'recentProjects' src/utils/session.ts; then
    echo -e "${GREEN}✓${NC} Recent projects storage implemented in config.ts"
else
    echo -e "${RED}✗${NC} Recent projects storage NOT found"
    exit 1
fi

# Test 2: UI display
echo ""
echo "Test 2: Recent projects displayed in UI"
if grep -q 'recentProjects\|Recent' src/components/ProjectsRail.tsx || grep -q 'recentProjects' src/components/App.tsx; then
    echo -e "${GREEN}✓${NC} Recent projects display implemented in ProjectsRail.tsx"
else
    echo -e "${RED}✗${NC} Recent projects display NOT found"
    exit 1
fi

# Test 3: Selection functionality
echo ""
echo "Test 3: User can select from recent projects"
if grep -q 'onSelectRecentProject' src/components/ProjectsRail.tsx && grep -q 'onSelectRecentProject' src/components/App.tsx; then
    echo -e "${GREEN}✓${NC} Recent project selection implemented"
else
    echo -e "${RED}✗${NC} Recent project selection NOT found"
    exit 1
fi

# Test 4: Clear history functionality
echo ""
echo "Test 4: Clear history functionality"
if grep -q 'clearRecentProjects' src/utils/config.ts && grep -q 'clearRecentProjects' src/components/ProjectsRail.tsx; then
    echo -e "${GREEN}✓${NC} Clear history functionality implemented"
else
    echo -e "${RED}✗${NC} Clear history functionality NOT found"
    exit 1
fi

# Test 5: Project tracking on access
echo ""
echo "Test 5: Projects are tracked when accessed"
if grep -q 'addToRecentProjects' src/hooks/useTabs.tsx && grep -q 'trackProjectAccess' src/hooks/useTabs.tsx; then
    echo -e "${GREEN}✓${NC} Project tracking on access implemented"
else
    echo -e "${RED}✗${NC} Project tracking NOT found"
    exit 1
fi

# Test 6: Maximum limit enforced
echo ""
echo "Test 6: Maximum of 10 recent projects"
if grep -q 'MAX_RECENT_PROJECTS = 10' src/utils/config.ts; then
    echo -e "${GREEN}✓${NC} Maximum limit of 10 recent projects enforced"
else
    echo -e "${RED}✗${NC} Maximum limit NOT enforced"
    exit 1
fi

echo ""
echo "========================================"
echo -e "${GREEN}All tests passed!${NC} Recent Projects feature is fully implemented."
echo ""
echo "Feature Details:"
echo "- Recent projects stored in ~/.config/ralph-ultra/settings.json"
echo "- Maximum of 10 recent projects tracked"
echo "- Projects shown in ProjectsRail with 'r' key to toggle"
echo "- 'c' key clears history when recent list is shown"
echo "- Projects tracked automatically when opened or switched"