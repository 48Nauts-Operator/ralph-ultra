# Ralph Ultra - Conceptual & Technical Documentation

> Purpose: Reference document for building a macOS-native equivalent with improved UX and stability.

---

## Context

Ralph Ultra v3.0 is a **terminal-based orchestration cockpit for autonomous AI coding agents**. It takes a PRD (Product Requirements Document) containing user stories with testable acceptance criteria, intelligently selects AI models based on task type/quota/cost, executes them via CLI tools (Claude Code, OpenCode, Aider, etc.) in tmux sessions, verifies results by running AC tests, and tracks costs/learning over time.

The app is built as a **Bun + React Ink TUI** (terminal UI). This document captures everything needed to rebuild it as a native macOS app.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    RALPH ULTRA                          │
├─────────────┬───────────────────┬───────────────────────┤
│  UI Layer   │  Business Logic   │  Execution Layer      │
│  (React Ink)│  (Core modules)   │  (Tmux + CLI tools)   │
├─────────────┼───────────────────┼───────────────────────┤
│ Components  │ Task Detector     │ RalphService          │
│ Hooks       │ Capability Matrix │ AC Runner             │
│ Themes      │ Execution Planner │ Log Parser            │
│ Overlays    │ Quota Manager     │ Session Tracker       │
│             │ Cost Tracker      │ Status Check          │
│             │ Learning Recorder │ CLI Detection          │
│             │ State Store       │ Tmux Management       │
│             │ Event Bus         │ Remote Server         │
├─────────────┴───────────────────┴───────────────────────┤
│                  Persistence Layer                      │
│  ~/.config/ralph-ultra/ (settings, costs, learning,     │
│  sessions) + project-local (prd.json, logs, progress)   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Core Concept: The PRD-Driven Workflow

Ralph's entire workflow revolves around a `prd.json` file placed in a project root:

```json
{
  "project": "My App",
  "description": "Build a todo app",
  "branchName": "feature/todo-app",
  "cli": "claude",
  "cliFallbackOrder": ["claude", "aider"],
  "userStories": [
    {
      "id": "US-001",
      "title": "User login form",
      "description": "Create a login form with...",
      "complexity": "medium",
      "priority": 1,
      "passes": false,
      "acceptanceCriteria": [
        {
          "id": "AC-001",
          "text": "Login form renders with email field",
          "testCommand": "grep -q 'type=\"email\"' src/Login.tsx",
          "passes": false,
          "lastRun": null
        }
      ]
    }
  ]
}
```

### PRD TypeScript Interface

```typescript
interface PRD {
  project: string;
  description: string;
  branchName: string;
  userStories: UserStory[];
  cli?: string;                    // Optional CLI override for this project
  cliFallbackOrder?: string[];     // Optional CLI fallback order
}

interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriteria;  // string[] | AcceptanceCriterion[]
  complexity: 'simple' | 'medium' | 'complex';
  priority: number;
  passes: boolean;
}

interface AcceptanceCriterion {
  id: string;
  text: string;
  testCommand?: string;
  passes: boolean;
  lastRun: string | null;   // ISO timestamp
}
```

### Lifecycle of a Story

1. User selects a story (or auto-selects next incomplete via `getNextStory()`)
2. Ralph analyzes complexity, detects task type via keyword matching
3. Selects optimal AI model based on task type / quota / execution mode
4. Builds a prompt with story details + coding principles
5. Spawns tmux session, sends CLI command with prompt file
6. AI agent codes autonomously (the tmux session runs independently)
7. Session ends → Ralph runs AC test commands sequentially
8. Updates `prd.json` with pass/fail results per criterion
9. If all ACs pass → marks story as passed, moves to next story
10. If ACs fail → retries up to 3 times (max 10 total iterations)
11. If all stories pass → archives PRD to `.archive/` directory

---

## 3. Intelligent Model Selection Pipeline

This is the most sophisticated part of Ralph. It happens in multiple stages:

### Stage 1: Task Type Detection (`core/task-detector.ts`)

Scans story title + description + acceptance criteria text for keywords and classifies into one of 14 task types. The algorithm:

1. Combines `title + description + AC text` into a single lowercase string
2. For each task type, counts keyword matches using word-boundary regex
3. Title matches are weighted 3x higher than description/AC matches
4. Highest scoring task type wins; defaults to `'unknown'` if no matches

| Task Type | Trigger Keywords |
|-----------|-----------------|
| `complex-integration` | integration, multi-system, architecture, orchestration, microservice, end-to-end, full-stack, cross-cutting |
| `mathematical` | algorithm, calculation, formula, optimization, compute, math, statistics, probability |
| `backend-api` | endpoint, rest, graphql, api, route, controller, request, response, http |
| `backend-logic` | service, business logic, validation, processing, workflow, domain logic, data processing |
| `frontend-ui` | component, ui, style, css, layout, design, visual, responsive, theme, button, form, modal, dashboard |
| `frontend-logic` | hook, state, context, reducer, effect, react, vue, store, state management |
| `database` | schema, migration, query, database, sql, table, index, relation, model |
| `testing` | test, spec, mock, jest, vitest, cypress, e2e, unit test, integration test, coverage |
| `documentation` | documentation, readme, docs, guide, tutorial, comment, jsdoc, api docs |
| `refactoring` | refactor, cleanup, reorganize, restructure, simplify, optimize, improve |
| `bugfix` | fix, bug, issue, error, crash, defect, problem, broken |
| `devops` | docker, ci/cd, pipeline, deploy, deployment, kubernetes, container, build |
| `config` | configuration, config, setup, environment, settings, env, dotenv |
| `unknown` | (fallback — no keywords matched) |

