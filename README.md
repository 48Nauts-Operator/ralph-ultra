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
4. **Add to PATH** - Optionally add Ralph Ultra to your shell PATH

### Add to PATH (recommended)

Add this to your `.bashrc` or `.zshrc`:

```bash
export PATH="$PATH:$HOME/.config/opencode/scripts/ralph-ultra"
```

Then restart your terminal or run `source ~/.bashrc`.

## Usage

Ralph Ultra requires a project path. One command does everything - starts the agent with health monitoring automatically.

```bash
ralph.sh /path/to/project           # Run with monitoring (default 50 iterations)
ralph.sh /path/to/project 100       # Run with 100 iterations
ralph.sh --status /path/to/project  # Check current status
ralph.sh --report /path/to/project  # Generate HTML report
ralph.sh --no-monitor /path/to/project  # Run without monitoring (not recommended)
```

### What gets created in your project

```
your-project/
├── prd.json              # You create this (required)
├── progress.txt          # Progress log
├── logs/                 # All log files
│   └── ralph-monitor.log
├── ralph-report.html     # HTML progress report
└── .ralph-*/             # Internal state files
```

## What Gets Configured

### Model Configuration Explained

Ralph Ultra uses different AI models for different tasks to optimize cost:

| Agent | Model | Cost | Why |
|-------|-------|------|-----|
| **Sisyphus** | Sonnet 4.5 | ~$3/M tokens | Main agent - good balance of quality and cost |
| **oracle** | Opus 4.5 | ~$15/M tokens | Complex reasoning - used sparingly for hard problems |
| **explore** | Haiku 4.5 | ~$0.25/M tokens | Codebase search - fast and cheap |
| **librarian** | Haiku 4.5 | ~$0.25/M tokens | Doc lookup - fast and cheap |
| **frontend-ui-ux-engineer** | Sonnet 4.5 | ~$3/M tokens | UI work |
| **document-writer** | Sonnet 4.5 | ~$3/M tokens | Documentation |

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
    "Sisyphus": { "model": "anthropic/claude-sonnet-4.5" },
    "oracle": { "model": "anthropic/claude-opus-4.5" },
    "explore": { "model": "anthropic/claude-haiku-4.5" },
    "librarian": { "model": "anthropic/claude-haiku-4.5" },
    "frontend-ui-ux-engineer": { "model": "anthropic/claude-sonnet-4.5" },
    "document-writer": { "model": "anthropic/claude-sonnet-4.5" }
  }
}
```

**Important:** 
- Setup will **warn you** if any of these agents are already configured
- Your existing agent configurations are **preserved**
- You can review changes with `./scripts/setup.sh --diff` before applying
- A backup is created before any changes

## Budget Planning

Check your budget before running:

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
