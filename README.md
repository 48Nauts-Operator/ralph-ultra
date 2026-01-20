# Ralph Ultra 2.0

> **The Most Secure Coding Agent** — Beautiful TUI with Remote Control & Real-Time Subagent Tracing

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/48Nauts-Operator/ralph-ultra/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Built with TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178C6.svg)](https://www.typescriptlang.org/)
[![Powered by Bun](https://img.shields.io/badge/powered%20by-Bun-FBF0DF.svg)](https://bun.sh/)

Ralph Ultra 2.0 is a **revolutionary terminal UI** that transforms how you monitor and control autonomous coding agents. Built with TypeScript, Bun, and Ink (React for terminals), it provides a premium developer experience with remote control via Tailscale and real-time subagent tracing.

---

## ✨ Key Features

### 🎨 Beautiful Terminal UI
- **Three-Pane Layout** — Projects rail, sessions/tasks pane, and dynamic work pane
- **Collapsible Panels** — Maximize workspace with `[` key
- **Multiple Views** — Monitor logs, view status, inspect stories, browse help, or trace agents
- **Theme System** — Choose between Nano Dark (mint accents) and Nano Light themes
- **Responsive Design** — Adapts to any terminal size (minimum 80x24)

### 🌐 Remote Control via Tailscale
- **Secure Access** — Monitor Ralph from anywhere via encrypted Tailscale connection
- **Web-Based Client** — View and control from phone, tablet, or any browser
- **Token Authentication** — Auto-generated secure tokens for each session
- **Real-Time Sync** — Live log streaming and status updates
- **Read/Write Modes** — View-only or full remote control

### 🔍 Subagent Tracing
- **Tree Visualization** — Real-time hierarchy of nested agent calls
- **Status Tracking** — Running (yellow), complete (green), error (red)
- **Performance Metrics** — Duration tracking for each agent
- **Expandable Branches** — Drill down into any agent's execution
- **Task Context** — See what each agent is working on

### 💾 Session Persistence
- **Auto-Save** — State saved every 30 seconds
- **Crash Recovery** — Resume exactly where you left off
- **Scroll Positions** — All UI state preserved
- **7-Day Retention** — Automatic cleanup of old sessions
- **Multi-Project** — Independent sessions per project

### 📑 Multi-Tab Support
- **Up to 5 Tabs** — Monitor multiple Ralph instances simultaneously
- **Independent State** — Each tab maintains its own state
- **Quick Switching** — Ctrl+1/2/3... or Ctrl+Tab navigation
- **Process Isolation** — Each tab runs its own RalphService
- **Status Indicators** — At-a-glance view of all tabs

### 🔔 Notification System
- **Toast Notifications** — In-TUI toasts for important events
- **Color-Coded** — Info (blue), success (green), warning (yellow), error (red)
- **History** — View notification history in Status panel
- **Sound Support** — Optional terminal bell notifications
- **Auto-Dismiss** — Toasts fade after 5 seconds

### ⌨️ Command Palette
- **Quick Access** — Ctrl+P or `:` to open
- **Fuzzy Search** — Find any command instantly
- **Recent Commands** — Quick access to frequently used actions
- **Category Organization** — Commands grouped by type
- **Keyboard Shortcuts** — Full keyboard navigation

---

## 🚀 Quick Start

### Prerequisites

- **Bun** — Runtime and package manager ([install](https://bun.sh))
- **Node.js** — For npm compatibility (optional)
- **Ralph Nano** — The execution engine ([install](https://github.com/48Nauts-Operator/ralph-nano))
- **Tailscale** — For remote access (optional) ([install](https://tailscale.com))

### Installation

```bash
# Clone the repository
git clone https://github.com/48Nauts-Operator/ralph-ultra.git
cd ralph-ultra

# Install dependencies
bun install

# Run in development mode
bun run dev

# Or build and run production bundle
bun run build
./dist/ralph-ultra
```

### Configuration

Ralph Ultra automatically detects Ralph Nano if it's in your PATH or project directory. You can also set the `RALPH_NANO_PATH` environment variable:

```bash
export RALPH_NANO_PATH="/path/to/ralph-nano/ralph.sh"
```

---

## 📖 Usage

### Basic Navigation

| Key | Action |
|-----|--------|
| `Tab` | Cycle focus between panes |
| `↑` `↓` | Navigate within focused pane |
| `j` `k` | Vim-style navigation |
| `Enter` | Activate selected item |
| `Esc` | Close overlay/modal |

### Global Shortcuts

| Key | Action |
|-----|--------|
| `[` | Toggle projects rail collapse |
| `r` | Run Ralph on current project |
| `s` | Stop running Ralph process |
| `t` | Open theme settings |
| `?` | Show help overlay |
| `q` | Quit application |
| `:` or `Ctrl+P` | Open command palette |

### View Switching

| Key | Action |
|-----|--------|
| `1` | Monitor view (logs) |
| `2` | Status view (system info) |
| `3` | Details view (story info) |
| `4` | Help view (commands) |
| `5` | Tracing view (subagents) |

### Multi-Tab Navigation

| Key | Action |
|-----|--------|
| `Ctrl+Shift+T` | Open new tab / project picker |
| `Ctrl+Shift+W` | Close current tab |
| `Ctrl+Tab` | Cycle through tabs |
| `Ctrl+1/2/3...` | Jump to specific tab |

### Remote Control

| Key | Action |
|-----|--------|
| `c` | Copy remote URL to clipboard |

---

## 🎯 The Ralph Ecosystem

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Ralph Nano                         Ralph Ultra                │
│   ──────────                         ─────────────              │
│   The Engine                         The Cockpit                │
│                                                                 │
│   • Pure Bash                        • TypeScript + OpenTUI     │
│   • Zero dependencies                • Beautiful TUI            │
│   • Autonomous execution             • Remote control           │
│   • Runs anywhere                    • Subagent tracing         │
│                                      • Premium DX               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Ralph Ultra acts as the **cockpit** that controls and monitors Ralph Nano, the **engine** that does the actual work.

---

## 🔒 Security

Ralph Ultra is designed with security in mind:

- **Localhost Binding** — WebSocket server only binds to 127.0.0.1
- **Tailscale Encryption** — All remote traffic encrypted via WireGuard
- **Token Authentication** — Secure tokens (32-byte random) for each session
- **Connection Limits** — Maximum 3 concurrent remote connections
- **Auth Timeout** — 5-second window to authenticate new connections
- **No Exposure** — No ports exposed without Tailscale

---

## 🎨 Themes

Ralph Ultra includes two built-in themes:

### Nano Dark (Default)
- **Primary Accent**: Mint (#7FFFD4)
- **Secondary Accent**: Dirty Orange (#CC5500)
- **Background**: Dark terminal colors
- **Best for**: Extended coding sessions

### Nano Light
- **Primary Accent**: Cyan (#00CED1)
- **Secondary Accent**: Orange (#FF8C00)
- **Background**: Light terminal colors
- **Best for**: Daylight environments

Toggle themes with `t` key or via Settings panel.

---

## 📁 Project Structure

```
ralph-ultra/
├── src/
│   ├── components/          # React Ink components
│   │   ├── App.tsx          # Main application
│   │   ├── StatusBar.tsx    # Top status bar
│   │   ├── ShortcutsBar.tsx # Bottom shortcuts
│   │   ├── ProjectsRail.tsx # Left projects panel
│   │   ├── SessionsPane.tsx # Middle sessions/tasks
│   │   ├── WorkPane.tsx     # Right work area
│   │   ├── TracingPane.tsx  # Subagent tree view
│   │   ├── TabBar.tsx       # Multi-tab navigation
│   │   └── ...              # Other components
│   ├── hooks/               # Custom React hooks
│   │   ├── useTheme.tsx     # Theme management
│   │   ├── useFocus.tsx     # Focus management
│   │   ├── useKeyboard.tsx  # Keyboard handling
│   │   ├── useTabs.tsx      # Tab management
│   │   └── ...              # Other hooks
│   ├── remote/              # Remote control modules
│   │   ├── server.ts        # WebSocket server
│   │   ├── http-server.ts   # HTTP server for client
│   │   ├── tailscale.ts     # Tailscale integration
│   │   └── client/          # Web-based remote client
│   ├── themes/              # Theme definitions
│   │   ├── nano-dark.ts     # Default dark theme
│   │   └── nano-light.ts    # Light theme
│   ├── utils/               # Utility modules
│   │   ├── config.ts        # Configuration management
│   │   ├── session.ts       # Session persistence
│   │   ├── ralph-service.ts # Ralph Nano integration
│   │   └── log-parser.ts    # Log parsing for tracing
│   └── types/               # TypeScript type definitions
├── prd.json                 # Project requirements document
├── progress.txt             # Development progress log
└── package.json             # Dependencies and scripts
```

---

## 🛠️ Development

### Available Scripts

```bash
# Development mode with hot reload
bun run dev

# Type checking
bun run typecheck

# Linting
bun run lint

# Code formatting
bun run format

# Production build
bun run build
```

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

## 🐛 Troubleshooting

### Ralph Ultra won't start

```bash
# Check Bun is installed
bun --version

# Reinstall dependencies
rm -rf node_modules
bun install

# Check for conflicting processes
lsof -i :7890  # WebSocket port
lsof -i :7891  # HTTP server port
```

### Ralph Nano not found

```bash
# Set explicit path
export RALPH_NANO_PATH="/path/to/ralph-nano/ralph.sh"

# Or symlink to PATH
ln -s /path/to/ralph-nano/ralph.sh /usr/local/bin/ralph.sh
```

### Remote access not working

```bash
# Check Tailscale is running
tailscale status

# Verify WebSocket server is listening
lsof -i :7890

# Test local connection first
# (Open web browser to http://localhost:7891)
```

### Logs not streaming

Check that `ralph-monitor.log` exists in your project directory and Ralph Nano is running.

---

## 📋 Requirements

- **Bun** ≥ 1.0.0
- **Node.js** ≥ 18.0.0 (optional, for npm compatibility)
- **Terminal** with Unicode and color support
- **Minimum size**: 80 columns × 24 rows
- **Ralph Nano** for execution

---

## 🗺️ Roadmap

Ralph Ultra 2.0 is feature-complete! Future enhancements may include:

- [ ] GitHub Actions integration for CI/CD monitoring
- [ ] VS Code extension for embedded TUI
- [ ] Metrics dashboard with charts and graphs
- [ ] Export logs to various formats (JSON, CSV, PDF)
- [ ] Plugin system for custom views and commands
- [ ] Docker image for containerized deployments

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Credits

**Built by 48Nauts** — Part of the Ralph ecosystem

- **Ralph Ultra** — This project
- **Ralph Nano** — Lightweight execution engine ([GitHub](https://github.com/48Nauts-Operator/ralph-nano))

Special thanks to:
- [Ink](https://github.com/vadimdemedes/ink) — React for CLIs
- [Bun](https://bun.sh) — Fast all-in-one JavaScript runtime
- [Tailscale](https://tailscale.com) — Secure remote access

---

<p align="center">
  <strong>Ralph Ultra 2.0</strong> — The Most Secure Coding Agent<br>
  <a href="https://github.com/48Nauts-Operator/ralph-ultra/releases">Download Latest Release →</a>
</p>