### Stage 2: Capability Matching (`core/capability-matrix.ts`)

Each model has declared capabilities:

```typescript
type ModelCapability =
  | 'deep-reasoning'    // Complex multi-step logic
  | 'mathematical'      // Math proofs, algorithms
  | 'code-generation'   // General coding
  | 'structured-output' // JSON, tests, specs
  | 'creative'          // UI/UX, prose, design
  | 'long-context'      // Large file analysis
  | 'multimodal'        // Images, diagrams
  | 'fast'              // Quick responses
  | 'cheap';            // Low cost

const MODEL_CAPABILITIES = {
  'claude-opus-4-20250514':      ['deep-reasoning', 'mathematical', 'code-generation', 'long-context'],
  'claude-sonnet-4-20250514':    ['code-generation', 'creative', 'deep-reasoning'],
  'claude-3-5-haiku-20241022':   ['code-generation', 'fast', 'cheap'],
  'gpt-4o':                      ['code-generation', 'structured-output', 'multimodal'],
  'gpt-4o-mini':                 ['code-generation', 'fast', 'cheap', 'structured-output'],
  'o3-mini':                     ['mathematical', 'deep-reasoning'],
  'gemini-2.0-flash':            ['fast', 'cheap', 'creative', 'long-context'],
  'gemini-1.5-pro':              ['long-context', 'multimodal', 'code-generation'],
  'deepseek-coder':              ['code-generation', 'cheap'],
  'llama-3.1-70b':               ['code-generation', 'cheap'],
  'qwen-2.5-coder':              ['code-generation', 'cheap'],
};
```

Task types map to recommended primary + fallback models. Each task type has a dedicated `{ primary, fallback }` mapping.

### Stage 3: Execution Mode Filter

Three modes change model strategy. Each mode has its own complete `TaskType → {primary, fallback}` mapping table:

| Mode | Strategy | Primary Models |
|------|----------|---------------|
| **Balanced** (default) | Sonnet for most, Haiku for devops/config, O3-mini for math | Good balance of cost/quality |
| **Super Saver** | Haiku for most, Gemini Flash for frontend-ui/docs, Sonnet only for complex-integration | Budget-conscious |
| **Fast Delivery** | Opus for complex/unknown, Sonnet for everything else | Speed & quality priority |

### Stage 4: Quota-Aware Selection

The `getRecommendedModel()` function implements this cascade:

```
Primary model's provider has quota? → Use primary
  ↓ NO
Fallback model's provider has quota? → Use fallback
  ↓ NO
Any provider with matching capabilities has quota? → Use it
  ↓ NO
Return primary model with warning (caller handles quota errors)
```

Quota availability check: `status === 'available' || status === 'limited'`

### Stage 5: Learning-Adjusted Confidence

Historical performance data adjusts confidence scores in the execution plan:

```typescript
function calculateConfidenceScore(provider, modelId, taskType, learningData): number {
  // Default: 0.5 (no data)
  // Base from overall score: 0.5 + (overallScore/100) * 0.35
  // Bonus from success rate: successRate * 0.1
  // Bonus from experience:
  //   10+ runs → +0.05
  //   5+ runs  → +0.03
  //   3+ runs  → +0.01
  // Clamped to [0.5, 1.0]
}
```

---

## 4. Quota Management System (`core/quota-manager.ts`)

### Model Catalog

10 models with full pricing data (input/output cost per 1M tokens, context window, capabilities):

| Model | Provider | Input $/1M | Output $/1M | Context | Key Capabilities |
|-------|----------|-----------|------------|---------|-----------------|
| Claude Opus 4 | anthropic | $15.00 | $75.00 | 200K | deep-reasoning, math, code, long-context |
| Claude Sonnet 4 | anthropic | $3.00 | $15.00 | 200K | code, creative, deep-reasoning |
| Claude Haiku 3.5 | anthropic | $0.25 | $1.25 | 200K | code, fast, cheap |
| GPT-4o | openai | $2.50 | $10.00 | 128K | code, structured-output, multimodal |
| GPT-4o Mini | openai | $0.15 | $0.60 | 128K | code, fast, cheap, structured-output |
| o3-mini | openai | $1.10 | $4.40 | 128K | mathematical, deep-reasoning |
| Gemini 2.0 Flash | gemini | $0.10 | $0.40 | 1M | fast, cheap, creative, long-context |
| Gemini 1.5 Pro | gemini | $1.25 | $5.00 | 2M | long-context, multimodal, code |
| DeepSeek Coder | openrouter | $0.14 | $0.28 | 128K | code, cheap |
| Llama 3.1 70B | local | $0.00 | $0.00 | 128K | code, cheap |
| Qwen 2.5 Coder | local | $0.00 | $0.00 | 128K | code, cheap |

### Provider Detection Methods

| Provider | Detection | Method Details |
|----------|-----------|---------------|
| **Anthropic** | OAuth token from macOS Keychain OR `~/.local/share/opencode/auth.json` OR `ANTHROPIC_API_KEY` env var | For OAuth: scans `~/.claude/projects/` JSONL files to calculate daily/weekly token usage against limits (5M daily, 30M weekly). For API keys: makes a minimal API call and reads rate-limit headers. |
| **OpenAI** | `~/.local/share/opencode/auth.json` OR `OPENAI_API_KEY` env var | Returns `available` if key exists (no active quota check). |
| **OpenRouter** | `~/.local/share/opencode/auth.json` OR `OPENROUTER_API_KEY` env var | Calls `https://openrouter.ai/api/v1/credits` to get `total_credits` and `total_usage`, computes remaining. |
| **Gemini** | `~/.local/share/opencode/auth.json` (google key) OR `GOOGLE_API_KEY` / `GEMINI_API_KEY` env var | Returns `available` if key exists (no active quota check). |
| **Local** | HTTP GET to `http://192.168.74.179:1238/v1/models` (LM Studio) | 2-second timeout. On success, enumerates loaded models. On failure, `unavailable`. |

