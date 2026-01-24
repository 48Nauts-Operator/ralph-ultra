# Settings & Execution Mode - Quick Reference Guide

## File Locations

| Location | Purpose | Format | Auto-Created |
|----------|---------|--------|--------------|
| `~/.config/ralph-ultra/settings.json` | Global app settings | JSON | Yes |
| `~/.config/ralph-ultra/principles.md` | Custom coding principles | Markdown | Yes |
| `~/.config/ralph-ultra/.first-launch` | First launch marker | Text timestamp | Yes |
| `<project>/prd.json` | Project manifest + CLI overrides | JSON | User |
| `<project>/progress.txt` | Execution progress | JSON | Automatic |
| `<project>/.ralph-backups/` | PRD backup history | JSON (multiple) | Automatic |

## Settings.json Schema

```json
{
  "theme": "dracula",
  "notificationSound": true,
  "debugMode": false,
  "preferredCli": "claude",
  "cliFallbackOrder": ["opencode", "codex", "gemini"],
  "openProjects": [
    {
      "path": "/Users/user/projects/proj1",
      "name": "Project 1",
      "color": "#ff0000"
    }
  ],
  "activeProjectPath": "/Users/user/projects/proj1",
  "recentProjects": [
    {
      "path": "/Users/user/projects/proj1",
      "name": "Project 1",
      "color": "#ff0000",
      "icon": "🚀",
      "lastAccessed": "2026-01-24T15:30:00Z"
    }
  ]
}
```

## Execution Modes

| Mode | Cost | Speed | Quality | Use Case | Primary Model |
|------|------|-------|---------|----------|----------------|
| **balanced** | $$ | Medium | Good | General use | Claude Sonnet |
| **super-saver** | $ | Slower | Good | Budget-conscious | Haiku/GPT-mini |
| **fast-delivery** | $$$ | Fast | Excellent | Time-critical | Opus/GPT-4o |

## API Functions

### config.ts

```typescript
// Directory & First Launch
ensureConfigDir(): void
getConfigDir(): string
isFirstLaunch(): boolean
markFirstLaunchComplete(): void

// Settings I/O
loadSettings(): Settings
saveSettings(settings: Settings): void

// Recent Projects
addToRecentProjects(project: {...}): void
getRecentProjects(): RecentProject[]
clearRecentProjects(): void

// Principles
ensurePrinciplesFile(): void
loadPrinciples(): string | null
getPrinciplesPath(): string
```

### useExecutionPlan Hook

```typescript
interface UseExecutionPlanReturn {
  plan: ExecutionPlan | null
  loading: boolean
  error: string | null
  refresh: () => void
  currentMode: ExecutionMode
  setMode: (mode: ExecutionMode) => void
}

// Usage
const { plan, loading, error, refresh, currentMode, setMode } = 
  useExecutionPlan('/path/to/project')
```

### getRecommendedModel

```typescript
getRecommendedModel(
  taskType: TaskType,
  quotas?: ProviderQuota[],
  mode?: ExecutionMode
): {
  modelId: string
  provider: Provider
  reason: string
}
```

## Keyboard Shortcuts

### SettingsPanel (Press '?')
| Key | Action |
|-----|--------|
| `1-9` | Select themes 1-9 |
| `0` | Select theme 10 |
| `-` | Select theme 11 |
| `=` | Select theme 12 |
| `s` | Toggle sound |
| `c` | Cycle preferred CLI |
| `q` / `ESC` | Close settings |

### ExecutionPlanView (Press '?')
| Key | Action |
|-----|--------|
| `↑` / `k` | Navigate up |
| `↓` / `j` | Navigate down |
| `m` / `M` | Cycle execution mode |
| `r` / `R` | Refresh plan |

## Task Types (13 Total)

```
1. complex-integration    - Multi-system architectural work
2. mathematical           - Algorithms and calculations
3. backend-api           - REST/GraphQL endpoints
4. backend-logic         - Business logic & services
5. frontend-ui           - Visual components & styling
6. frontend-logic        - Hooks, state management
7. database              - Schema, queries, migrations
8. testing               - Unit, integration, E2E
9. documentation         - README, API docs
10. refactoring          - Code cleanup & organization
11. bugfix               - Issue resolution
12. devops               - CI/CD, Docker, deployment
13. config               - Setup & configuration
```

## CLI Options

```
Available CLIs (in detection order):
- claude          (Anthropic - preferred)
- opencode        (OpenAI CodeLens)
- codex           (OpenAI Codex)
- gemini          (Google Gemini)
- aider           (Multi-backend)
- cody            (Sourcegraph)
```

## Model Catalog

### Anthropic
- `claude-opus-4-20250514` (Most capable)
- `claude-sonnet-4-20250514` (Balanced)
- `claude-3-5-haiku-20241022` (Fast/cheap)

### OpenAI
- `gpt-4o` (Most capable)
- `gpt-4o-mini` (Balanced)
- `o3-mini` (Math/reasoning)

### Google
- `gemini-2.0-flash` (Fast/cheap)
- `gemini-1.5-pro` (Long-context)

### Open Source
- `llama-3.1-70b` (OpenRouter)
- `qwen-2.5-coder` (OpenRouter)
- Local models (via OpenRouter)

## Mode-Specific Models

