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
# Clone Ralph Ultra
git clone https://github.com/48Nauts-Operator/ralph-ultra.git
cd ralph-ultra

# Run setup (installs to ~/.config/opencode/scripts/ralph-ultra/)
./scripts/setup.sh
```

The setup wizard will:
1. Check all prerequisites are installed
2. Install Ralph Ultra scripts to `~/.config/opencode/scripts/ralph-ultra/`
3. Configure cost-optimized models in `oh-my-opencode.json`

After installation, Ralph Ultra is available globally.

## Usage

From any project directory:

```bash
# Run Ralph Ultra (10 iterations default)
~/.config/opencode/scripts/ralph-ultra/ralph.sh .

# Run with more iterations
~/.config/opencode/scripts/ralph-ultra/ralph.sh . 50

# With health monitoring
~/.config/opencode/scripts/ralph-ultra/ralph-monitor.sh . &
~/.config/opencode/scripts/ralph-ultra/ralph.sh . 50
```

### Optional: Add to PATH

```bash
export PATH="$PATH:$HOME/.config/opencode/scripts/ralph-ultra"
```

Then simply:

```bash
ralph.sh .
ralph-monitor.sh . &
ralph-budget.sh . --budget 20
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
# Start monitoring (background)
ralph-monitor.sh /path/to/project &

# Check status
ralph-monitor.sh --status /path/to/project

# Generate HTML report
ralph-monitor.sh --report /path/to/project
```

## Budget Planning

```bash
# Check budget and get strategy recommendation
ralph-budget.sh /path/to/project --budget 20
```

Output includes:
- Story count by complexity
- 5 execution strategies with estimated costs
- Recommendation based on your budget

## Model Configuration

Ralph Ultra configures these agents in `~/.config/opencode/oh-my-opencode.json`:

| Agent | Model | Cost | Usage |
|-------|-------|------|-------|
| Sisyphus | Sonnet 4 | ~$3/M | Main work (balanced) |
| Oracle | Opus 4.5 | ~$15/M | Complex reasoning (sparingly) |
| Explore | Haiku 3.5 | ~$0.25/M | Codebase search (cheap) |
| Librarian | Haiku 3.5 | ~$0.25/M | Doc lookup (cheap) |

## Webhook Notifications

Set environment variables for notifications:

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

## License

MIT

## Credits

- Enhanced by the 48Nauts team

---

This project was inspired by https://github.com/snarktank/ralph