### Caching

- **Quota cache TTL**: 5 minutes (refreshes only after expiry or on force-refresh)
- **OAuth quota cache**: 30 seconds (separate cache for Anthropic usage API)
- After refresh, emits `quota-warning` events for providers with `limited` or `exhausted` status

### Context Budget (Anthropic-specific)

Uses macOS Keychain to extract OAuth token, then calls `https://api.anthropic.com/api/oauth/usage` to get:
- 5-hour utilization percentage + reset time
- 7-day utilization percentage + reset time
- `approaching` flag (>80%), `exceeded` flag (>95%)

---

## 5. Cost Tracking (`core/cost-tracker.ts`)

### Per-Story Lifecycle

```
Story Start → costTracker.startStory(storyId, modelId, provider, estimatedCost, retryCount)
  Records: storyId, modelId, provider, startTime, estimatedCost, retryCount

Story End   → costTracker.endStory(storyId, actualCost, inputTokens, outputTokens, success)
  Records: endTime, actualCost, inputTokens, outputTokens, success
  Persists to disk immediately
  Removes from in-progress map
```

### Token Estimation by Complexity

| Complexity | Input Tokens | Output Tokens | Est. Duration |
|-----------|-------------|---------------|---------------|
| Simple | 5,000 | 2,000 | 15 min |
| Medium | 15,000 | 6,000 | 30 min |
| Complex | 40,000 | 15,000 | 60 min |

### Token Extraction from Logs

After a session ends, the service tries to extract actual token usage from CLI output:
1. Pattern match: `Input tokens: N, Output tokens: N`
2. Pattern match: `Total tokens: N` (estimates 33% input / 67% output)
3. Fallback: `{ inputTokens: 0, outputTokens: 0 }`

### Session Cost Summary

`getSessionCosts()` returns: `totalEstimated`, `totalActual`, `storiesCompleted`, `storiesSuccessful`, and the full `records` array.

**Persisted to**: `~/.config/ralph-ultra/cost-history.json`

---

## 6. Learning System (`core/learning-recorder.ts`)

### Recording

After each story execution, records a `ModelPerformanceRecord`:
- Context: project, storyId, storyTitle, taskType, complexity, detectedCapabilities
- Model: provider, modelId
- Metrics: durationMinutes, inputTokens, outputTokens, totalTokens, costUSD
- Outcome: success, retryCount, acTotal, acPassed, acPassRate
- Computed scores (see below)

### Scoring Formulas

```typescript
// Efficiency: higher = better value per dollar
efficiencyScore = (acPassRate * 100) / (costUSD * 100)
// Clamped to [0, 100]. Free models get 100.

// Speed: higher = faster
speedScore = 100 / durationMinutes
// Clamped to [0, 100]

// Reliability: higher = more reliable
reliabilityScore = acPassRate * 100 * successWeight * retryPenalty
// successWeight: 1.0 if success, 0.5 if failure
// retryPenalty: max(0, 1 - retryCount * 0.1)

// Overall (aggregated across runs for model+taskType):
overallScore = avgReliability * 0.4 + avgEfficiency * 0.35 + avgSpeed * 0.25
```

### Aggregation

Learnings are aggregated per `{provider}:{modelId}` + `taskType` combination:
- `totalRuns`, `successfulRuns`, `successRate`
- `avgDurationMinutes`, `avgCostUSD`, `avgTokens`, `avgAcPassRate`
- `efficiencyScore`, `speedScore`, `reliabilityScore`, `overallScore`

### Best Model Query

`getBestModelForTask(taskType, minRuns=3)` → finds the model with highest `overallScore` that has at least `minRuns` completed runs for that task type.

**Persisted to**: `~/.config/ralph-ultra/learning.json`

---

## 7. Execution Engine (`utils/ralph-service.ts`)

This is the largest module (~2,100 lines). One `RalphService` instance per project tab.

### Process States

```
idle → running → (session ends) → idle (verify/retry loop)
                → stopping → paused (user pressed 's')
paused → running (user pressed 'r', resumes with --resume flag)
external (detected existing tmux session not started by Ralph)
```

### CLI Detection Priority Chain

`detectAICLI()` resolves which CLI tool to use:

1. **PRD `cli` field** + `which` check + health check → if healthy, use it
   - On failure: try PRD `cliFallbackOrder` chain
2. **Global `preferredCli` setting** + `which` check + health check → if healthy, use it
   - On failure: try global `cliFallbackOrder` chain
3. **Auto-detect**: iterate through `['claude', 'opencode', 'codex', 'gemini', 'aider', 'cody']`, first one that passes `which` + `--version` health check wins

Health check: runs `{cli} --version` with 3-second timeout, results cached for 5 minutes.

### Tmux Integration

