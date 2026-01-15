# Ralph Ultra

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
```

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

This is a known issue. Use Claude CLI instead:
```bash
npm install -g @anthropic-ai/claude-code
```

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

## License

MIT

## Credits

- Enhanced by the 48Nauts team

---

This project was inspired by https://github.com/snarktank/ralph
