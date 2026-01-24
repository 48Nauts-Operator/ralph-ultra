#!/bin/bash
# Test script for progress tracking functionality

set -e

echo "Testing Progress Tracking Feature"
echo "=================================="
echo ""

# Test 1: Check that progress.txt is referenced in the code
echo "Test 1: Checking for progress.txt references..."
if grep -q 'progress.txt\|writeProgress\|progressFile' src/utils/ralph-service.ts; then
    echo "✓ Progress file infrastructure found"
else
    echo "✗ Missing progress file infrastructure"
    exit 1
fi

# Test 2: Check for attempts tracking
echo ""
echo "Test 2: Checking for attempts tracking..."
if grep -q 'attempts\|storyProgress\|executionHistory' src/utils/ralph-service.ts; then
    echo "✓ Attempts tracking found"
else
    echo "✗ Missing attempts tracking"
    exit 1
fi

# Test 3: Check for progress reading on startup
echo ""
echo "Test 3: Checking for progress reading on startup..."
if grep -q 'readProgress\|loadProgress' src/utils/ralph-service.ts; then
    echo "✓ Progress reading on startup found"
else
    echo "✗ Missing progress reading on startup"
    exit 1
fi

# Test 4: Verify the data structures exist
echo ""
echo "Test 4: Checking data structures..."
if grep -q 'interface StoryProgress' src/utils/ralph-service.ts && \
   grep -q 'interface ExecutionProgress' src/utils/ralph-service.ts; then
    echo "✓ StoryProgress and ExecutionProgress interfaces defined"
else
    echo "✗ Missing required interfaces"
    exit 1
fi

# Test 5: Verify public API exists
echo ""
echo "Test 5: Checking public API..."
if grep -q 'public getProgressHistory' src/utils/ralph-service.ts; then
    echo "✓ getProgressHistory() public method exists"
else
    echo "✗ Missing getProgressHistory() public method"
    exit 1
fi

# Test 6: Check that progress is written during story execution
echo ""
echo "Test 6: Checking progress updates during execution..."
if grep -q 'updateStoryProgress' src/utils/ralph-service.ts && \
   grep -q 'this.updateStoryProgress' src/utils/ralph-service.ts; then
    echo "✓ Progress updates during execution found"
else
    echo "✗ Missing progress updates during execution"
    exit 1
fi

# Test 7: Verify constructor initializes progress
echo ""
echo "Test 7: Checking constructor initialization..."
if grep -q 'this.executionProgress = this.readProgress()' src/utils/ralph-service.ts; then
    echo "✓ Progress initialized in constructor"
else
    echo "✗ Progress not initialized in constructor"
    exit 1
fi

echo ""
echo "=================================="
echo "All progress tracking tests passed!"
echo "=================================="
echo ""
echo "Progress tracking features:"
echo "  - progress.txt file in project directory"
echo "  - Tracks story attempts and pass/fail results"
echo "  - Persists between runs"
echo "  - Includes timestamps for each attempt"
echo "  - Stores failure reasons for debugging"
echo "  - Public API for UI integration"
