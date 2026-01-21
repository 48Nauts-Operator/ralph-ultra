# Ralph Ultra - Agent Guidelines

## Project Overview

Ralph Ultra is an autonomous AI agent system for executing PRD-based development workflows.
It consists of bash scripts that orchestrate AI coding agents with health monitoring,
cost optimization, and learning capabilities.

**Repository:** https://github.com/48Nauts-Operator/ralph-ultra

**Documentation:** `/Users/jarvis/Knowledge/Obsidian/Business/NautCoder/Development/Tools/Ralph-Ultra/`

### Documentation Structure

```
/Users/jarvis/Knowledge/Obsidian/Business/NautCoder/Development/Tools/Ralph-Ultra/
├── 00-Ideation/           # Product goals and vision
├── 01-Research/           # Research findings and competitor analysis
│   └── 2026-01-21_Autonomous-Coding-Agents-Research.md  # 30+ agent repos analyzed
├── 02-Planning/           # Project planning details
├── 03-Blueprint/          # Architecture and sequence diagrams
├── 04-Implementation/     # Code implementation details and progress
└── 05-User-Docs/          # User documentation
```

## PRD Format (CRITICAL)

When creating a PRD for Ralph Ultra, **you MUST use this exact format** with **testable acceptance criteria**:

```json
{
  "project": "project-name",
  "description": "Brief project description",
  "branchName": "ralph/project-name",
  "userStories": [
    {
      "id": "US-001",
      "title": "Short title for the story",
      "description": "Detailed description of what needs to be done",
      "acceptanceCriteria": [
        {
          "id": "AC-001-1",
          "text": "Description of what should be true",
          "testCommand": "shell command that exits 0 if passing",
          "passes": false,
          "lastRun": null
        },
        {
          "id": "AC-001-2",
          "text": "Another criterion",
          "testCommand": "grep -q 'pattern' src/file.ts",
          "passes": false,
          "lastRun": null
        }
      ],
      "complexity": "simple|medium|complex",
      "passes": false
    }
  ]
}
```

### Testable Acceptance Criteria (RECOMMENDED)

Each acceptance criterion should have a `testCommand` that Ralph can execute to verify the work:

| Field         | Type         | Description                                    |
| ------------- | ------------ | ---------------------------------------------- |
| `id`          | string       | Unique ID (e.g., "AC-001-1")                   |
| `text`        | string       | Human-readable description                     |
| `testCommand` | string       | Shell command that exits 0 if criterion is met |
| `passes`      | boolean      | Set by Ralph after test runs                   |
| `lastRun`     | string\|null | ISO timestamp of last test execution           |

**Good testCommand examples:**

```bash
# Check file exists
"test -f src/utils/helper.ts"

# Check code contains pattern
"grep -q 'export function myFunc' src/index.ts"

# Check type compiles
"bun run typecheck"

# Check test passes
"bun test src/utils/helper.test.ts"

# Multiple conditions
"grep -q 'pattern1' file.ts && grep -q 'pattern2' file.ts"
```

### Simple Acceptance Criteria (Legacy)

For simpler PRDs, you can still use string arrays (but no auto-verification):

```json
"acceptanceCriteria": [
  "User can log in with email",
  "Error message shown for invalid credentials"
]
```

### Required Fields

| Field                              | Type    | Description                                                        |
| ---------------------------------- | ------- | ------------------------------------------------------------------ |
| `project`                          | string  | Project name                                                       |
| `userStories`                      | array   | List of user stories                                               |
| `userStories[].id`                 | string  | Unique ID (e.g., "US-001")                                         |
| `userStories[].title`              | string  | Short descriptive title                                            |
| `userStories[].description`        | string  | What needs to be implemented                                       |
| `userStories[].acceptanceCriteria` | array   | List of acceptance criteria (testable or simple)                   |
| `userStories[].passes`             | boolean | **MUST be `false` initially** - Ralph sets to `true` when verified |

### Optional Fields

| Field                      | Type   | Default         | Description                     |
| -------------------------- | ------ | --------------- | ------------------------------- |
| `description`              | string | -               | Project description             |
| `branchName`               | string | ralph/{project} | Git branch name                 |
| `userStories[].complexity` | string | "medium"        | simple/medium/complex (for ETA) |
| `userStories[].priority`   | number | -               | Execution order (lower = first) |

