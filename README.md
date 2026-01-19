# Ralph Ultra

[![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)](https://github.com/48Nauts-Operator/ralph-ultra/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-48Nauts--Operator%2Fralph--ultra-black?logo=github)](https://github.com/48Nauts-Operator/ralph-ultra)

**Autonomous AI Agent System with Health Monitoring, Budget Planning & Sub-Agent Delegation**

Ralph Ultra is an enhanced version of the Ralph autonomous coding agent. It adds production-grade features for running AI agents unattended on large projects.

## Quick Install

**Option 1: Let your AI do it**

In your opencode/claude session, just say:
```
Please install Ralph Ultra from https://github.com/48Nauts-Operator/ralph-ultra
```

**Option 2: Manual setup**

See [Installation](#installation) below.

---

## Interactive Terminal UI (NEW in v1.5.0)

Ralph Ultra now includes an **interactive Terminal UI (TUI)** for real-time project monitoring and control.

### Quick Start

```bash
ralph tui                    # Launch in current directory
ralph tui /path/to/project  # Launch for specific project
```

### What You Get

| Panel | Shows |
|-------|-------|
| **Top Bar** | Version, quota %, hybrid status, running state |
| **Left Panel** | PRD progress, story status (✓ complete, ▸ in progress, pending) |
| **Right Panel** | Live logs, system status, log browser |
| **Input Bar** | Slash commands and interactive control |

### Slash Commands

| Command | Description |
|---------|-------------|
| `/help`, `/h` | Show help overlay |
| `/quit`, `/q` | Exit TUI |
| `/monitor` | Switch to live monitor view |
| `/status` | Show system status (quota, hybrid, timing) |
| `/logs` | Browse log files |
| `/run` | Start Ralph on current project |
| `/stop` | Stop running Ralph process |
| `/report [--open]` | Generate HTML report |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Switch to monitor view |
| `2` | Switch to status view |
| `3` | Switch to logs view |
| `?` | Show help |
| `r` | Run Ralph |
| `s` | Stop Ralph |
| `Tab` | Cycle through views |

### Requirements

- **tmux** (`brew install tmux` on macOS, `apt install tmux` on Linux)
- Project with `prd.json`

### TUI vs. Standard Mode

| Feature | TUI Mode | Standard Mode |
|---------|----------|---------------|
| **Interactivity** | Full interactive control | Fire-and-forget |
| **Monitoring** | Real-time visual dashboard | Log files only |
| **Control** | Start/stop from TUI | Separate commands |
| **Reports** | Generate on-demand | Auto-generated at end |
| **Use Case** | Active development | CI/CD, automation |

---

## Features

| Feature | Description |
|---------|-------------|
| **Health Monitoring** | Auto-restart on stalls, resource warnings, failure analysis |
| **Cost Tracking** | Real-time token usage and cost per story |
| **Budget Planning** | Quota-aware execution strategies |
| **Sub-Agent Delegation** | Route tasks to specialized agents (Oracle, Explore, Librarian) |
| **ETA Calculator** | Learned completion estimates with confidence levels |
| **HTML Reports** | Beautiful dark-themed progress reports |
| **Git Diff Tracking** | Files changed and lines added/removed per story |
| **Webhook Notifications** | Slack, Discord, NTFY, generic webhooks |

## Prerequisites

| Requirement | Install | Notes |
|-------------|---------|-------|
| **jq** | `brew install jq` (macOS) or `apt install jq` (Linux) | JSON processing |
| **tmux** | `brew install tmux` (macOS) or `apt install tmux` (Linux) | Session management |
| **Claude CLI** | `npm install -g @anthropic-ai/claude-code` | **Recommended** - works headlessly |
| **OpenCode** | https://opencode.ai | Alternative (has known CLI issues) |

### AI CLI Installation

Ralph Ultra supports multiple AI CLIs. **Claude CLI is recommended** as it works reliably in headless/automation mode.

**Option 1: Claude CLI (Recommended)**
```bash
npm install -g @anthropic-ai/claude-code
```

**Option 2: OpenCode CLI**
```bash
# Via npm
npm install -g opencode

# Or download from https://opencode.ai
```

> **Note**: OpenCode's `opencode run` command has known issues in headless mode (see [#8502](https://github.com/anomalyco/opencode/issues/8502), [#8203](https://github.com/anomalyco/opencode/issues/8203)). Claude CLI is preferred until these are fixed.

### oh-my-opencode (Optional, for OpenCode users)

```bash
git clone https://github.com/code-yeongyu/oh-my-opencode ~/.config/opencode
```

## Installation

```bash
git clone https://github.com/48Nauts-Operator/ralph-ultra.git
cd ralph-ultra
./scripts/setup.sh
```

The setup wizard will:
1. **Check prerequisites** - Verify jq, tmux, and at least one AI CLI (claude or opencode)
2. **Install scripts** - Copy Ralph Ultra to `~/.config/opencode/scripts/ralph-ultra/`
3. **Configure models** - Add cost-optimized agent models (if using oh-my-opencode)

### Add to PATH

Add this to your `.bashrc` or `.zshrc`:

```bash
export PATH="$PATH:$HOME/.config/opencode/scripts/ralph-ultra"
```

Then restart your terminal or run `source ~/.bashrc`.

## Usage

One command does everything:

```bash
ralph.sh /path/to/project
```

Iterations are **auto-calculated** based on remaining stories (stories × 3, min 10, max 200). Override with a second argument if needed.

### What happens when you run Ralph Ultra

1. **Validates project** - Checks project path exists and has `prd.json`
2. **Creates logs directory** - All logs go to `project/logs/`
3. **Budget check** - Asks if you want to set a max budget, runs cost analysis
4. **Starts health monitoring** - Launches monitor in tmux session
5. **Executes agent loop** - Works through PRD stories one by one
6. **Sends notifications** - Webhooks/NTFY on completion, errors, restarts
7. **Generates HTML report** - Creates `ralph-report.html` with full summary

### Command Options

```bash
ralph.sh /path/to/project           # Full run (auto-calculates iterations)
ralph.sh /path/to/project 100       # Override with 100 iterations
ralph.sh --skip-budget /path/to/project  # Skip budget question
ralph.sh --no-monitor /path/to/project   # Run without monitoring (not recommended)
ralph.sh --status /path/to/project  # Check current status
ralph.sh --report /path/to/project  # Generate HTML report
ralph.sh --worktree /path/to/project     # Create git worktree instead of branch
ralph.sh --branch feature/x /path/to/project  # Specify custom branch name
```

### Git Safety (Branch Protection)

Ralph Ultra automatically protects your main branch:

| Scenario | Behavior |
|----------|----------|
| On `main` or `master` | Auto-creates `ralph/<project-name>` branch |
| On feature branch | Continues on current branch |
| With `--worktree` | Creates separate worktree directory |
| With `--branch NAME` | Uses specified branch name |
| Not a git repo | Warns but continues |

This prevents accidental commits to main when running autonomously.

### What gets created in your project

```
your-project/
├── prd.json              # You create this (required)
├── progress.txt          # Progress log with learnings
├── logs/                 # All log files
│   └── ralph-monitor.log
├── ralph-report.html     # HTML progress report (generated at end)
├── archive/              # Previous runs archived here
└── .ralph-*/             # Internal state files
```

## Notifications

### NTFY Push Notifications

```bash
export NTFY_ENABLED=true
export NTFY_TOPIC="ralph-myproject"
export NTFY_SERVER="https://ntfy.sh"  # Optional, defaults to ntfy.sh

ralph.sh /path/to/project
```

You'll receive push notifications for:
- Story completions
- Errors and restarts
- Final completion

### Slack Webhook

```bash
export RALPH_SLACK_WEBHOOK="https://hooks.slack.com/services/XXX/YYY/ZZZ"

ralph.sh /path/to/project
```

### Discord Webhook

```bash
export RALPH_DISCORD_WEBHOOK="https://discord.com/api/webhooks/XXX/YYY"

ralph.sh /path/to/project
```

### Generic Webhook

```bash
export RALPH_WEBHOOK_URL="https://your-server.com/webhook"

ralph.sh /path/to/project
```

Sends JSON payload:
```json
{
  "event": "story_complete|error|restart|complete",
  "project": "project-name",
  "story": "STORY-001",
  "message": "Details..."
}
```

## Model Configuration

Ralph Ultra uses different AI models for different tasks to optimize cost:

| Agent | Model | Cost | Why |
|-------|-------|------|-----|
| **Sisyphus** | Sonnet 4.5 | ~$3/M tokens | Main agent - balanced |
| **oracle** | Opus 4.5 | ~$15/M tokens | Complex reasoning - sparingly |
| **explore** | Haiku 4.5 | ~$0.25/M tokens | Codebase search - cheap |
| **librarian** | Haiku 4.5 | ~$0.25/M tokens | Doc lookup - cheap |
| **frontend-ui-ux-engineer** | Sonnet 4.5 | ~$3/M tokens | UI work |
| **document-writer** | Sonnet 4.5 | ~$3/M tokens | Documentation |

Setup **merges** these into your existing `oh-my-opencode.json` - your custom agents are preserved.

## Budget Planning

Ralph Ultra asks about budget before starting. You can also run manually:

```bash
ralph-budget.sh /path/to/project --budget 20
```

Shows:
- Remaining stories by complexity
- 5 execution strategies with cost estimates
- Recommendation based on your budget

## Quota Management (Claude Pro)

For Claude Pro subscribers, Ralph Ultra includes intelligent quota management with automatic cooldown handling.

### Features

| Feature | Description |
|---------|-------------|
| **Pre-flight check** | Checks quota before starting a run |
| **Cross-platform** | Works on macOS (Keychain) and Linux (~/.claude/.credentials.json) |
| **Auto-cooldown** | Detects quota exhaustion and waits for reset |
| **Smart resume** | Automatically resumes after cooldown + buffer time |

### Usage

```bash
# Check current quota status
ralph-quota.sh --status

# Check quota and wait if exhausted
ralph-quota.sh --wait

# Skip quota check when running Ralph
ralph.sh --skip-quota /path/to/project
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RALPH_QUOTA_THRESHOLD` | 90 | Warning threshold (%) |
| `RALPH_QUOTA_CRITICAL` | 98 | Pause threshold (%) |
| `RALPH_COOLDOWN_BUFFER` | 5 | Extra minutes after reset |
| `RALPH_SKIP_QUOTA_CHECK` | false | Skip quota checking |
| `CLAUDE_CODE_OAUTH_TOKEN` | - | Override OAuth token |

### How It Works

1. **Before starting**: Ralph checks your Claude Pro 5-hour and 7-day utilization
2. **If quota < 90%**: Proceeds normally
3. **If quota 90-98%**: Warns but continues
4. **If quota ≥ 98%**: Pauses and offers to wait for cooldown
5. **During cooldown**: Shows progress bar with estimated resume time
6. **After reset**: Adds 5-minute buffer then auto-resumes

### Credential Storage

| Platform | Location |
|----------|----------|
| macOS | Keychain (`Claude Code-credentials`) |
| Linux | `~/.claude/.credentials.json` |
| Both | `CLAUDE_CODE_OAUTH_TOKEN` env var |

## Hybrid LLM Routing (80/20 Cost Optimization)

Ralph Ultra can route tasks to local LLMs for massive cost savings while preserving quality where it matters.

### The 80/20 Principle

| Task Type | LLM Choice | Why |
|-----------|------------|-----|
| **Planning/Architecture** | Opus 4.5 (API) | Needs best reasoning |
| **Code Review** | Opus 4.5 (API) | Quality critical |
| **Complex Debugging** | Sonnet 4.5 (API) | Needs context |
| **Code Generation** | Local (Qwen/DeepSeek) | Local excels here |
| **Simple Edits** | Local (fast model) | Trivial tasks |
| **Documentation** | Local | Good enough |
| **Search/Analysis** | Local (fast) | Speed matters |

### Quick Start

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull recommended models
ollama pull qwen2.5-coder:32b    # Primary (needs 20GB+ VRAM)
ollama pull qwen2.5-coder:7b     # Fast model for simple tasks

# 3. Run Ralph with hybrid mode
ralph.sh --hybrid balanced /path/to/project
```

### Hybrid Modes

| Mode | Local % | Best For |
|------|---------|----------|
| `aggressive` | 90% | Maximum savings, hobby projects |
| `balanced` | 70% | Production work, best tradeoff |
| `conservative` | 40% | Quality-critical projects |
| `api-only` | 0% | Current behavior (no local) |
| `local-only` | 100% | Testing, air-gapped environments |

### Usage

```bash
# Enable hybrid mode
ralph.sh --hybrid balanced /path/to/project

# Check hybrid status
ralph.sh --hybrid-status

# View savings statistics
ralph.sh --hybrid-stats

# Or use environment variable
export RALPH_HYBRID_MODE=balanced
ralph.sh /path/to/project
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RALPH_HYBRID_MODE` | - | Routing mode |
| `RALPH_LOCAL_PROVIDER` | ollama | Provider: ollama, lmstudio, vllm, openai |
| `RALPH_LOCAL_ENDPOINT` | http://localhost:11434 | Local LLM API endpoint |
| `RALPH_LOCAL_MODEL` | qwen2.5-coder:32b | Primary model for complex tasks |
| `RALPH_LOCAL_FAST_MODEL` | qwen2.5-coder:7b | Fast model for simple tasks |
| `RALPH_FALLBACK_TO_API` | true | Fallback to API if local fails |

### Supported Local LLM Providers

| Provider | Setup |
|----------|-------|
| **Ollama** | `ollama serve` (easiest) |
| **LM Studio** | Start server in app |
| **vLLM** | `vllm serve <model>` |
| **Any OpenAI-compatible** | Set `RALPH_LOCAL_ENDPOINT` |

### Recommended Models

| Model | VRAM | Quality | Speed |
|-------|------|---------|-------|
| `qwen2.5-coder:32b` | 20GB+ | Excellent | Moderate |
| `qwen2.5-coder:14b` | 10GB+ | Very Good | Good |
| `qwen2.5-coder:7b` | 5GB+ | Good | Fast |
| `deepseek-coder-v2` | 16GB+ | Excellent | Moderate |
| `codellama:34b` | 20GB+ | Very Good | Moderate |

### Cost Savings Example

For a typical 10-story PRD run:

| Mode | API Cost | Local Cost | Savings |
|------|----------|------------|---------|
| api-only | ~$15 | $0 | - |
| balanced | ~$5 | $0 (electricity) | **~$10 (67%)** |
| aggressive | ~$2 | $0 (electricity) | **~$13 (87%)** |

## Persistent Timing Database

Ralph Ultra learns from every run and stores timing data globally for better predictions across all projects.

### Features

| Feature | Description |
|---------|-------------|
| **Global learning** | Data persists across all projects in `~/.ralph-ultra/` |
| **Pattern recognition** | Learns timing for patterns like "integration", "auth", "api" |
| **Dual backend** | SQLite (if available) or JSON (zero deps) |
| **Predictive ETAs** | Uses historical data for accurate time estimates |
| **Migration** | Import existing per-project timing data |

### Usage

```bash
# View statistics
ralph-timing-db.sh --stats

# Predict duration for a story
ralph-timing-db.sh --predict "US-042-integration-tests"

# Migrate existing project data
ralph-timing-db.sh --migrate /path/to/project

# Force backend
RALPH_TIMING_BACKEND=sqlite ralph-timing-db.sh --stats
RALPH_TIMING_BACKEND=json ralph-timing-db.sh --stats
```

### Backends

| Backend | Pros | Cons |
|---------|------|------|
| **SQLite** (default if available) | Fast queries, aggregations, SQL support | Requires sqlite3 |
| **JSON** (fallback) | Zero dependencies, portable | Slower for large datasets |

### What's Tracked

- Story completion times (actual vs estimated)
- Complexity patterns (integration, auth, api, frontend, etc.)
- Success/failure rates
- Per-project statistics
- Performance trends over time

### Storage Location

```
~/.ralph-ultra/
├── timing.db           # SQLite database (if available)
├── timing-db.json      # JSON database (fallback)
└── ...
```

## Troubleshooting

### No AI CLI found

Ralph Ultra looks for CLIs in this order: `claude` > `opencode` > `amp`

```bash
# Check what's installed
which claude opencode amp

# Install Claude CLI (recommended)
npm install -g @anthropic-ai/claude-code
```

### OpenCode `run` command hangs or fails

**Known Issue (as of Jan 2026)**: OpenCode's `opencode run` command has bugs that prevent headless/automated execution:

- **[#8502](https://github.com/anomalyco/opencode/issues/8502)**: "Session not found" error - occurs when `OPENCODE_SERVER_PASSWORD` env var is set
- **[#8203](https://github.com/anomalyco/opencode/issues/8203)**: Command hangs forever on API errors instead of exiting

**Workaround**: Use Claude CLI instead (recommended):
```bash
npm install -g @anthropic-ai/claude-code
```

Ralph Ultra will automatically prefer Claude CLI when available.

### Setup fails with "oh-my-opencode not found"

Only needed if using OpenCode:
```bash
git clone https://github.com/code-yeongyu/oh-my-opencode ~/.config/opencode
```

### Check current status

```bash
ralph.sh --status /path/to/project
```

### View monitor logs

```bash
tail -f /path/to/project/logs/ralph-monitor.log
```

### Attach to tmux session

```bash
tmux attach -t ralph
# Detach with: Ctrl+B, then D
```

## Known Issues

### OpenCode CLI (January 2026)

The `opencode run` command currently has issues that prevent reliable headless execution:

| Issue | Description | Status |
|-------|-------------|--------|
| [#8502](https://github.com/anomalyco/opencode/issues/8502) | "Session not found" when auth env vars set | Open |
| [#8203](https://github.com/anomalyco/opencode/issues/8203) | Hangs forever on API errors | Open |
| [#8383](https://github.com/anomalyco/opencode/issues/8383) | Stuck without error messages | Open |

**Recommendation**: Use Claude CLI (`npm install -g @anthropic-ai/claude-code`) until these are resolved. Ralph Ultra automatically prefers Claude CLI when available.

## License

MIT

## Credits

- Enhanced by the 48Nauts team

---

This project was inspired by https://github.com/snarktank/ralph
