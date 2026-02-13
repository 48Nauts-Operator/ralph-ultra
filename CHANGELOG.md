# Changelog

All notable changes to Ralph Ultra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-02-13

### Added

- **Session Lifecycle Management** - Pause/resume support with Claude CLI session persistence
  - `--session-id` and `--resume` flags for continuing interrupted work
  - Session state tracking across restarts
  - Automatic session recovery on external tmux detection
- **Structured Output Parsing** - Enhanced output handling with `--output-format stream-json`
  - Real-time agent activity tracking (thinking, tool usage, completion)
  - Structured output line types for better parsing
  - Per-acceptance-criteria pass/fail tracking
- **Agent Activity Display** - Live visibility into what the agent is doing
  - Shows current agent state (thinking, using tools, completing)
  - Real-time activity updates in Monitor view
  - Model name display in status bar
- **Direct Project Launch** - `--project` CLI flag to launch specific project directly
  - Bypasses project picker for faster workflow
  - Useful for scripting and automation
- **Architecture Documentation** - Comprehensive ARCHITECTURE.md (1010 lines)
  - Complete system design and data flow
  - TypeScript interfaces and types
  - Execution lifecycle documentation
  - Native macOS migration guide

### Changed

- **Output Line Structure** - Enhanced from `string[]` to `OutputLine[]` type
  - Includes timestamp, type, and content
  - Better filtering and display capabilities
- **Notification Toast Width** - Wider toasts prevent error message truncation
- **Initial Service State Sync** - Fixes race condition where external tmux sessions weren't detected
- **Theme Color Palette** - Added `info` color to all theme definitions
- **Cleanup Logic** - Service cleanup only on unmount, not on every state change
  - Prevents accidental stops of running sessions
  - Uses ref pattern for stable cleanup

### Fixed

- External tmux session detection race condition
- Service state sync on initial load
- Type safety improvements across service lifecycle
- Memory leaks from service cleanup dependencies

---

## [3.0.0] - 2026-01-24

### Added

- **Quota Dashboard (View 4)** - Shows all provider quotas (Anthropic, OpenAI, OpenRouter, Gemini, Local)
- **Version View (View 7)** - System info, CLI versions, dependencies, and changelog
- **Git Branch in StatusBar** - Shows current branch for active project
- **Smart Model Allocator** (Phase 2 - In Progress) - Capability-based model selection

### Changed

- **StatusBar Redesign** - Cleaner layout with grouped status indicators
- **Removed Timer** - Eliminated flashing caused by 1-second updates (documented for future fix)
- **View Keys 1-7** - Extended view switching to include Quota (4) and Version (7)

### Fixed

- View switching now properly syncs between App and WorkPane
- Log watcher no longer causes unnecessary re-renders

---

## [2.4.0] - 2026-01-24

### Added

- **Skip to Story (g key)** - Jump directly to any story by number
- **Recent Projects (p key)** - Quick access to last 10 projects
- **Clear Session (Ctrl+L)** - Reset session state
- **Claude API Status** - Real-time API health indicator in StatusBar

---

## [2.3.1] - 2026-01-23

### Added

- **CLI Selection** - Choose preferred CLI (Claude, Aider, Codex) in Settings
- **Per-Project CLI Override** - Set `cli` field in prd.json to override global setting
- **CLI Fallback Chain** - Auto-fallback when preferred CLI unavailable
- **CLI Health Check** - Validates CLI before execution, caches for 5 minutes

---

## [2.2.0] - 2026-01-22

### Added

- **Search in Logs (/ key)** - Search within monitor logs with n/N navigation
- **Log Filtering (f key)** - Filter by level: All, Errors, Warnings+Errors
- **Testable Acceptance Criteria** - PRD format with testCommand for auto-verification
- **AC Test Runner** - Automatically verifies story completion

---

## [2.1.0] - 2026-01-21

### Added

- **Pragmatic Programmer Integration** - DRY, ETC, Orthogonality principles in prompts
- **Configurable Principles** - User-customizable ~/.config/ralph-ultra/principles.md
- **Enhanced PRD Guidelines** - Tracer Bullet stories, small steps, testable criteria

---

## [2.0.0] - 2026-01-20

### Added

#### Core Features

- **Beautiful Terminal UI** built with TypeScript, Bun, and Ink (React for terminals)
- **Three-Pane Layout** with collapsible projects rail, sessions/tasks pane, and dynamic work pane
- **Remote Control via Tailscale** with secure WebSocket server and web-based client
- **Real-Time Subagent Tracing** with tree visualization of nested agent calls
- **Session Persistence** with auto-save, crash recovery, and 7-day retention
- **Multi-Tab Support** for monitoring up to 5 Ralph instances simultaneously
- **Notification System** with in-TUI toasts and optional sound notifications
- **Command Palette** with fuzzy search and recent commands tracking

