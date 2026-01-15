# Changelog

All notable changes to Ralph Ultra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-01-15

### Added
- **Unified CLI** (`bin/ralph`) - Single entry point for all Ralph commands
  - `ralph run <project>` - Execute a Ralph project
  - `ralph status` - Show unified status (quota, hybrid, timing)
  - `ralph status <project>` - Show project-specific status (PRD progress, events)
  - `ralph quota` - Manage Claude Pro quota
  - `ralph hybrid` - Manage hybrid LLM routing
  - `ralph stats` - Show timing analytics
  - `ralph init` - Interactive PRD generator with templates (webapp, cli, api, lib)
- **Install script** (`install.sh`) - Easy PATH installation
  - Symlink or copy installation options
  - Automatic ~/bin or /usr/local/bin detection
  - Uninstall support

### Changed
- CLI status command now shows clean, non-duplicated output
- Scripts can be invoked directly or through unified CLI

## [1.3.0] - 2026-01-15

### Added
- **Persistent Timing Database** (`ralph-timing-db.sh`)
  - Global learning across all projects stored in `~/.ralph-ultra/`
  - Dual backend: SQLite (recommended) or JSON (zero dependencies)
  - Pattern recognition for timing predictions (integration, auth, api, frontend, etc.)
  - Migration tool for existing per-project timing data
  - Predictive ETAs based on historical patterns
  - Analytics dashboard with `--stats` command
  - SQL queries supported with SQLite backend

### Changed
- ralph-monitor.sh now records completions to global timing database
- ETA predictions now use global historical data when available
- Better accuracy for time estimates across similar projects

## [1.2.0] - 2026-01-15

### Added
- **Hybrid LLM Routing** (`ralph-hybrid.sh`) - 80/20 local/API cost optimization
  - Task classification engine (planning, coding, simple, docs, search, review, debugging)
  - Ollama integration for local LLM execution
  - OpenAI-compatible API support (LM Studio, vLLM, Groq, Together)
  - Five routing modes: aggressive (90% local), balanced (70%), conservative (40%), api-only, local-only
  - Cost savings tracking and statistics
  - Automatic fallback to API when local unavailable
  - Benchmark tool for testing local LLM performance
  - Integration with ralph.sh (`--hybrid`, `--hybrid-status`, `--hybrid-stats` options)

### Recommended Local Models
- Qwen2.5-Coder (7B/14B/32B) - Best for code generation
- DeepSeek-Coder-V2 - Excellent alternative
- CodeLlama (34B) - Good fallback option

## [1.1.0] - 2026-01-15

### Added
- **Quota Management for Claude Pro** (`ralph-quota.sh`)
  - Pre-flight quota check before starting runs
  - Cross-platform credential retrieval (macOS Keychain + Linux file)
  - Auto-cooldown detection when quota exceeds 98%
  - Smart resume after cooldown with configurable buffer time
  - Progress bar during cooldown wait
  - Integration with ralph.sh (`--skip-quota`, `--quota-status` options)
  - Integration with ralph-monitor.sh for runtime quota detection
  - Environment variables for customization (RALPH_QUOTA_THRESHOLD, RALPH_QUOTA_CRITICAL, RALPH_COOLDOWN_BUFFER)

### Changed
- ralph.sh now performs quota check before budget check
- Added quota status to CLI help

## [1.0.0] - 2026-01-15

### Added
- Initial release of Ralph Ultra
- Health monitoring with 4-stage checks
- Auto-restart on stalls
- Cost tracking per story
- Budget planning with execution strategies
- Sub-agent delegation (Oracle, Explore, Librarian)
- ETA calculator with learned completion times
- HTML progress reports
- Git diff tracking per story
- Webhook notifications (Slack, Discord, NTFY, generic)
- Cross-platform support (macOS and Linux)
- Git safety (branch protection)
