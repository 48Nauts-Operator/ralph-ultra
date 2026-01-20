# Ralph Ultra

> ⚠️ **NOTICE: Ralph Ultra is being rebuilt!**
>
> Ralph Ultra is currently undergoing a major rewrite with a new TypeScript-based TUI, remote control via Tailscale, and real-time subagent tracing.
>
> **In the meantime, please use [Ralph Nano](https://github.com/48Nauts-Operator/ralph-nano)** — the lightweight, zero-dependency Bash implementation with all the core features.
>
> The legacy Bash version is preserved in the [`legacy` branch](https://github.com/48Nauts-Operator/ralph-ultra/tree/legacy).

---

[![Version](https://img.shields.io/badge/version-2.0.0--dev-orange.svg)](https://github.com/48Nauts-Operator/ralph-ultra/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-in%20development-yellow.svg)](https://github.com/48Nauts-Operator/ralph-ultra)

## What's Coming in Ralph Ultra 2.0

Ralph Ultra is being rebuilt from the ground up with:

| Feature | Description |
|---------|-------------|
| **TypeScript + OpenTUI** | Beautiful reactive terminal UI |
| **Remote Control** | Secure access via Tailscale — watch from your phone |
| **Subagent Tracing** | Real-time tree view of nested agent calls |
| **Session Persistence** | Pause anytime, resume later, survive crashes |
| **Multi-Instance Tabs** | Monitor multiple Ralph instances from one TUI |

## The Ralph Ecosystem

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Ralph Nano                    Ralph Ultra (coming soon)       │
│   ──────────                    ─────────────────────────       │
│   The Engine                    The Cockpit                     │
│                                                                 │
│   ✅ Available now              🚧 In development               │
│   Pure Bash                     TypeScript + OpenTUI            │
│   Zero dependencies             Remote control (Tailscale)      │
│   Runs anywhere                 Premium developer experience    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Use Ralph Nano Today

👉 **[github.com/48Nauts-Operator/ralph-nano](https://github.com/48Nauts-Operator/ralph-nano)**

Ralph Nano includes everything you need:
- Autonomous PRD-based workflows
- Health monitoring with auto-restart
- Cost tracking and budget planning
- Claude Pro quota management
- Hybrid LLM routing (local/API)
- tmux-based Terminal UI
- Webhook notifications

```bash
# Install Ralph Nano
git clone https://github.com/48Nauts-Operator/ralph-nano.git
cd ralph-nano
./scripts/setup.sh

# Run it
ralph.sh /path/to/your/project
```

## Legacy Version

The original Bash implementation is preserved in the [`legacy` branch](https://github.com/48Nauts-Operator/ralph-ultra/tree/legacy).

```bash
# Use the legacy version
git clone -b legacy https://github.com/48Nauts-Operator/ralph-ultra.git
```

## Stay Updated

Star this repo to get notified when Ralph Ultra 2.0 is released!

---

## License

MIT

## Credits

Built by **48Nauts** · Part of the Ralph ecosystem

<p align="center">
  <strong>Ralph Ultra 2.0</strong> — Coming soon.<br>
  <a href="https://github.com/48Nauts-Operator/ralph-nano">Use Ralph Nano in the meantime →</a>
</p>
