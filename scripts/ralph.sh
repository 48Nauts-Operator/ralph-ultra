#!/bin/bash
# Ralph Ultra - Autonomous AI Agent System
# Usage: ralph.sh <project_dir> [max_iterations]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

show_usage() {
  echo "Usage: ralph.sh <project_dir> [max_iterations]"
  echo ""
  echo "Arguments:"
  echo "  project_dir     Path to project (REQUIRED)"
  echo "  max_iterations  Maximum iterations (auto-calculated if not provided)"
  echo "                  Auto: remaining_stories * 3, min 10, max 200"
  echo ""
  echo "Options:"
  echo "  --no-monitor    Run without health monitoring"
  echo "  --skip-budget   Skip budget check"
  echo "  --status        Show current status"
  echo "  --report        Generate HTML report"
  echo "  --help, -h      Show this help"
  echo ""
  echo "Examples:"
  echo "  ralph.sh /path/to/project"
  echo "  ralph.sh /path/to/project 100"
  echo "  ralph.sh --status /path/to/project"
}

NO_MONITOR=false
SKIP_BUDGET=false
STATUS_ONLY=false
REPORT_ONLY=false
AGENT_ONLY=false

while [[ "$1" == --* ]]; do
  case "$1" in
    --help|-h)
      show_usage
      exit 0
      ;;
    --no-monitor)
      NO_MONITOR=true
      shift
      ;;
    --skip-budget)
      SKIP_BUDGET=true
      shift
      ;;
    --status)
      STATUS_ONLY=true
      shift
      ;;
    --report)
      REPORT_ONLY=true
      shift
      ;;
    --agent-only)
      AGENT_ONLY=true
      SKIP_BUDGET=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [ -z "$1" ]; then
  show_usage
  exit 1
fi

PROJECT_DIR="$1"
USER_ITERATIONS="$2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/prompt.md"
MONITOR_SCRIPT="$SCRIPT_DIR/ralph-monitor.sh"
BUDGET_SCRIPT="$SCRIPT_DIR/ralph-budget.sh"

if [ ! -d "$PROJECT_DIR" ]; then
  error "Project directory does not exist: $PROJECT_DIR"
fi

cd "$PROJECT_DIR" || error "Cannot access project directory: $PROJECT_DIR"
PROJECT_DIR="$(pwd)"

if [[ "$PROJECT_DIR" == *".config/opencode"* ]]; then
  error "Cannot run Ralph Ultra in the global config directory.
       Please specify a project directory:
       ralph.sh /path/to/your/project"
fi

if [ "$STATUS_ONLY" = true ]; then
  exec "$MONITOR_SCRIPT" --status "$PROJECT_DIR"
fi

if [ "$REPORT_ONLY" = true ]; then
  exec "$MONITOR_SCRIPT" --report "$PROJECT_DIR"
fi

LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

PRD_FILE="prd.json"
PROGRESS_FILE="progress.txt"
ARCHIVE_DIR="archive"

calculate_iterations() {
  if [ -n "$USER_ITERATIONS" ]; then
    echo "$USER_ITERATIONS"
    return
  fi
  
  if [ ! -f "$PRD_FILE" ]; then
    echo "50"
    return
  fi
  
  local remaining=$(jq '[.userStories[] | select(.passes != true)] | length' "$PRD_FILE" 2>/dev/null || echo "0")
  
  if [ "$remaining" -eq 0 ]; then
    echo "10"
    return
  fi
  
  local iterations=$((remaining * 3))
  
  if [ "$iterations" -lt 10 ]; then
    iterations=10
  elif [ "$iterations" -gt 200 ]; then
    iterations=200
  fi
  
  echo "$iterations"
}

MAX_ITERATIONS=$(calculate_iterations)
LAST_BRANCH_FILE=".ralph-last-branch"

detect_cli() {
  if command -v claude &> /dev/null; then
    echo "claude"
  elif command -v opencode &> /dev/null; then
    echo "opencode"
  elif command -v amp &> /dev/null; then
    echo "amp"
  else
    echo "none"
  fi
}

run_ai() {
  local prompt_file="$1"
  local cli=$(detect_cli)
  
  case "$cli" in
    claude)
      claude --print --dangerously-skip-permissions "$(cat $prompt_file)" 2>&1
      ;;
    opencode)
      (
        unset OPENCODE_SERVER_PASSWORD OPENCODE_SERVER_USERNAME
        export OPENCODE_PERMISSION='{"*":"allow"}'
        opencode run --title "Ralph: $(basename $PROJECT_DIR)" "$(cat $prompt_file)"
      ) 2>&1
      ;;
    amp)
      cat "$prompt_file" | amp --dangerously-allow-all 2>&1
      ;;
    none)
      error "No AI CLI found. Install: claude (recommended), opencode, or amp"
      ;;
  esac
}

check_prereqs() {
  if ! command -v jq &> /dev/null; then
    error "jq is required. Install with: brew install jq"
  fi
  
  if ! command -v tmux &> /dev/null; then
    error "tmux is required. Install with: brew install tmux"
  fi
  
  if [ ! -f "$PRD_FILE" ]; then
    error "prd.json not found in $PROJECT_DIR"
  fi
  
  if [ ! -f "$PROMPT_FILE" ]; then
    error "prompt.md not found at $PROMPT_FILE"
  fi
  
  local cli=$(detect_cli)
  if [ "$cli" = "none" ]; then
    error "No AI CLI found. Install one of: opencode, amp, claude"
  fi
  info "Using CLI: $cli"
}

