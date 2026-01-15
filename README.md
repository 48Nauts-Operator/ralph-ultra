# Ralph Ultra

**Autonomous AI Agent System with Health Monitoring, Budget Planning & Sub-Agent Delegation**

Ralph Ultra is an enhanced version of the Ralph autonomous coding agent. It adds production-grade features for running AI agents unattended on large projects.

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

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/48Nauts-Operator/ralph-ultra.git
cd ralph-ultra

# 2. Run setup wizard (configures opencode for cost optimization)
./scripts/setup.sh

# 3. In your project directory, create a PRD
cd /path/to/your/project
opencode "Create a prd.json for this project using the prd skill"

# 4. Check your budget
/path/to/ralph-ultra/scripts/ralph-budget.sh . --budget 20

# 5. Run Ralph Ultra with monitoring
/path/to/ralph-ultra/scripts/ralph-monitor.sh . &
/path/to/ralph-ultra/scripts/ralph.sh . 50
```

## Installation

### Prerequisites

- **jq** - JSON processor (`brew install jq` or `apt install jq`)
- **tmux** - Terminal multiplexer (`brew install tmux` or `apt install tmux`)
- **opencode** - AI CLI (https://opencode.ai) - or `amp` or `claude`

### Setup

```bash
# Interactive setup (recommended)
./scripts/setup.sh

# Or apply directly
./scripts/setup.sh --apply

# Or merge with existing config
./scripts/setup.sh --merge

# Just show what would change
./scripts/setup.sh --diff
```

## Scripts

| Script | Purpose |
|--------|---------|
| `ralph.sh` | Main agent loop - executes PRD stories one by one |
| `ralph-monitor.sh` | Health monitor with auto-restart |
| `ralph-budget.sh` | Budget planner and strategy advisor |
| `setup.sh` | Configure opencode for Ralph Ultra |
| `prompt.md` | Agent instructions (read by ralph.sh) |

## Usage

### Basic Execution

```bash
# Run 10 iterations (default)
./scripts/ralph.sh /path/to/project

# Run 50 iterations
./scripts/ralph.sh /path/to/project 50
```

### With Monitoring

```bash
# Start monitor in background (checks every 5 minutes)
./scripts/ralph-monitor.sh /path/to/project &

# Start Ralph
./scripts/ralph.sh /path/to/project 50

# Check status anytime
./scripts/ralph-monitor.sh --status /path/to/project

# Generate HTML report
./scripts/ralph-monitor.sh --report /path/to/project
```

### Budget Planning

```bash
# Auto-detect budget from API keys
./scripts/ralph-budget.sh /path/to/project

# Specify budget manually
./scripts/ralph-budget.sh /path/to/project --budget 20

# Output includes:
# - Story count by complexity
# - 5 execution strategies with costs
# - Recommendation based on budget
# - Ready-to-use model config
```

## Configuration

### Model Configuration

Ralph Ultra configures these agents in `~/.config/opencode/oh-my-opencode.json`:

```json
{
  "agents": {
    "Sisyphus": { "model": "anthropic/claude-sonnet-4-20250514" },
    "oracle": { "model": "anthropic/claude-opus-4-5" },
    "explore": { "model": "anthropic/claude-3-5-haiku-20241022" },
    "librarian": { "model": "anthropic/claude-3-5-haiku-20241022" },
    "frontend-ui-ux-engineer": { "model": "anthropic/claude-sonnet-4-20250514" },
    "document-writer": { "model": "anthropic/claude-sonnet-4-20250514" }
  }
}
```

### Cost Optimization Strategy

| Agent | Model | Cost | Usage |
|-------|-------|------|-------|
| Sisyphus | Sonnet 4 | ~$3/M | Main work (balanced) |
| Oracle | Opus 4.5 | ~$15/M | Complex reasoning (sparingly) |
| Explore | Haiku 3.5 | ~$0.25/M | Codebase search (cheap) |
| Librarian | Haiku 3.5 | ~$0.25/M | Doc lookup (cheap) |

### Webhook Notifications

Set environment variables:

```bash
# Slack
export RALPH_SLACK_WEBHOOK="https://hooks.slack.com/services/..."

# Discord
export RALPH_DISCORD_WEBHOOK="https://discord.com/api/webhooks/..."

# NTFY
export RALPH_NTFY_TOPIC="your-topic"
export RALPH_NTFY_SERVER="https://ntfy.sh"  # optional

# Generic webhook
export RALPH_WEBHOOK_URL="https://your-server.com/webhook"
```

### Project Configuration

Each project needs:

1. **prd.json** - Product requirements with user stories
2. **progress.txt** - Created automatically, tracks progress
3. **opencode.json** - Permissions (optional)

```json
// opencode.json - allow all permissions for autonomous execution
{
  "$schema": "https://opencode.ai/config.json",
  "permission": "allow"
}
```

## PRD Format

Ralph Ultra expects a `prd.json` with this structure:

```json
{
  "projectName": "my-project",
  "branchName": "feat/my-feature",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "What needs to be done",
      "priority": 1,
      "complexity": "simple",
      "passes": false
    }
  ]
}
```

Use the `prd` skill in opencode to generate this automatically.

## Monitor Features

### Health Checks

- **Activity Detection** - Monitors tmux session for output
- **Resource Warnings** - Disk (80%/90%) and memory alerts
- **Auto-Restart** - Restarts agent if stalled for too long

### Failure Analysis

When a restart is triggered, the monitor saves:
- Last 100 lines of tmux output
- Resource status at time of failure
- Git status and current story

Saved to `.ralph-failures/` for debugging.

### HTML Report

```bash
./scripts/ralph-monitor.sh --report .
open ralph-report.html
```

Includes:
- Status cards (stories, time, ETA, restarts)
- Git stats (files changed, lines added/removed)
- Cost breakdown (tokens, dollars)
- Stories table with timing vs estimates
- Event timeline

## Sub-Agent Delegation

Ralph Ultra's prompt.md instructs the agent to delegate:

| Task | Delegate To | Cost |
|------|-------------|------|
| Complex architecture | `oracle` | High |
| Stuck after 2+ attempts | `oracle` | High |
| Find code patterns | `explore` | Low |
| External library docs | `librarian` | Low |

This optimizes cost by using expensive models only when needed.

## Troubleshooting

### Agent Not Starting

```bash
# Check if CLI is available
which opencode  # or amp, claude

# Check permissions
cat opencode.json  # should have "permission": "allow"
```

### Monitor Not Detecting Activity

```bash
# Check tmux session exists
tmux list-sessions | grep ralph

# Check monitor log
tail -f ralph-monitor.log
```

### High Costs

```bash
# Check budget before running
./scripts/ralph-budget.sh . --budget YOUR_BUDGET

# Use minimal strategy for tight budgets
# Edit oh-my-opencode.json to use Haiku for main agent
```

## License

MIT

## Credits

- Enhanced by the 48Nauts team

---

This project was inspired by https://github.com/snarktank/ralph
