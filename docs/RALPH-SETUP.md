# Ralph System Setup Guide

A comprehensive guide to setting up Ralph - the autonomous AI agent loop with monitoring, budget planning, and cost optimization.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Directory Structure](#directory-structure)
5. [Configuration](#configuration)
6. [Budget Planning](#budget-planning)
7. [Running Ralph](#running-ralph)
8. [Monitoring](#monitoring)
9. [Cost Optimization](#cost-optimization)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Ralph is an autonomous AI coding agent that:
- Reads a PRD (Product Requirements Document) in JSON format
- Implements user stories one by one
- Self-monitors progress and health
- Auto-restarts if stuck
- Generates HTML reports
- Tracks costs and timing

### Components

| Component | File | Purpose |
|-----------|------|---------|
| **Ralph Agent** | `scripts/ralph.sh` | Main agent loop |
| **Ralph Monitor** | `scripts/ralph-monitor.sh` | Health monitoring & auto-restart |
| **Budget Planner** | `scripts/ralph-budget.sh` | Cost estimation & strategy advisor |
| **Prompt** | `scripts/prompt.md` | Agent instructions |
| **PRD** | `prd.json` | User stories to implement |

---

## Prerequisites

### Required Software

```bash
# Check all prerequisites
command -v jq && echo "✓ jq installed"
command -v tmux && echo "✓ tmux installed"
command -v opencode && echo "✓ opencode installed"
command -v bc && echo "✓ bc installed"
```

Install missing dependencies:

```bash
# macOS
brew install jq tmux bc

# Ubuntu/Debian
sudo apt install jq tmux bc
```

### OpenCode Setup

1. Install OpenCode: https://opencode.ai
2. Authenticate with your provider:
   ```bash
   opencode auth
   ```
3. Verify authentication:
   ```bash
   ls ~/.local/share/opencode/auth.json
   ```

---

## Quick Start

### 1. Clone/Setup Project

```bash
cd /path/to/your/project
```

### 2. Create PRD

Create `prd.json` with your user stories:

```json
{
  "projectName": "My Project",
  "branchName": "ralph/feature-name",
  "userStories": [
    {
      "id": "SETUP-001",
      "title": "Project initialization",
      "description": "Set up project structure and dependencies",
      "priority": 1,
      "passes": false
    },
    {
      "id": "CORE-001",
      "title": "Implement core feature",
      "description": "Build the main functionality",
      "priority": 2,
      "passes": false
    }
  ]
}
```

### 3. Copy Ralph Scripts

```bash
mkdir -p scripts
cp /path/to/opencode-nanobanana/scripts/ralph.sh scripts/
cp /path/to/opencode-nanobanana/scripts/ralph-monitor.sh scripts/
cp /path/to/opencode-nanobanana/scripts/ralph-budget.sh scripts/
cp /path/to/opencode-nanobanana/scripts/prompt.md scripts/
chmod +x scripts/*.sh
```

### 4. Check Budget

```bash
./scripts/ralph-budget.sh . --budget 20
```

### 5. Start Ralph with Monitoring

```bash
# Terminal 1: Start the monitor (recommended)
./scripts/ralph-monitor.sh . 5

# Or run Ralph directly without monitoring
./scripts/ralph.sh 50
```

---

## Directory Structure

After setup, your project should look like:

```
your-project/
├── prd.json                    # User stories (required)
├── progress.txt                # Progress log (auto-created)
├── opencode.json               # OpenCode permissions
├── scripts/
│   ├── ralph.sh                # Main agent loop
│   ├── ralph-monitor.sh        # Health monitor
│   ├── ralph-budget.sh         # Budget planner
│   └── prompt.md               # Agent instructions
├── src/                        # Your source code
└── .ralph-*/                   # Auto-created data
    ├── .ralph-monitor-state.json
    ├── .ralph-events.json
    ├── .ralph-backups/
    └── .ralph-failures/
```

---

## Configuration

### OpenCode Permissions

Create `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": "allow"
}
```

### Model Configuration (Cost Optimization)

Edit `~/.config/opencode/oh-my-opencode.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
  "agents": {
    "Sisyphus": { "model": "anthropic/claude-sonnet-4" },
    "frontend-ui-ux-engineer": { "model": "anthropic/claude-sonnet-4" },
    "document-writer": { "model": "anthropic/claude-sonnet-4" },
    "Coder Agent": { "model": "anthropic/claude-sonnet-4" },
    "oracle": { "model": "anthropic/claude-opus-4-5" },
    "explore": { "model": "anthropic/claude-haiku-3" },
    "librarian": { "model": "anthropic/claude-haiku-3" }
  }
}
```

### NTFY Push Notifications (Optional)

Set environment variables before running:

```bash
export NTFY_ENABLED=true
export NTFY_SERVER=https://ntfy.sh
export NTFY_TOPIC=ralph-your-project

./scripts/ralph-monitor.sh .
```

### Webhook Notifications (Optional)

For Slack:
```bash
export WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
export WEBHOOK_TYPE=slack
```

For Discord:
```bash
export WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
export WEBHOOK_TYPE=discord
```

---

## Budget Planning

### Check Your Quota

**OpenRouter:**
```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "https://openrouter.ai/api/v1/credits" | jq '.data'
```

**Anthropic:** Visit https://console.anthropic.com/settings/usage

**OpenAI:** Visit https://platform.openai.com/usage

### Run Budget Planner

```bash
# Analyze with auto-detected budget
./scripts/ralph-budget.sh .

# Analyze with specific budget
./scripts/ralph-budget.sh . --budget 15
```

### Understanding Strategies

| Strategy | Models Used | Best For |
|----------|-------------|----------|
| **Premium** | All Opus | Maximum quality, unlimited budget |
| **Balanced** | Sonnet + Opus for complex | Best quality/cost ratio |
| **Standard** | All Sonnet | Good quality, moderate budget |
| **Optimized** | Haiku + Sonnet | Tight budget, acceptable quality |
| **Minimal** | Haiku heavy | Very tight budget |

### Cost Estimates (per story average)

| Model | Input (50K tokens) | Output (8K tokens) | Total |
|-------|-------------------|-------------------|-------|
| Opus | $0.75 | $0.60 | ~$1.35 |
| Sonnet | $0.15 | $0.12 | ~$0.27 |
| Haiku | $0.01 | $0.01 | ~$0.02 |

---

## Running Ralph

### Option 1: With Monitoring (Recommended)

```bash
# Start monitor - checks every 5 minutes, auto-restarts if stuck
./scripts/ralph-monitor.sh . 5
```

The monitor will:
- Start Ralph in a tmux session
- Check health every N minutes
- Auto-restart if stuck
- Generate HTML reports
- Send notifications

### Option 2: Direct Execution

```bash
# Run for up to 50 iterations
./scripts/ralph.sh 50
```

### Option 3: Manual tmux Session

```bash
# Create tmux session
tmux new-session -d -s ralph -c /path/to/project "./scripts/ralph.sh 50"

# Attach to watch
tmux attach -t ralph

# Detach: Ctrl+B, then D
```

---

## Monitoring

### Check Status

```bash
./scripts/ralph-monitor.sh --status .
```

Output shows:
- Progress (stories completed / total)
- Current story
- ETA (estimated completion time)
- Health status (4 indicators)
- Resource usage (disk, memory)
- Cost tracking

### Generate HTML Report

```bash
./scripts/ralph-monitor.sh --report .
```

Opens a beautiful HTML report showing:
- Stories completed with timing
- Git diff summary (files changed, lines)
- Cost breakdown
- Restart history
- Event timeline

### Health Indicators

```
[✓✓✓✓] = All healthy
[✓✓✓✗] = CPU idle (might be thinking)
[✓✓✗✗] = No file changes (might be stuck)
[✓✗✗✗] = AI process not active
[✗✗✗✗] = Session dead
```

| Indicator | Meaning |
|-----------|---------|
| 1st ✓/✗ | tmux session exists |
| 2nd ✓/✗ | AI process running |
| 3rd ✓/✗ | Files changing |
| 4th ✓/✗ | CPU active |

### View Logs

```bash
# Monitor log
tail -f ralph-monitor.log

# Attach to Ralph session
tmux attach -t ralph
```

---

## Cost Optimization

### Strategy 1: Model Routing

Configure different models for different agent types:

```json
{
  "agents": {
    "Sisyphus": { "model": "anthropic/claude-sonnet-4" },
    "oracle": { "model": "anthropic/claude-opus-4-5" },
    "explore": { "model": "anthropic/claude-haiku-3" },
    "librarian": { "model": "anthropic/claude-haiku-3" }
  }
}
```

**Savings**: ~60-70% compared to all-Opus

### Strategy 2: Story Classification

In your `prd.json`, name stories to hint complexity:

- `SETUP-*` → Simple (uses cheaper models)
- `CONFIG-*` → Simple
- `CORE-*` → Medium
- `FEATURE-*` → Medium
- `INTEGRATION-*` → Complex (uses Opus)
- `COMPLEX-*` → Complex

### Strategy 3: Phased Execution

If budget is limited, run in phases:

```bash
# Phase 1: Simple stories only (cheap)
# Edit prd.json to mark complex stories with higher priority

# Phase 2: Wait for quota reset, then continue
./scripts/ralph-monitor.sh .
```

### Strategy 4: Use Prompt Caching

Anthropic's prompt caching reduces costs. The system automatically benefits from this when using consistent prompts.

---

## Troubleshooting

### Ralph Won't Start

```bash
# Check prerequisites
command -v jq tmux opencode

# Check prd.json exists and is valid
jq '.' prd.json

# Check ralph.sh is executable
chmod +x scripts/ralph.sh
```

### Ralph Gets Stuck

```bash
# Check status
./scripts/ralph-monitor.sh --status .

# Check failure logs
ls -la .ralph-failures/
cat .ralph-failures/failure_*.txt | tail -100

# Manual restart
tmux kill-session -t ralph
./scripts/ralph-monitor.sh .
```

### High Costs

```bash
# Check current strategy
./scripts/ralph-budget.sh . --budget YOUR_REMAINING_BUDGET

# Switch to cheaper model config
# Edit ~/.config/opencode/oh-my-opencode.json
```

### Monitor Shows "Not Configured"

The monitor uses OAuth tokens managed by OpenCode. Check:

```bash
# Verify auth file exists
cat ~/.local/share/opencode/auth.json | jq 'keys'

# Re-authenticate if needed
opencode auth
```

### Stories Not Completing

1. Check `progress.txt` for errors
2. Check `prd.json` - ensure `passes: false` for incomplete stories
3. Increase timeout in monitor (some stories take longer)
4. Check if story requirements are clear in PRD

---

## Files Reference

### Generated Files

| File | Purpose | Auto-created |
|------|---------|--------------|
| `progress.txt` | Progress log with learnings | Yes |
| `ralph-monitor.log` | Monitor activity log | Yes |
| `ralph-report.html` | Visual HTML report | Yes |
| `ralph-timing.json` | Learned story timings | Yes |
| `.ralph-monitor-state.json` | Monitor state | Yes |
| `.ralph-events.json` | Event tracking data | Yes |
| `.ralph-backups/` | Progress backups | Yes |
| `.ralph-failures/` | Failure context captures | Yes |

### Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `ralph.sh` | Main agent loop | `./ralph.sh [iterations]` |
| `ralph-monitor.sh` | Health monitoring | `./ralph-monitor.sh [dir] [interval]` |
| `ralph-budget.sh` | Cost planning | `./ralph-budget.sh [dir] [--budget N]` |

---

## Best Practices

1. **Always use the monitor** - Don't run Ralph directly in production
2. **Start with budget planning** - Know your costs before starting
3. **Use git branches** - Ralph creates commits; use feature branches
4. **Review progress.txt** - Contains learnings for future iterations
5. **Set up notifications** - NTFY or webhooks for remote monitoring
6. **Back up before starting** - Monitor creates backups, but be safe
7. **Use appropriate models** - Don't use Opus for simple tasks

---

## Support

- **Issues**: Check `.ralph-failures/` for captured context
- **Logs**: `ralph-monitor.log` has detailed activity
- **Reports**: `./scripts/ralph-monitor.sh --report .` for visual overview