```bash
# Session name derived from PRD branchName
tmux_session_name = "ralph-{branchName-sanitized}"

# Create session
tmux new-session -d -s "$name" -c "$projectPath"

# Send command (prompt written to temp file first)
tmux send-keys -t "$name" '$cliCommand' Enter

# Monitor: poll tmux pane output every ~1 second
tmux capture-pane -t "$name" -p -S -30

# Check if alive (every 3 seconds via session monitor)
tmux has-session -t "$name" 2>/dev/null

# Completion signal (appended to CLI command)
; tmux wait-for -S "$name-done"

# Kill session
tmux kill-session -t "$name" 2>/dev/null
```

### CLI Command Construction

For Claude:
```bash
claude --print --verbose --output-format stream-json --session-id $UUID --model $model --dangerously-skip-permissions "$(cat '/tmp/ralph-prompt-xxx.txt')" 2>&1 | tee -a "$logFile"; tmux wait-for -S "$name-done"
```

On resume:
```bash
claude --print --verbose --output-format stream-json --resume $sessionId --model $model --dangerously-skip-permissions "$(cat '/tmp/ralph-prompt-xxx.txt')" 2>&1 | tee -a "$logFile"; tmux wait-for -S "$name-done"
```

For other CLIs:
- `opencode`: `opencode run --title Ralph "$(cat prompt)"`
- `codex`: `codex "$(cat prompt)"`
- `gemini`: `gemini "$(cat prompt)"`
- `aider`: `aider --message "$(cat prompt)"`
- `cody`: `cody chat -m "$(cat prompt)"`

### Prompt Construction

Each story gets a prompt file (`/tmp/ralph-prompt-{timestamp}.txt`) containing:

1. **Core coding principles** (built-in):
   - DRY, ETC, Orthogonality, Match Existing Patterns
   - Tracer Bullets, Crash Early, Small Steps, No Magic
   - Assertions, Clear Naming, No Broken Windows, Law of Demeter
   - Pre-coding checklist: search existing code, understand patterns, plan, consider tests

2. **Custom principles** (from `~/.config/ralph-ultra/principles.md` if user has customized it — detected by checking content length > 100 chars after stripping HTML comments)

3. **Story details**: ID, title, description, acceptance criteria with test commands, complexity

4. **Implementation instructions**: explore first, follow patterns, implement incrementally, test, clean up, summarize

### Resume Prompt

When resuming a paused story, a different prompt is built:
```
You were previously working on this user story and were interrupted.

## Story: US-001 - Title
Description...

## Current Status
**Passing:**
- AC-001
**Failing:**
- AC-002
- AC-003

Continue from where you left off. Focus on remaining failing acceptance criteria.
Do not redo work that already passes.
```

### Pause/Resume Flow

**Pause (user presses 's'):**
1. Save `currentSessionId` and AC status (passing/failing ACs) to progress file
2. Kill tmux session
3. Set state to `'paused'`
4. UI shows `[⏸]` icon next to paused story

**Resume (user presses 'r'):**
1. Find existing progress entry with `paused: true` and `sessionId`
2. Build resume prompt (not full prompt)
3. Use `--resume $sessionId` flag with Claude CLI
4. Create new tmux session, send resume command
5. Set state to `'running'`

**Quick-fail detection:** If a resumed session ends in < 10 seconds, Ralph clears the session ID and falls back to a fresh start on next retry.

### AC Testing (`utils/ac-runner.ts`)

After a tmux session ends:

1. Load the story from `prd.json`
2. For each `AcceptanceCriterion` with a `testCommand`:
   - Run `execSync(testCommand, { cwd: projectPath, timeout: 30000 })`
   - Record pass/fail + duration
