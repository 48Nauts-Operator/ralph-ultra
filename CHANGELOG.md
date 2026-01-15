# Changelog

All notable changes to Ralph Ultra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