#### UI Components

- `StatusBar` component showing branding, agent status, progress bar, and elapsed timer
- `ShortcutsBar` component with context-aware keyboard shortcuts
- `ProjectsRail` component with collapsible behavior and project navigation
- `SessionsPane` component reading from prd.json with status indicators
- `WorkPane` component with multiple views (Monitor, Status, Details, Help, Tracing)
- `TracingPane` component for visualizing agent execution hierarchy
- `TabBar` component for multi-instance navigation
- `WelcomeOverlay` component with first-launch detection
- `SettingsPanel` component for theme configuration
- `NotificationToast` component with queue management
- `CommandPalette` component with fuzzy search
- `RestorePrompt` component for session recovery
- `ProjectPicker` component for adding new tabs
- `ConfirmDialog` component for confirmation prompts

#### Hooks

- `useTheme` hook with ThemeProvider for centralized theme management
- `useFocus` hook with FocusProvider for pane focus management
- `useKeyboard` hook with priority-based keyboard handler registration
- `useSession` hook for session persistence and auto-save
- `useTabs` hook for multi-tab lifecycle and state management
- `useMultiTabSession` hook for multi-tab session persistence
- `useNotifications` hook with NotificationProvider for toast management

#### Themes

- **Nano Dark** theme with mint (#7FFFD4) and dirty orange (#CC5500) accents
- **Nano Light** theme with cyan and orange accents
- Theme persistence to `~/.config/ralph-ultra/settings.json`
- Live theme switching with `t` key

#### Remote Control

- WebSocket server on port 7890 with token-based authentication
- HTTP server on port 7891 serving web-based remote client
- Tailscale integration with auto-detection and MagicDNS support
- Real-time log streaming and state synchronization
- Read-only and full-control remote access modes
- Connection status indicators in UI
- Copy remote URL to clipboard with `c` key

#### Session Management

- Session state saved to `~/.config/ralph-ultra/sessions/<project-hash>.json`
- Auto-save every 30 seconds with state change detection
- Crash detection and recovery with restore prompt
- Scroll positions, view modes, and UI state preservation
- Multi-tab session state tracking
- Automatic cleanup of sessions older than 7 days

#### Integration

- Ralph Nano backend integration via `RalphService` class
- Real-time log streaming from `ralph-monitor.log`
- Process lifecycle management (start/stop/restart)
- SIGTERM graceful shutdown with SIGKILL fallback
- Path detection from `RALPH_NANO_PATH` environment variable

#### Utilities

- Configuration management in `~/.config/ralph-ultra/`
- First-launch detection and welcome overlay
- Log parsing for agent hierarchy extraction
- Session persistence with MD5 hashing for unique filenames
- Settings persistence (theme, notification sound)

#### Developer Experience

- Strict TypeScript mode with >95% type coverage
- Path aliases (@components, @hooks, @themes, @remote, @utils, @types)
- ESLint flat config with zero warnings
- Prettier code formatting
- Bun build with external dependencies handling
- Hot reload in development mode

### Changed

- Complete rewrite from Bash to TypeScript
- Replaced tmux-based UI with Ink (React for terminals)
- Moved from single-project to multi-tab architecture
- Enhanced keyboard navigation with priority system
- Improved error handling and user feedback

### Security

- WebSocket server binds to localhost only (127.0.0.1)
- Token-based authentication with 32-byte random tokens
- Secure token storage with 0o600 file permissions
- Maximum 3 concurrent remote connections
- 5-second authentication timeout
- All remote traffic encrypted via Tailscale WireGuard

## [1.x] - Legacy

The original Bash implementation is preserved in the [`legacy` branch](https://github.com/48Nauts-Operator/ralph-ultra/tree/legacy).

### Legacy Features

- Pure Bash implementation
- tmux-based Terminal UI
- Single project monitoring
- Basic webhook notifications
- Cost tracking and quota management

---

## Future Enhancements

Planned features for future releases:

- GitHub Actions integration for CI/CD monitoring
- VS Code extension for embedded TUI
- Metrics dashboard with charts and graphs
- Export logs to various formats (JSON, CSV, PDF)
- Plugin system for custom views and commands
- Docker image for containerized deployments

---

For migration guidance from Ralph Ultra 1.x (legacy) to 2.0, see [CONTRIBUTING.md](CONTRIBUTING.md).