3. Update `prd.json` with results (each criterion's `passes` and `lastRun` fields)
4. If all ACs pass → story `passes = true`
5. If all stories in PRD pass → archive PRD to `.archive/{timestamp}_completed_prd.json`

### Retry Logic

Constants:
- `MAX_RETRIES_PER_STORY = 3` — per-story retry count
- `MAX_ITERATIONS = 10` — absolute maximum attempts across all retries

Flow after AC tests fail:
1. Increment retry count for story
2. Save session ID + AC status for future resume
3. If retry count < MAX_RETRIES and iteration count < MAX_ITERATIONS:
   - Wait 2 seconds
   - Kill old tmux session
   - Call `runStoryInternal()` again (will use `--resume` if session ID exists)
4. If limits exceeded:
   - Mark story as failed, move to next story

### PRD Backup System

Before each execution run:
- Copies `prd.json` to `.ralph-backups/prd_{timestamp}.json`
- Also maintains `prd_latest.json` (always points to most recent backup)
- Keeps only the latest 20 backups (older ones are deleted)
- Restore methods: `restorePRDFromBackup()`, `restoreFromBackup(path)`, `listBackups()`

### Execution Plan Integration

Before running a story, if using Claude CLI:
1. Load or generate execution plan from PRD (cached after first generation)
2. Look up the story's allocation in the plan
3. If the recommended model is from Anthropic, map its full model ID to a CLI flag:
   - `claude-opus-4-20250514` → `opus`
   - `claude-sonnet-4-20250514` → `sonnet`
   - `claude-3-5-haiku-20241022` → `haiku`
4. Pass as `--model` flag to Claude CLI

### Stream JSON Parsing

Claude CLI output with `--output-format stream-json` produces JSON lines. The parser:

1. Non-JSON lines → return as-is (shell messages)
2. `{ type: "assistant", message: { content: [{ type: "text", text: "..." }] } }` → extract text
3. `{ type: "content_block_delta", delta: { type: "text_delta", text: "..." } }` → extract delta text
4. `{ type: "result", result: "..." }` → extract result
5. `message_start`, `content_block_start`, `content_block_stop`, `message_stop` → skip (control messages)
6. Malformed JSON → return raw line

### Live Output Polling

While a process is running, the UI polls for live output every 500ms:

```typescript
// Captures last 30 lines of tmux pane content
tmux capture-pane -t "$name" -p -S -30
```

Output is filtered to remove:
- Shell prompts
- Claude command fragments
- Raw JSON stream lines (handled separately via log file parser)
- `--output-format` flags

### Session Monitor

A 3-second interval timer checks:
- If state is `running` or `external`: verify tmux session still exists
  - If gone → handle session ended (run AC tests, verify, retry/continue)
- If state is `idle`: check if a tmux session appeared externally
  - If found → set state to `external`, start log tailing
- If state is `paused`: skip tmux checks entirely (we killed it intentionally)

---

## 8. UI Architecture

### Layout

```
┌─────────────────────────────────────────────────┐
│ StatusBar (progress, mode, API, CLI/model, git) │
├─────────────────────────────────────────────────┤
│ TabBar (up to 5 project tabs)                   │
├──────────────┬──────────────────────────────────┤
│ SessionsPane │ WorkPane (8 switchable views)    │
│ (story list) │  1: Monitor (live logs/output)   │
│              │  2: Status (system info)         │
│  j/k nav     │  3: Details (story + ACs)        │
│  Enter sel   │  4: Quota (provider dashboard)   │
│              │  5: Plan (execution plan)        │
│              │  6: Help (shortcuts ref)          │
│              │  7: Version (system info)         │
│              │  8: Costs (cost dashboard)        │
├──────────────┴──────────────────────────────────┤
│ ShortcutsBar (context-aware keyboard hints)     │
└─────────────────────────────────────────────────┘

Overlays (modal):
  - WelcomeOverlay (splash + help on first launch)
  - ProjectPicker (recent/browse/path input)
  - SettingsPanel (theme, sound, CLI preferences)
  - CommandPalette (fuzzy search, Ctrl+P or ':')
  - ConfirmDialog (yes/no for quit, close tab, etc.)
  - NotificationToast (top-right stack, max 3 visible)
  - RestorePrompt (on unclean shutdown detection)
```

### Empty State

When no projects are open (no `--project` flag, no saved projects), the app renders the `ProjectPicker` fullscreen instead of the main layout.

### Component Details

**StatusBar** (`StatusBar.tsx`, 211 lines):
- Progress bar (% stories complete)
- API status icon (operational ✓ / degraded ⚠ / outage ✗)
- Tailscale status icon
- Remote connections count
- Execution mode icon + label (💰 saver / ⚖ balanced / 🚀 fast)
- Active CLI/model label (e.g., "claude/sonnet")
- Git branch name
- App version

**SessionsPane** (`SessionsPane.tsx`, 271 lines):
- Watches `prd.json` via `fs.watchFile()` (30s poll interval)
- Validates PRD structure (checks for `userStories` array)
- Status icons: `[✓]` passed, `[⏸]` paused, `[>]` selected, `[ ]` pending
- Color coding: green (passed), magenta (paused), yellow (selected), white (pending)
- Shows AC progress per story (e.g., "3/5")
- Complexity badge with color: green (simple), yellow (medium), red (complex)
- Scrolling with j/k, Enter to switch to details view
- Footer shows goto mode or completion count
- Goto mode ('g' key): enter story number to jump directly

**WorkPane** (`WorkPane.tsx`, ~1,500 lines):
- 8 views switchable via number keys 1-8
- **Monitor**: Live log output with activity summary, live Claude output box
- **Status**: System info, processes, session info
- **Details**: Full story description + AC list with pass/fail
- **Quota**: Provider quota dashboard (QuotaDashboard component)
- **Plan**: Execution plan viewer (ExecutionPlanView component)
- **Help**: Keyboard shortcuts reference
- **Version**: System info + changelog
- **Costs**: Cost tracking dashboard (CostDashboard component)
- Log filtering: filters raw JSON, code snippets, and noise from activity view
- Shows "[INFO]", "[WARN]", "[ERROR]" tagged lines plus action keywords (Implementing, Creating, Running, etc.)

**ProjectPicker** (`ProjectPicker.tsx`, ~400 lines):
- Three modes: `input` (path entry), `browse` (filesystem nav), `recent` (history)
- Defaults to `recent` if recent projects exist, else `browse`
- Browse: navigates directories, highlights those with `prd.json` present
- Navigation: j/k (up/down), l/→ (enter dir), h/← (parent), Enter (open project)
- Path shortening: replaces `$HOME` with `~`
- Responsive sizing: uses up to 90% width, 80% height
- `onCancel` is optional — omitted when used as fullscreen empty-state picker

**ShortcutsBar** (`ShortcutsBar.tsx`, 114 lines):
- Context-aware: shows different shortcuts based on focused pane
- Paused state: changes "Run" label to "Resume"
- Format: `key description | key description | ...`

### Multi-Tab Model

- Up to 5 concurrent project tabs
- Each tab has independent: story selection, scroll positions, view mode, process state, log buffer, search state, goto state, log filter, debug mode, current model
- One `RalphService` instance per tab (created lazily on first use, isolated tmux sessions)
- Tab state includes: `id`, `project`, `processState`, `logLines`, `selectedStory`, `workPaneView`, `availableCLI`, `currentModel`, and more
- Open projects saved to settings on every tab change

### Keyboard System

Priority-based handler registry via `useKeyboard` hook:

- **Priority 100**: Overlays (escape, navigation within modals)
- **Priority 50**: Global shortcuts (Tab, r, R, s, q, ?, t, d, p, e, etc.)
- **Priority 10**: Pane-specific navigation (j/k, Enter, /, n/N, 1-8)
- **Priority 0**: Default handlers

Handler matching: supports both string keys and custom matcher functions `(input, key) => boolean`.

Global debounce: 50ms to prevent rapid key repeats.

### Key Shortcuts

| Key | Action | Condition |
|-----|--------|-----------|
| Tab | Cycle focus: sessions → work → tabs | Always |
| r | Run story / Resume paused story | idle or paused |
| R | Retry failed story | idle or paused |
| s | Stop/pause execution | running or external |
| q | Quit (with confirmation dialog) | Always |
| 1-8 | Switch WorkPane view | Always |
| j/k | Navigate in focused pane | sessions or work focused |
| / | Search logs | work focused |
| n/N | Next/prev search match | search active |
| t | Open settings panel | Always |
| p | Open project picker (recent) | Always |
| ? | Toggle help/welcome overlay | Always |
| : or Ctrl+P | Open command palette | Always |
| e or Ctrl+W | Close current tab | Always (confirm if running) |
| Ctrl+Shift+T | Open new tab (project picker) | Always |
| [ / ] | Prev/next tab | Always |
| d | Toggle debug mode | Always |
| g | Goto story (by number) | sessions focused |
| f | Cycle log filter (all → errors → warnings+errors) | Always |
| T | Run AC tests manually | details view |
| c | Copy remote URL to clipboard | Always |
| Ctrl+L | Clear log buffer | Always |

---

## 9. State Management

### Layer 1: React Context Providers (global)

- **ThemeContext** (`useTheme`): Current theme name and colors, persisted to settings
- **FocusContext** (`useFocus`): Active pane (`'projects' | 'tabs' | 'sessions' | 'work'`), cycle logic
- **NotificationContext** (`useNotifications`): Toast queue (max 3 visible), history, sound toggle, auto-dismiss (5s default)

### Layer 2: Tab State (App-level)

`useTabs` hook manages an array of `TabState` objects:

```typescript
interface TabState {
  id: string;
  project: Project;
  processState: ProcessState;  // 'idle' | 'running' | 'stopping' | 'paused' | 'external'
  processError?: string;
  processPid?: number;
  logLines: string[];
  selectedStory: UserStory | null;
  selectedStoryId: string | null;
  sessionsScrollIndex: number;
  workPaneView: WorkView;      // 'monitor' | 'status' | 'details' | ... | 'costs'
  workScrollOffset: number;
  tracingNodeIndex: number;
  availableCLI?: string | null;
  isProjectCLIOverride?: boolean;
  lastRunDuration?: number | null;
  lastRunExitCode?: number | null;
  currentStory?: string | null;
  searchState?: SearchState;
  gotoState?: GotoState;
  logFilter?: LogFilter;
  retryCount?: number;
  debugMode?: boolean;
  currentModel?: string | null;
}
```

Key behaviors:
- `activeTab` is `TabState | null` (null when no tabs open)
- Opening a project that's already open switches to its tab
- Closing a tab stops its RalphService
- Tab limit: 5 maximum
- Recent projects are tracked on open/switch

### Layer 3: Core State Store (`core/state-store.ts`)

Singleton `StateStore` with pub/sub pattern:
- State: quotas, executionPlan, executionStatus, completedStories, totalCost, learnings
- `subscribe(fn)` → returns unsubscribe function
- `update(partial)` → merges partial state, notifies listeners, emits `state-snapshot` event
- Specialized methods: `updateQuotas()`, `updateExecutionPlan()`, `recordStoryCompletion()`

### Layer 4: Event Bus (`core/event-bus.ts`)

Typed pub/sub for cross-cutting events:

```typescript
type RalphEvent =
  | { type: 'quota-update'; data: ProviderQuotas }
  | { type: 'quota-warning'; data: { provider, message } }
  | { type: 'plan-started'; data: { project } }
  | { type: 'plan-ready'; data: ExecutionPlan }
  | { type: 'plan-failed'; data: { error } }
  | { type: 'execution-started'; data: { project, totalStories } }
  | { type: 'story-started'; data: { storyId, model, estimatedCost } }
  | { type: 'story-progress'; data: { storyId, output } }
  | { type: 'story-completed'; data: { storyId, success, cost, duration, acPassed, acTotal } }
  | { type: 'story-failed'; data: { storyId, error, retryCount } }
  | { type: 'execution-paused'; data: { storyId } }
  | { type: 'execution-resumed'; data: { storyId } }
  | { type: 'execution-stopped'; data: { reason } }
  | { type: 'execution-complete'; data: { totalCost, duration, successRate } }
  | { type: 'learning-recorded'; data: ModelPerformanceRecord }
  | { type: 'recommendation-updated'; data: { taskType, newModel } }
  | { type: 'state-snapshot'; data: RalphCoreState }
```

API: `on(type, fn)`, `onAll(fn)`, `emit(event)`, `removeAllListeners()`

### Layer 5: Persistence (`utils/config.ts`)

| File | Contents | Written When |
|------|----------|-------------|
| `~/.config/ralph-ultra/settings.json` | theme, notificationSound, debugMode, openProjects, activeProjectPath, recentProjects (max 10), preferredCli, cliFallbackOrder, executionMode | On any setting change |
| `~/.config/ralph-ultra/cost-history.json` | Array of `StoryExecutionRecord` | After each story ends |
| `~/.config/ralph-ultra/learning.json` | `ModelLearningDB` (runs, learnings, recommendations) | After each story ends |
| `~/.config/ralph-ultra/principles.md` | Custom coding principles (Markdown) | User-edited |
| `~/.config/ralph-ultra/.first-launch` | Timestamp | After first launch welcome dismissed |
| `~/.config/ralph-ultra/.remote-token` | 64-char hex token (mode 0600) | On first remote server start |

### Project-Local Persistence

| File | Contents | Written When |
|------|----------|-------------|
| `{project}/prd.json` | PRD with story/AC pass/fail status | After AC tests |
| `{project}/.ralph-backups/prd_{timestamp}.json` | PRD backup (keep 20) | Before each run |
| `{project}/.ralph-backups/prd_latest.json` | Most recent backup | Before each run |
| `{project}/logs/ralph-ultra.log` | Service-level log (timestamps, levels) | During execution |
| `{project}/logs/ralph-session.log` | Raw CLI output (streamed via `tee`) | During execution |
| `{project}/progress.txt` | `ExecutionProgress` JSON (story attempts, session IDs, paused state) | Per story attempt |
| `{project}/.archive/{timestamp}_completed_prd.json` | Archived completed PRD | When all stories pass |

---

## 10. Remote Access

### WebSocket Server (`remote/server.ts`)

- Port 7890, localhost-only (`127.0.0.1`)
- Token-based authentication (stored in `~/.config/ralph-ultra/.remote-token`)
- Max 3 concurrent connections
- 5-second authentication timeout
- Broadcasts: state updates, log lines, progress updates
- Receives: commands (`run`, `stop`, `focus`, `navigate`)
- Message protocol: JSON over WebSocket
- Auth flow: client sends `{ type: 'auth', token: '...' }`, server responds with success or closes

### HTTP Server (`remote/http-server.ts`)

- Port 7891, localhost-only
- Serves static monitoring dashboard HTML (`remote/client/index.html`)

### Tailscale Integration (`remote/tailscale.ts`)

- Detects Tailscale installation via `which tailscale`
- Parses `tailscale status --json` for connection info
- Extracts: Tailscale IP, hostname, MagicDNS name, tailnet name
- Generates shareable URL: `ws://{machineName}.{tailnetName}:{port}?token={token}`
- Clipboard support: `pbcopy` (macOS) with `xclip` fallback (Linux)

---

## 11. Theme System

12 built-in themes, each defining 11 color properties:

```typescript
interface Theme {
  name: string;
  background: string;
  foreground: string;
  accent: string;
  accentSecondary: string;
  muted: string;
  error: string;
  warning: string;
  success: string;
  border: string;
  borderFocused: string;
}
```

Available themes: `nano-dark` (default), `nano-light`, `dracula`, `monokai`, `nord`, `solarized-dark`, `gruvbox`, `tokyo-night`, `catppuccin`, `one-dark`, `cyberpunk`, `github-dark`.

Theme is persisted in settings and restored on launch.

---

## 12. Additional Features

### Complexity Analysis

Before running a story, Ralph analyzes it for potential issues:
- Description word count > threshold
- AC count > threshold
- Presence of complexity keywords (integration, microservice, full-stack, etc.)
- If 2+ complexity indicators present → show warning with 5-second grace period

### Agent Tree / Tracing

`TracingPane` component + `log-parser.ts` build an execution tree from log lines:
- Detects agent start/complete/error patterns
- Builds nested tree structure (parent-child agent relationships)
- Displays in tree view with status icons and durations

### Notifications

Toast notification system via `useNotifications` hook:
- Types: `info`, `success`, `warning`, `error`
- Auto-dismiss after 5 seconds (configurable)
- Max 3 visible at once
- Triggered by: story completion, story failure, process state changes, API status changes

### CLI Arguments

```
ralph-ultra --project /path/to/project
ralph-ultra -p /path/to/project
```

Validates that the path exists and is a directory. Takes highest priority over saved projects.

---

## 13. Error Handling & Recovery

| Scenario | Handling |
|----------|----------|
| CLI not found | Fallback chain → auto-detect → error notification |
| CLI fails health check | Skip to next in chain → error if all fail |
| API quota exhausted | Fallback to cheaper model → quota warning event |
| Story too complex | Warning with 5s grace period, suggests breaking down |
| AC test timeout | 30s timeout per test, mark criterion as failed |
| Tmux session crash | Detect via 3s session monitor, mark story as failed, retry |
| Quick session end (<10s) | Assume failed resume, clear session ID for fresh start |
| App crash / unclean shutdown | RestorePrompt overlay on next launch |
| Story failure | Up to 3 retries, max 10 iterations total |
| Invalid prd.json | Show specific error message: "missing userStories array" |
| No prd.json | Show "Loading prd.json..." then error in SessionsPane |

---

## 14. Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.tsx` | 55 | Entry point, CLI args parsing, provider setup |
| `src/components/App.tsx` | ~1,720 | Main app, keyboard handling, tab management |
| `src/components/SessionsPane.tsx` | 271 | Story list with PRD watching and selection |
| `src/components/WorkPane.tsx` | ~1,500 | 8-view work area (monitor, status, details, quota, plan, help, version, costs) |
| `src/components/StatusBar.tsx` | 211 | Top bar: progress, API status, mode, CLI/model, git branch |
| `src/components/ShortcutsBar.tsx` | 114 | Bottom bar: context-aware keyboard hints |
| `src/components/ProjectPicker.tsx` | ~400 | Project selection modal (recent/browse/path) |
| `src/components/QuotaDashboard.tsx` | 294 | Provider quota visualization |
| `src/components/ExecutionPlanView.tsx` | 423 | Execution plan table display |
| `src/components/CostDashboard.tsx` | 195 | Cost tracking dashboard |
| `src/components/CommandPalette.tsx` | 253 | Fuzzy command search |
| `src/components/TabBar.tsx` | 108 | Multi-tab navigation |
| `src/components/TracingPane.tsx` | 214 | Agent execution tree view |
| `src/components/SettingsPanel.tsx` | 280 | Settings configuration overlay |
| `src/components/WelcomeOverlay.tsx` | 155 | First-launch tutorial |
| `src/components/VersionView.tsx` | 317 | System info + changelog |
| `src/components/ConfirmDialog.tsx` | 93 | Yes/no confirmation |
| `src/components/NotificationToast.tsx` | 112 | Toast notification stack |
| `src/components/RestorePrompt.tsx` | 65 | Crash recovery prompt |
| `src/utils/ralph-service.ts` | ~2,100 | **Core orchestration engine** (tmux, CLI, prompts, AC testing, retry) |
| `src/utils/config.ts` | 249 | Settings & principles persistence |
| `src/utils/ac-runner.ts` | 187 | Acceptance criteria test execution |
| `src/utils/session-tracker.ts` | 303 | Claude session tracking (model, cost, quota via OAuth) |
| `src/utils/log-parser.ts` | 200 | Agent tree extraction from logs |
| `src/utils/status-check.ts` | 205 | Anthropic API status page checker |
| `src/utils/system-stats.ts` | 82 | System resource monitoring |
| `src/core/types.ts` | 381 | All core business logic types |
| `src/core/task-detector.ts` | 212 | Story → task type classification |
| `src/core/capability-matrix.ts` | 387 | Task type → model recommendation (3 mode mappings) |
| `src/core/execution-planner.ts` | 465 | Full execution plan generation with cost comparisons |
| `src/core/quota-manager.ts` | 558 | Multi-provider quota tracking with model catalog |
| `src/core/cost-tracker.ts` | 243 | Per-story cost recording |
| `src/core/learning-recorder.ts` | 292 | Model performance learning + scoring |
| `src/core/state-store.ts` | 96 | Centralized state with pub/sub |
| `src/core/event-bus.ts` | 33 | Typed event system |
| `src/types/index.ts` | 170 | Shared UI-level TypeScript interfaces |
| `src/remote/server.ts` | 324 | WebSocket server for remote control |
| `src/remote/http-server.ts` | 96 | HTTP server for web monitoring dashboard |
| `src/remote/tailscale.ts` | 155 | Tailscale integration for secure remote access |
| `src/hooks/useTabs.tsx` | 353 | Multi-tab state management |
| `src/hooks/useKeyboard.tsx` | 211 | Priority-based keyboard handler |
| `src/hooks/useExecutionPlan.tsx` | 134 | Plan generation & state updates |
| `src/hooks/useCostTracker.tsx` | 75 | Cost tracking integration |
| `src/hooks/useQuotas.tsx` | 75 | Quota polling & updates |
| `src/hooks/useNotifications.tsx` | 147 | Toast notification system |
| `src/hooks/useMultiTabSession.tsx` | 76 | Per-tab session persistence |
| `src/hooks/useSearch.tsx` | 142 | Log search functionality |
| `src/hooks/useFocus.tsx` | 77 | Pane focus management |
| `src/hooks/useSession.tsx` | 69 | Session lifecycle |
| `src/hooks/useTheme.tsx` | 57 | Theme switching |

---

## 15. Recommendations for macOS App Rebuild

### What to keep (core value)
- PRD-driven workflow (the `prd.json` contract is the heart of Ralph)
- Intelligent model selection pipeline (task detection → capability matching → quota-aware selection)
- Learning system (performance recording → confidence-adjusted recommendations)
- Multi-project tabs with isolated execution
- AC-based verification loop with retry logic
- Cost tracking with estimated vs actual variance
- Pause/resume with session persistence
- CLI fallback chain with health checks

### What to replace
- **React Ink → SwiftUI/AppKit**: Native macOS UI with proper window management, resizable panes, native menus
- **Tmux → native Process management**: Use `Process`/`NSTask` for subprocess management instead of tmux dependency. Capture stdout/stderr directly.
- **Terminal output parsing → structured IPC**: Use JSON-based communication with CLI tools (`--output-format stream-json`) instead of parsing raw terminal output
- **File-based config → UserDefaults/CoreData**: Native macOS persistence for settings, learning DB, cost history
- **WebSocket remote → native sharing**: Use Multipeer Connectivity or CloudKit for remote monitoring
- **fs.watchFile → FSEvents**: Use macOS native file system events instead of polling

### UX improvements to target
- Drag-and-drop project opening
- Native file browser for project selection (NSOpenPanel)
- Rich text log display (syntax highlighting, collapsible sections)
- Menu bar integration (progress indicator, quick actions)
- Native notifications (UNUserNotificationCenter)
- Resizable split views instead of fixed panes
- Inline story editing (modify PRD from the UI)
- Visual execution plan (timeline/Gantt view instead of text table)
- Real-time token/cost counter with animations
- Spotlight integration for command palette

### Stability improvements to target
- Proper process lifecycle management (no tmux dependency)
- Structured error types instead of string parsing
- Proper cancellation tokens for async operations
- Native keychain integration for API keys
- Crash reporting with structured state snapshots
- Automatic PRD validation before execution
