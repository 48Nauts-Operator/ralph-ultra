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

## Prerequisites

Before installing Ralph Ultra, you need:

| Requirement | Install |
|-------------|---------|
| **jq** | `brew install jq` (macOS) or `apt install jq` (Linux) |
| **tmux** | `brew install tmux` (macOS) or `apt install tmux` (Linux) |
| **opencode** | https://opencode.ai |
| **oh-my-opencode** | https://github.com/code-yeongyu/oh-my-opencode |

### Installing oh-my-opencode

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
1. **Check prerequisites** - Verify jq, tmux, opencode, and oh-my-opencode are installed
2. **Install scripts** - Copy Ralph Ultra to `~/.config/opencode/scripts/ralph-ultra/`
3. **Configure models** - Add cost-optimized agent models to `oh-my-opencode.json` (see below)

## What Gets Configured

### Model Configuration Explained

Ralph Ultra uses different AI models for different tasks to optimize cost:

| Agent | Model | Cost | Why |
|-------|-------|------|-----|
| **Sisyphus** | Sonnet 4 | ~$3/M tokens | Main agent - good balance of quality and cost |
| **oracle** | Opus 4.5 | ~$15/M tokens | Complex reasoning - used sparingly for hard problems |
| **explore** | Haiku 3.5 | ~$0.25/M tokens | Codebase search - fast and cheap |
| **librarian** | Haiku 3.5 | ~$0.25/M tokens | Doc lookup - fast and cheap |
| **frontend-ui-ux-engineer** | Sonnet 4 | ~$3/M tokens | UI work |
| **document-writer** | Sonnet 4 | ~$3/M tokens | Documentation |

### Before and After

**Your existing `oh-my-opencode.json` might look like:**
```json
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
  "agents": {
    "my-custom-agent": { "model": "some-model" }
  }
}
```

**After setup, Ralph Ultra ADDS (does not overwrite) these entries:**
```json
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
  "agents": {
    "my-custom-agent": { "model": "some-model" },
    "Sisyphus": { "model": "anthropic/claude-sonnet-4-20250514" },
    "oracle": { "model": "anthropic/claude-opus-4-5" },
    "explore": { "model": "anthropic/claude-3-5-haiku-20241022" },
    "librarian": { "model": "anthropic/claude-3-5-haiku-20241022" },
    "frontend-ui-ux-engineer": { "model": "anthropic/claude-sonnet-4-20250514" },
    "document-writer": { "model": "anthropic/claude-sonnet-4-20250514" }
  }
}
```

**Important:** 
- Setup will **warn you** if any of these agents are already configured
- Your existing agent configurations are **preserved**
- You can review changes with `./scripts/setup.sh --diff` before applying
- A backup is created before any changes

## Usage

Ralph Ultra scripts run **from anywhere** but operate **on your project directory**. All logs, progress files, and data are created in your project folder - never in the global scripts location.

```bash
# Run on current directory
~/.config/opencode/scripts/ralph-ultra/ralph.sh .

# Run on specific project with 50 iterations
~/.config/opencode/scripts/ralph-ultra/ralph.sh /path/to/project 50

# With health monitoring
~/.config/opencode/scripts/ralph-ultra/ralph-monitor.sh /path/to/project &
~/.config/opencode/scripts/ralph-ultra/ralph.sh /path/to/project 50
```

### Add to PATH (recommended)

```bash
export PATH="$PATH:$HOME/.config/opencode/scripts/ralph-ultra"
```

Then simply:

```bash
ralph.sh .                    # Current directory
ralph.sh /path/to/project 50  # Specific project, 50 iterations
ralph-monitor.sh . &          # Monitor current directory
ralph-budget.sh . --budget 20 # Budget check
```

### What gets created in your project

```
your-project/
├── prd.json              # You create this (required)
├── progress.txt          # Auto-created by Ralph Ultra
├── ralph-monitor.log     # Monitor activity log
├── ralph-report.html     # HTML progress report
└── .ralph-*/             # Internal state files
```

## Scripts

| Script | Purpose |
|--------|---------|
| `ralph.sh` | Main agent loop - executes PRD stories one by one |
| `ralph-monitor.sh` | Health monitor with auto-restart |
| `ralph-budget.sh` | Budget planner and strategy advisor |
| `setup.sh` | Install Ralph Ultra globally |
| `prompt.md` | Agent instructions |

## Monitor Commands

```bash
ralph-monitor.sh /path/to/project &      # Start monitoring
ralph-monitor.sh --status /path/to/project   # Check status
ralph-monitor.sh --report /path/to/project   # Generate HTML report
```

## Budget Planning

```bash
ralph-budget.sh /path/to/project --budget 20
```

Output includes:
- Story count by complexity
- 5 execution strategies with estimated costs
- Recommendation based on your budget

## Webhook Notifications

```bash
export RALPH_SLACK_WEBHOOK="https://hooks.slack.com/services/..."
export RALPH_DISCORD_WEBHOOK="https://discord.com/api/webhooks/..."
export RALPH_NTFY_TOPIC="your-topic"
```

## Troubleshooting

### Setup fails with "oh-my-opencode not found"

```bash
git clone https://github.com/code-yeongyu/oh-my-opencode ~/.config/opencode
```

### Agent not starting

```bash
which opencode  # Verify CLI is installed
```

### Monitor not detecting activity

```bash
tmux list-sessions | grep ralph
tail -f ralph-monitor.log
```

### Check what setup would change

```bash
./scripts/setup.sh --diff
```

## License

MIT

## Credits

- Enhanced by the 48Nauts team

---

This project was inspired by https://github.com/snarktank/ralph
