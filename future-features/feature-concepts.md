# CLI Tool for Ralph itself
Build a simple ralph-cli that wraps the bash scripts with a nicer interface:

- ralph init - setup a new project
- ralph status - show all stats in one view
- ralph run - start a run
- Complexity: Medium | Stories: ~5-7 | Tests hybrid well: Yes (mix of simple/coding tasks)


## Update Logs
Feature Request: Show active LLM in monitor logs

[2026-01-15 23:05:56] [INFO] Now working on: CLI-001 - Create main ralph CLI entry point
[2026-01-15 23:05:56] [INFO] Routing: LOCAL (qwen/qwen3-coder-30b) - task_type: coding
Or for API:

[2026-01-15 23:05:56] [INFO] Routing: API (opus) - task_type: planning
This would require the monitor to hook into the hybrid routing decisions. I'll add it to the backlog for v1.4.0.


# Markdown PRD Generator
A tool that takes a rough idea and generates a prd.json for Ralph:

- Input: "Build a todo app with auth"
- Output: Structured PRD with stories
- Complexity: Light | Stories: ~3-4 | Tests hybrid well: Partially (mostly coding)

# Ralph Dashboard (Web UI)
A simple HTML/JS dashboard that reads Ralph's JSON files and shows:

- Live progress
- Cost tracking
- Timing predictions
- Historical runs
- Complexity: Medium | Stories: ~6-8 | Tests hybrid well: Yes (planning, frontend, API)

# Timing Analytics Report Generator
Extend the timing DB to generate insights:

"Your integration stories take 2x longer than estimated"
"Tuesdays are your fastest days"
Charts/graphs
Complexity: Light-Medium | Stories: ~4-5 | Tests hybrid well: Yes (analysis, coding, docs)

# Local LLM Benchmark Tool
A tool that benchmarks your LM Studio models:

- Tests each model on coding tasks
- Measures speed vs quality
- Recommends optimal routing config
Complexity: Light | Stories: ~3-4 | Tests hybrid well: Very much (it's about the hybrid system)
