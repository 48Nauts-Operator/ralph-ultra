# Changelog

All notable changes to Ralph Ultra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
