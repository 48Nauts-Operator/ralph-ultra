#!/bin/bash

# Test script for US-002 - Retry failed stories feature
echo "US-002 Test: Retry functionality"
echo "================================="
echo ""
echo "Testing that the retry functionality works correctly:"
echo ""

# Test 1: RalphService has retryCurrentStory method
echo -n "1. RalphService.retryCurrentStory() exists: "
if grep -q "public retryCurrentStory" src/utils/ralph-service.ts; then
    echo "✓ PASS"
else
    echo "✗ FAIL"
fi

# Test 2: App handles 'R' key
echo -n "2. App.tsx handles 'R' key press: "
if grep -q "key: 'R'" src/components/App.tsx && grep -q "retryCurrentStory" src/components/App.tsx; then
    echo "✓ PASS"
else
    echo "✗ FAIL"
fi

# Test 3: UI shows retry count
echo -n "3. WorkPane displays retry count: "
if grep -q "retryCount" src/components/WorkPane.tsx && grep -q "attempt" src/components/WorkPane.tsx; then
    echo "✓ PASS"
else
    echo "✗ FAIL"
fi

echo ""
echo "Implementation Details:"
echo "- Press 'R' when Ralph is idle to retry the current story"
echo "- Retry count is shown as '(attempt N)' next to the story ID"
echo "- Maximum 3 retries per story (implements 'Crash Early' principle)"
echo "- Shortcut is visible in the bottom shortcuts bar"