### How Ralph Uses PRD (Verification Workflow)

1. Ralph reads `prd.json` from project root
2. Finds first story where `passes: false`
3. Sends story to AI CLI (claude/opencode/aider)
4. **After AI completes (exit 0):**
   - Runs all `testCommand` for each acceptance criterion
   - Updates `passes` and `lastRun` for each criterion
   - If ALL criteria pass → sets `story.passes: true` → moves to next story
   - If ANY criteria fail → **retries the same story** with AI
5. When all stories pass → archives PRD to `.archive/` with timestamp
6. TUI shows: gray (pending) → yellow (in progress) → green (verified)

### Retry Behavior

When acceptance criteria tests fail after AI completes:

- Ralph logs which criteria failed
- Automatically re-runs the same story
- AI receives the same prompt and should fix the issues
- **Maximum 3 retries per story** (based on Aider's proven pattern)
- After 3 failures, story is marked failed and Ralph moves to next story
- Prevents infinite loops that waste time and money

### PRD Archival

When all stories are verified complete:

- PRD is copied to `.archive/YYYY-MM-DD_HH-MM-SS_completed_prd.json`
- Original `prd.json` remains with all `passes: true`

### DO NOT USE

- `features` array format
- `implementation_phases` format
- Any format without `userStories` and `passes` fields

These formats won't track progress correctly.

## Repository Structure

```
scripts/
├── ralph.sh           # Main entry point - orchestrates agent runs
├── ralph-monitor.sh   # Health monitoring, auto-restart, cost tracking
├── ralph-budget.sh    # Budget estimation and strategy planning
├── ralph-quota.sh     # Claude Pro quota management
├── ralph-hybrid.sh    # 80/20 local/API LLM routing
├── ralph-timing-db.sh # Persistent timing database (SQLite/JSON)
├── setup.sh           # Initial setup and configuration
└── prompt.md          # Agent instructions template
```

## Build/Lint/Test Commands

### Syntax Validation

```bash
# Check all scripts for syntax errors
bash -n scripts/ralph.sh
bash -n scripts/ralph-monitor.sh
bash -n scripts/ralph-budget.sh
bash -n scripts/ralph-quota.sh
bash -n scripts/ralph-hybrid.sh
bash -n scripts/ralph-timing-db.sh

# Check all at once
for f in scripts/*.sh; do bash -n "$f" && echo "✓ $f"; done
```

### Functional Tests

```bash
# Test timing database
./scripts/ralph-timing-db.sh --status
./scripts/ralph-timing-db.sh --predict "US-integration-test"

# Test quota checking
./scripts/ralph-quota.sh --status

# Test hybrid routing
./scripts/ralph-hybrid.sh --status
./scripts/ralph-hybrid.sh --route "implement login function"

# Test main script help
./scripts/ralph.sh --help
```

### Run Single Component Test

```bash
# Test specific script
bash -n scripts/<script>.sh && echo "Syntax OK"
./scripts/<script>.sh --help
./scripts/<script>.sh --status
```

## Code Style Guidelines

### Shebang and Headers

```bash
#!/bin/bash
# Script Name - Brief description
# Usage: script.sh [options] <args>
```

### Error Handling

- Always use `set -e` at script start
- Define logging functions early:

```bash
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
```

### Color Definitions

```bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
```

### Section Organization

Use clear section dividers for navigation in large scripts:

```bash
# =============================================================================
# SECTION NAME
# =============================================================================
```

### Variable Naming

- **UPPERCASE** for exported/environment variables: `RALPH_HYBRID_MODE`
- **lowercase** for local variables: `local story_id`
- Use descriptive names: `project_dir` not `pd`

### Function Naming

- Use snake_case: `get_story_timeout`, `check_quota_status`
- Prefix with verb: `get_`, `set_`, `check_`, `validate_`, `run_`

### Platform Compatibility

- Support both macOS and Linux
- Use conditional logic for platform-specific commands:

```bash
case "$(uname -s)" in
  Darwin*) # macOS specific ;;
  Linux*)  # Linux specific ;;
esac
```

### Timestamp Handling

macOS `date` doesn't support `%3N` for milliseconds. Use:

```bash
# Cross-platform milliseconds
$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || date +%s)000
```

### JSON Handling

- Use `jq` for all JSON operations
- Always handle missing/null values:

```bash
jq -r '.field // empty'
jq -r '.field // "default"'
```

### File Naming Conventions

- Scripts: `ralph-<component>.sh`
- Reports: `ralph-report_YYYY-MM-DD_HH-MM-SS.html`
- State files: `.ralph-<purpose>.json`

## Environment Variables

### Core Configuration

| Variable                 | Default           | Description                                   |
| ------------------------ | ----------------- | --------------------------------------------- |
| `RALPH_HYBRID_MODE`      | -                 | LLM routing: aggressive/balanced/conservative |
| `RALPH_LOCAL_PROVIDER`   | ollama            | Local LLM: ollama/lmstudio/vllm               |
| `RALPH_LOCAL_ENDPOINT`   | localhost:11434   | Local LLM API URL                             |
| `RALPH_LOCAL_MODEL`      | qwen2.5-coder:32b | Primary local model                           |
| `RALPH_LOCAL_FAST_MODEL` | qwen2.5-coder:7b  | Fast model for simple tasks                   |
| `RALPH_QUOTA_THRESHOLD`  | 90                | Quota warning threshold %                     |
| `RALPH_TIMING_BACKEND`   | auto              | Database: auto/sqlite/json                    |

### Notifications

| Variable       | Description           |
| -------------- | --------------------- |
| `NTFY_SERVER`  | NTFY server URL       |
| `NTFY_TOPIC`   | NTFY topic name       |
| `WEBHOOK_URL`  | Slack/Discord webhook |
| `WEBHOOK_TYPE` | slack/discord/generic |

## Key Patterns

### Adding New Commands

1. Add flag parsing in the `while [[ "$1" == --* ]]` loop
2. Update `show_usage()` function
3. Implement handler function
4. Update CHANGELOG.md

### Recording to Timing Database

```bash
"$TIMING_DB_SCRIPT" --record "$PROJECT_DIR" "$story" "$duration" "$estimate" "$complexity" "$model" "1"
```

### Hybrid Routing Decision

```bash
./scripts/ralph-hybrid.sh --route "task description"
# Returns: {"route": "local|api", "model": "...", "reason": "..."}
```

### Unified Status Commands

When implementing status commands that aggregate multiple sources:

```bash
# Source scripts in subshells to call their show_status functions
(
  source "$RALPH_SCRIPTS_DIR/ralph-quota.sh"
  show_status 2>/dev/null || echo "  Status unavailable"
)
```

**Note:** Each script should have its own `show_status()` function that can be sourced independently.

## Git Workflow

- Commit messages: `feat:`, `fix:`, `docs:`, `refactor:`
- Tag format: `v1.X.0` for features, `v1.X.Y` for fixes
- Always run syntax checks before committing
- Update VERSION and CHANGELOG.md for releases

## Release Process (MANDATORY)

When releasing a new version, **ALL steps must be completed**:

### 1. Update Version Badge in README.md

```markdown
[![Version](https://img.shields.io/badge/version-1.X.0-blue.svg)]
```

### 2. Create Annotated Git Tag

```bash
git tag -a v1.X.0 -m "v1.X.0 - Feature Name

Features:
- Feature 1 description
- Feature 2 description

Fixes:
- Fix 1 description
"
```

### 3. Push Tag to Remote

```bash
git push origin v1.X.0
```

### 4. Tag Naming Convention

| Version  | When to Use              |
| -------- | ------------------------ |
| `v1.X.0` | New features (minor)     |
| `v1.X.Y` | Bug fixes (patch)        |
| `v2.0.0` | Breaking changes (major) |

### 5. Tag Message Format

```
vX.Y.Z - Short Feature Name

Features:
- Bullet point for each new feature

Fixes:
- Bullet point for each fix

Breaking Changes: (if any)
- Description of breaking change
```

### Example

```bash
git tag -a v1.6.0 -m "v1.6.0 - Multi-Session Support & Resource Checking

Features:
- Multiple Ralph sessions per project (ralph-<project-name>)
- Multiple TUI sessions per project (tui-<project-name>)
- Resource checker before starting new sessions
- /resources command to check CPU, RAM, running sessions
- TUI screenshot in README

Fixes:
- Features format now shows warning about lack of progress tracking
"
git push origin v1.6.0
```

**NEVER skip tagging when updating the version badge in README.**