run_budget_check() {
  if [ "$SKIP_BUDGET" = true ]; then
    return 0
  fi
  
  echo ""
  echo -e "${CYAN}Budget Check${NC}"
  echo "─────────────────────────────────────────"
  
  local story_count=$(jq '[.userStories[] | select(.passes != true)] | length' "$PRD_FILE" 2>/dev/null || echo "0")
  
  if [ "$story_count" -eq 0 ]; then
    info "All stories already completed!"
    return 0
  fi
  
  info "Remaining stories: $story_count"
  echo ""
  
  read -p "Do you want to set a maximum budget? [y/N] " -n 1 -r
  echo ""
  
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter max budget in USD (e.g., 20): " budget_input
    
    if [ -n "$budget_input" ]; then
      echo ""
      info "Running budget analysis..."
      echo ""
      
      "$BUDGET_SCRIPT" "$PROJECT_DIR" --budget "$budget_input"
      
      echo ""
      read -p "Continue with execution? [Y/n] " -n 1 -r
      echo ""
      
      if [[ $REPLY =~ ^[Nn]$ ]]; then
        info "Aborted by user."
        exit 0
      fi
    fi
  else
    echo ""
    info "Skipping budget check. Running with default settings."
  fi
  
  echo ""
}

archive_previous() {
  if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
    local current_branch=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
    local last_branch=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")
    
    if [ -n "$current_branch" ] && [ -n "$last_branch" ] && [ "$current_branch" != "$last_branch" ]; then
      local date=$(date +%Y-%m-%d)
      local folder_name=$(echo "$last_branch" | sed 's|^ralph/||')
      local archive_folder="$ARCHIVE_DIR/$date-$folder_name"
      
      info "Archiving previous run: $last_branch"
      mkdir -p "$archive_folder"
      [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$archive_folder/"
      [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$archive_folder/"
      success "Archived to: $archive_folder"
      
      echo "# Ralph Ultra Progress Log" > "$PROGRESS_FILE"
      echo "Started: $(date)" >> "$PROGRESS_FILE"
      echo "---" >> "$PROGRESS_FILE"
    fi
  fi
  
  if [ -f "$PRD_FILE" ]; then
    local current_branch=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
    if [ -n "$current_branch" ]; then
      echo "$current_branch" > "$LAST_BRANCH_FILE"
    fi
  fi
}

init_progress() {
  if [ ! -f "$PROGRESS_FILE" ]; then
    echo "# Ralph Ultra Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
}

run_agent_loop() {
  for i in $(seq 1 $MAX_ITERATIONS); do
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  Ralph Ultra - Iteration $i of $MAX_ITERATIONS"
    echo "═══════════════════════════════════════════════════════"
    
    OUTPUT=$(run_ai "$PROMPT_FILE") || true
    
    echo "$OUTPUT"
    
    if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
      echo ""
      success "Ralph Ultra completed all tasks!"
      echo "Completed at iteration $i of $MAX_ITERATIONS"
      return 0
    fi
    
    info "Iteration $i complete. Continuing..."
    sleep 2
  done

  echo ""
  warn "Ralph Ultra reached max iterations ($MAX_ITERATIONS) without completing all tasks."
  echo "Check $PROGRESS_FILE for status."
  return 1
}

main() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║      Ralph Ultra - AI Agent Loop     ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
  echo ""
  
  info "Project: $PROJECT_DIR"
  info "Max iterations: $MAX_ITERATIONS"
  info "Logs: $LOG_DIR"
  echo ""
  
  check_prereqs
  run_budget_check
  archive_previous
  init_progress
  
  if [ "$AGENT_ONLY" = true ]; then
    run_agent_loop
  elif [ "$NO_MONITOR" = true ]; then
    warn "Running WITHOUT health monitoring (--no-monitor)"
    echo ""
    run_agent_loop
  else
    info "Starting Ralph Ultra with health monitoring..."
    info "Monitor runs as separate background process"
    echo ""
    
    # Start monitor in background (separate process)
    nohup "$MONITOR_SCRIPT" "$PROJECT_DIR" 5 > "$LOG_DIR/ralph-monitor-runner.log" 2>&1 &
    MONITOR_PID=$!
    
    echo "$MONITOR_PID" > "$PROJECT_DIR/.ralph-monitor.pid"
    success "Monitor started (PID: $MONITOR_PID)"
    info "Monitor log: $LOG_DIR/ralph-monitor-runner.log"
    echo ""
    
    # Give monitor time to start
    sleep 2
    
    # Check if monitor started successfully
    if kill -0 "$MONITOR_PID" 2>/dev/null; then
      info "Attaching to Ralph session (Ctrl+B, D to detach)..."
      sleep 3
      
      # Wait for tmux session to be created by monitor
      for i in {1..10}; do
        if tmux has-session -t ralph 2>/dev/null; then
          tmux attach -t ralph
          exit 0
        fi
        sleep 1
      done
      
      warn "Tmux session not ready yet. Attach manually with: tmux attach -t ralph"
    else
      error "Monitor failed to start. Check $LOG_DIR/ralph-monitor-runner.log"
    fi
  fi
}

main "$@"
