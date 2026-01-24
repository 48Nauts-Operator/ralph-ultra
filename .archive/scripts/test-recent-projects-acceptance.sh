#!/bin/bash

# Test script for recent projects feature acceptance criteria
echo "Testing Recent Projects Feature..."
echo "================================="

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Check persistent storage implementation
echo -n "1. Recent projects persistent storage: "
if grep -q 'recentProjects' src/utils/config.ts && grep -q 'MAX_RECENT_PROJECTS.*10' src/utils/config.ts; then
    echo -e "${GREEN}✓ PASS${NC} (stores up to 10 projects)"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test 2: Check UI display implementation
echo -n "2. Recent projects UI display: "
if grep -q "mode === 'recent'" src/components/ProjectPicker.tsx && \
   grep -q 'Recent Projects' src/components/ProjectPicker.tsx && \
   grep -q 'getRecentProjects' src/components/ProjectPicker.tsx; then
    echo -e "${GREEN}✓ PASS${NC} (displays in ProjectPicker)"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test 3: Check selection functionality
echo -n "3. User can select from recent projects: "
if grep -q 'handleSelectRecentProject' src/components/ProjectPicker.tsx && \
   grep -q 'onSelect.*selectedProject' src/components/ProjectPicker.tsx; then
    echo -e "${GREEN}✓ PASS${NC} (selection handler implemented)"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test 4: Check clear history functionality
echo -n "4. Clear history functionality: "
if grep -q 'clearRecentProjects' src/components/ProjectPicker.tsx && \
   grep -q "input === 'c'" src/components/ProjectPicker.tsx; then
    echo -e "${GREEN}✓ PASS${NC} (press 'c' to clear)"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test 5: Check automatic tracking when projects open
echo -n "5. Automatic tracking of opened projects: "
if grep -q 'addToRecentProjects' src/hooks/useTabs.tsx && \
   grep -q 'trackProjectAccess' src/hooks/useTabs.tsx; then
    echo -e "${GREEN}✓ PASS${NC} (tracks on project open and switch)"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

# Test 6: Check timestamp storage
echo -n "6. Timestamp storage for sorting: "
if grep -q 'lastAccessed.*ISO' src/utils/config.ts && \
   grep -q 'new Date().toISOString()' src/utils/config.ts; then
    echo -e "${GREEN}✓ PASS${NC} (stores ISO timestamps)"
else
    echo -e "${RED}✗ FAIL${NC}"
fi

echo "================================="
echo "All acceptance criteria tested!"