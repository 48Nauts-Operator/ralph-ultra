# Progress Tracking Feature

## Overview
The progress tracking feature maintains a `progress.txt` file in the project directory that persists execution state between runs. This enables resuming work after crashes or restarts.

## File Location
- `{project-directory}/progress.txt`

## Data Structure

```json
{
  "startedAt": "2026-01-23T12:00:00.000Z",
  "lastUpdated": "2026-01-23T12:15:30.000Z",
  "stories": [
    {
      "storyId": "US-001",
      "attempts": 2,
      "lastAttempt": "2026-01-23T12:10:00.000Z",
      "passed": true
    },
    {
      "storyId": "US-002",
      "attempts": 3,
      "lastAttempt": "2026-01-23T12:15:30.000Z",
      "passed": false,
      "failureReasons": [
        "2/5 criteria failed",
        "1/5 criteria failed",
        "1/5 criteria failed"
      ]
    }
  ]
}
```

## Key Features

### 1. Automatic Persistence
- Progress is automatically written to disk after each story attempt
- No manual intervention required
- Safe to interrupt - progress is saved incrementally

### 2. Crash Recovery
- On startup, `RalphService` reads the existing `progress.txt`
- Execution history is preserved
- Can see how many times each story was attempted

### 3. Failure Tracking
- Records specific failure reasons for each attempt
- Helps identify patterns in failures
- Useful for debugging why a story isn't passing

### 4. Timestamps
- Global session start time (`startedAt`)
- Last update time (`lastUpdated`)
- Per-story last attempt time (`lastAttempt`)

## Integration Points

### Constructor (Line 89)
```typescript
this.executionProgress = this.readProgress();
```
Loads existing progress on startup.

### Story Start (Line 1029)
```typescript
this.updateStoryProgress(story.id, false);
```
Records that a story attempt has begun.

### Story Success (Line 1230)
```typescript
this.updateStoryProgress(story.id, true);
```
Marks story as passed after verification.

### Story Failure (Line 1270)
```typescript
this.updateStoryProgress(story.id, false, failureReason);
```
Records failure with reason for debugging.

## Public API

### `getProgressHistory(): ExecutionProgress`
Returns the complete execution history for display in the UI.

```typescript
const history = ralphService.getProgressHistory();
console.log(`Total stories tracked: ${history.stories.length}`);
console.log(`Session started: ${history.startedAt}`);
```

## Implementation Details

### File Format
- JSON format for easy reading and parsing
- Human-readable timestamps (ISO 8601)
- Compact structure to minimize file size

### Error Handling
- Corrupt files are handled gracefully
- Missing files trigger fresh start
- Write failures are logged but don't crash execution

### Performance
- Minimal overhead (single file write per story)
- No database required
- Fast startup (single JSON parse)

## Example Usage

```typescript
// Initialize service (loads progress automatically)
const service = new RalphService('/path/to/project');

// Get execution history
const history = service.getProgressHistory();

// Display story attempts
history.stories.forEach(story => {
  console.log(`${story.storyId}: ${story.attempts} attempts, ${story.passed ? 'PASS' : 'FAIL'}`);
});
```

## Testing

Run the test suite:
```bash
./test-progress-tracking.sh
```

All acceptance criteria tests:
```bash
# AC1: Progress file is written during execution
grep -q 'progress.txt\|writeProgress\|progressFile' src/utils/ralph-service.ts

# AC2: Progress includes story attempts and results
grep -q 'attempts\|storyProgress\|executionHistory' src/utils/ralph-service.ts

# AC3: Progress is read on startup to show history
grep -q 'readProgress\|loadProgress' src/utils/ralph-service.ts
```
