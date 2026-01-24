# Ralph Ultra Roadmap

## v2.3 - Multi-LLM & Cost Optimization

### User Choice for AI CLI

- [ ] Settings UI to select preferred CLI (claude, opencode, codex, gemini, aider, cody)
- [ ] Per-project override in prd.json
- [ ] Fallback chain if preferred CLI not available

### Quota Manager (from ralph-nano)

- [ ] Pre-flight quota check before runs via Anthropic OAuth API
- [ ] Pause execution at configurable threshold (default 98%)
- [ ] Auto-resume after cooldown period
- [ ] Cross-platform credential retrieval (macOS Keychain / Linux)
- [ ] Display quota status in StatusBar

### Budget Planner (from ralph-nano)

- [ ] `--budget N` flag to set USD budget limit
- [ ] Cost estimation per story based on model pricing
- [ ] Plan how many stories can run within budget
- [ ] Support multiple providers (Opus, Sonnet, Haiku, GPT-4)
- [ ] Show estimated vs actual cost in UI

### Hybrid LLM Router (from ralph-nano)

- [ ] 80/20 local/API cost optimization
- [ ] Task complexity classification:
  - Simple (typos, rename) -> Local fast model
  - Code generation -> Local model (qwen2.5-coder:32b)
  - Complex (architecture, security) -> Cloud API (Opus/Sonnet)
- [ ] Support Ollama, LM Studio, vLLM
- [ ] Routing stats and cost savings tracking
- [ ] Settings UI for hybrid mode configuration

## v2.4 - Enhanced Monitoring

### Session Persistence

- [ ] Restore all open tabs on restart (not just one)
- [ ] Remember which tmux sessions were running
- [ ] Auto-reconnect to running sessions

### Progress File (progress.txt)

- [ ] Learning log like ralph-nano
- [ ] Document codebase patterns discovered
- [ ] Track what was done for each story
- [ ] Record learnings for future iterations
- [ ] Enable AI to learn from past mistakes

## v2.5 - Remote & Collaboration

### Enhanced Remote Access

- [ ] Mobile-friendly web UI via Tailscale
- [ ] Push notifications for story completion
- [ ] Remote start/stop controls

## References

See ralph-nano implementations:

- `scripts/ralph-quota.sh` - Quota management
- `scripts/ralph-budget.sh` - Budget planning
- `scripts/ralph-hybrid.sh` - Hybrid LLM routing