### Balanced (Default)
- Complex tasks: Claude Opus
- General tasks: Claude Sonnet
- Simple tasks: Claude Haiku
- Testing: GPT-4o
- Documentation: Gemini Flash

### Super Saver (Cost-optimized)
- Complex: Sonnet (required for quality)
- General: Haiku
- Simple: Haiku
- Testing: GPT-4o-mini
- Documentation: Gemini Flash

### Fast Delivery (Speed-optimized)
- Complex: Claude Opus
- General: Claude Sonnet
- Testing: GPT-4o
- Documentation: Claude Sonnet

## Provider Pricing

| Provider | Input (per 1M tokens) | Output (per 1M tokens) |
|----------|----------------------|----------------------|
| Anthropic | $3.00 | $15.00 |
| OpenAI | $10.00 | $30.00 |
| OpenRouter | $5.00 | $15.00 |
| Gemini | $0.50 | $1.50 |
| Local | $0.00 | $0.00 |

## Example Costs

### Simple Task (5k input + 2k output tokens)
- Haiku: $0.015
- GPT-4o-mini: $0.110
- Sonnet: $0.045
- Opus: $0.135

### Medium Task (15k input + 6k output tokens)
- Haiku: $0.045
- GPT-4o-mini: $0.330
- Sonnet: $0.135
- Opus: $0.405

### Complex Task (40k input + 15k output tokens)
- Haiku: $0.120
- GPT-4o-mini: $0.880
- Sonnet: $0.360
- Opus: $1.080

## Duration Estimates

| Complexity | Duration | Input Tokens | Output Tokens |
|------------|----------|--------------|---------------|
| Simple | 15 min | 5,000 | 2,000 |
| Medium | 30 min | 15,000 | 6,000 |
| Complex | 60 min | 40,000 | 15,000 |

## CLI Detection Priority

1. **PRD Override** - `prd.json` cli field
2. **Global Preference** - `settings.preferredCli`
3. **PRD Fallback** - `prd.json` cliFallbackOrder
4. **Global Fallback** - `settings.cliFallbackOrder`
5. **Auto-detect** - Try each CLI in order
6. **Error** - No CLI found

## Important Implementation Details

### Execution Mode NOT Persisted
- Mode is stored in React component state only
- Resets to 'balanced' on app restart
- Consider adding to settings if persistence needed

### Recent Projects Limit
- Maximum 10 projects stored
- Automatically sorted by last accessed
- Older items removed when limit exceeded

### CLI Health Checking
- CLIs checked before execution
- 5-minute cache for health status
- Automatic fallback if primary CLI fails

### Quota-Aware Selection
- Plan checks current quotas
- Falls back to alternative models if needed
- Includes quota warnings in summary
- Explicit "can complete" indicator

### Learning System
- Records all story executions
- Tracks by model + task type
- Calculates confidence scores
- Influences future plan generation

## Common Settings Operations

### Load All Settings
```typescript
import { loadSettings } from '@utils/config';
const settings = loadSettings();
```

### Add Recent Project
```typescript
import { addToRecentProjects } from '@utils/config';
addToRecentProjects({
  path: '/path/to/project',
  name: 'Project Name',
  color: '#ff0000'
});
```

### Get Execution Plan with Mode
```typescript
import { useExecutionPlan } from '@hooks/useExecutionPlan';
const { plan, currentMode, setMode } = useExecutionPlan('/path/to/project');

// Switch mode
setMode('super-saver');
```

### Detect CLI
```typescript
import { RalphService } from '@utils/ralph-service';
const ralph = new RalphService('/path/to/project');
const cli = ralph.getAvailableCLI();
```

## Data Persistence Summary

### Currently Persisted
✅ Theme selection
✅ Preferred CLI
✅ CLI fallback chain
✅ Recent projects
✅ Notification sound
✅ Debug mode
✅ Learning data

### NOT Persisted (In-Memory Only)
❌ Execution mode
❌ Active project
❌ Session state
❌ Cost tracking (maybe)

## PRD Configuration Example

```json
{
  "project": "My Project",
  "cli": "claude",
  "cliFallbackOrder": ["opencode", "codex"],
  "branchName": "feature/my-feature",
  "userStories": [...]
}
```

## Testing Settings Changes

### Verify Settings Saved
```bash
cat ~/.config/ralph-ultra/settings.json
```

### Check Recent Projects
```bash
cat ~/.config/ralph-ultra/settings.json | jq '.recentProjects'
```

### Test CLI Detection
```bash
which claude && echo "claude installed"
which opencode && echo "opencode installed"
```

## Troubleshooting

### Settings Not Saving
- Check `~/.config/ralph-ultra/` exists
- Verify write permissions: `ls -la ~/.config/ralph-ultra/`
- Check file permissions on settings.json

### Wrong CLI Selected
- Check settings.json for `preferredCli`
- Check PRD for cli override
- Run `which <cli>` to verify installation

### Execution Mode Reverts
- Expected behavior (not persisted currently)
- Mode selection is session-only
- Save in settings.json if persistence needed

### Recent Projects Not Updating
- Check `addToRecentProjects()` is called
- Verify settings.json is writable
- Check recentProjects array length

## Environment Variables

No special environment variables for settings management. CLI detection uses system PATH and which command.

---

Quick Reference Generated: 2026-01-24
For detailed information, see:
- SETTINGS_EXPLORATION_REPORT.md
- SETTINGS_ARCHITECTURE.md
