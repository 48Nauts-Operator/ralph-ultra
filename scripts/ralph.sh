#!/bin/bash
# Ralph Ultra - Autonomous AI Agent System
# Usage: ralph.sh <project_dir> [max_iterations]

set -e

# Define SCRIPT_DIR early (needed for flags that exec other scripts)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=$(cat "$SCRIPT_DIR/../VERSION" 2>/dev/null || echo "unknown")

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
  echo "Ralph Ultra v$VERSION - Autonomous AI Agent System"
  echo ""
  echo "Usage: ralph.sh [options] <project_dir> [max_iterations]"
  echo "       ralph.sh tui [project_dir]"
  echo ""
  echo "Commands:"
  echo "  tui             Launch interactive Terminal UI dashboard"
  echo ""
  echo "Arguments:"
  echo "  project_dir     Path to project (REQUIRED, default: current dir for tui)"
  echo "  max_iterations  Maximum iterations (auto-calculated if not provided)"
  echo "                  Auto: remaining_stories * 3, min 10, max 200"
  echo ""
  echo "Options:"
  echo "  --worktree      Create git worktree instead of branch"
  echo "  --branch NAME   Specify branch name (default: ralph/<project-name>)"
  echo "  --no-monitor    Run without health monitoring"
  echo "  --skip-budget   Skip budget check"
  echo "  --skip-quota    Skip Claude Pro quota check"
  echo "  --quota-status  Show Claude Pro quota status"
  echo "  --hybrid MODE   Enable hybrid LLM routing (aggressive|balanced|conservative)"
  echo "  --hybrid-status Show hybrid LLM router status"
  echo "  --hybrid-stats  Show hybrid LLM usage statistics"
  echo "  --status        Show current status"
  echo "  --report        Generate HTML report"
  echo "  --version, -v   Show version"
  echo "  --help, -h      Show this help"
  echo ""
  echo "Git Behavior:"
  echo "  - If on main/master: auto-creates branch 'ralph/<project-name>'"
  echo "  - If on feature branch: continues on current branch"
  echo "  - With --worktree: creates separate worktree directory"
  echo "  - Not a git repo: warns but continues"
  echo ""
  echo "Examples:"
  echo "  ralph.sh /path/to/project"
  echo "  ralph.sh tui                         # TUI for current directory"
  echo "  ralph.sh tui /path/to/project        # TUI for specific project"
  echo "  ralph.sh --worktree /path/to/project"
  echo "  ralph.sh --branch feature/my-feature /path/to/project"
  echo "  ralph.sh --status /path/to/project"
}

NO_MONITOR=false
SKIP_BUDGET=false
SKIP_QUOTA=false
HYBRID_MODE="${RALPH_HYBRID_MODE:-}"
STATUS_ONLY=false
REPORT_ONLY=false
AGENT_ONLY=false
USE_WORKTREE=false
BRANCH_NAME=""

if [[ "$1" == "tui" ]]; then
  shift
  exec "$SCRIPT_DIR/ralph-tui.sh" "$@"
fi

while [[ "$1" == --* ]] || [[ "$1" == "-v" ]]; do
  case "$1" in
    --help|-h)
      show_usage
      exit 0
      ;;
    --version|-v)
      echo "Ralph Ultra v$VERSION"
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
    --skip-quota)
      SKIP_QUOTA=true
      shift
      ;;
    --quota-status)
      exec "$SCRIPT_DIR/ralph-quota.sh" --status
      ;;
    --hybrid)
      HYBRID_MODE="${2:-balanced}"
      shift 2
      ;;
    --hybrid-status)
      exec "$SCRIPT_DIR/ralph-hybrid.sh" --status
      ;;
    --hybrid-stats)
      exec "$SCRIPT_DIR/ralph-hybrid.sh" --stats
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
    --worktree)
      USE_WORKTREE=true
      shift
      ;;
    --branch)
      BRANCH_NAME="$2"
      shift 2
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
PROMPT_FILE="$SCRIPT_DIR/prompt.md"
MONITOR_SCRIPT="$SCRIPT_DIR/ralph-monitor.sh"
BUDGET_SCRIPT="$SCRIPT_DIR/ralph-budget.sh"
QUOTA_SCRIPT="$SCRIPT_DIR/ralph-quota.sh"
HYBRID_SCRIPT="$SCRIPT_DIR/ralph-hybrid.sh"

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

setup_git_branch() {
  if [ ! -d ".git" ]; then
    warn "Not a git repository. Consider initializing git for version control."
    return 0
  fi
  
  if ! git config user.name &>/dev/null || ! git config user.email &>/dev/null; then
    error "Git user not configured. Run:
       git config user.name 'Your Name'
       git config user.email 'your@email.com'"
  fi
  
  local current_branch=$(git branch --show-current 2>/dev/null)
  local project_name=$(basename "$PROJECT_DIR")
  local default_branch_name="ralph/${project_name}"
  
  if [ -n "$BRANCH_NAME" ]; then
    default_branch_name="$BRANCH_NAME"
  fi
  
  if [ "$USE_WORKTREE" = true ]; then
    local worktree_path="../${project_name}-ralph-worktree"
    
    if [ -d "$worktree_path" ]; then
      info "Worktree already exists at $worktree_path"
      cd "$worktree_path" || error "Cannot access worktree"
      PROJECT_DIR="$(pwd)"
      return 0
    fi
    
    info "Creating git worktree at $worktree_path on branch $default_branch_name"
    
    if ! git branch --list "$default_branch_name" | grep -q "$default_branch_name"; then
      git branch "$default_branch_name" 2>/dev/null || true
    fi
    
    git worktree add "$worktree_path" "$default_branch_name" 2>/dev/null || {
      error "Failed to create worktree. Check if branch '$default_branch_name' exists."
    }
    
    cd "$worktree_path" || error "Cannot access worktree"
    PROJECT_DIR="$(pwd)"
    success "Worktree created at $PROJECT_DIR"
    return 0
  fi
  
  if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
    info "On $current_branch branch. Creating feature branch: $default_branch_name"
    
    if git branch --list "$default_branch_name" | grep -q "$default_branch_name"; then
      git checkout "$default_branch_name" 2>/dev/null || {
        error "Failed to checkout existing branch '$default_branch_name'"
      }
      success "Switched to existing branch: $default_branch_name"
    else
      git checkout -b "$default_branch_name" 2>/dev/null || {
        error "Failed to create branch '$default_branch_name'"
      }
      success "Created and switched to branch: $default_branch_name"
    fi
  else
    info "Already on feature branch: $current_branch"
  fi
}

if [ "$AGENT_ONLY" != true ]; then
  setup_git_branch
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

run_hybrid_check() {
  if [ -z "$HYBRID_MODE" ]; then
    return 0
  fi
  
  if [ ! -f "$HYBRID_SCRIPT" ]; then
    warn "Hybrid script not found, skipping hybrid setup"
    return 0
  fi
  
  echo ""
  echo -e "${CYAN}Hybrid LLM Mode: $HYBRID_MODE${NC}"
  echo "─────────────────────────────────────────"
  
  export RALPH_HYBRID_MODE="$HYBRID_MODE"
  
  "$HYBRID_SCRIPT" --status | head -30
  
  echo ""
  info "Hybrid routing enabled - local LLM will handle applicable tasks"
}

run_quota_check() {
  if [ "$SKIP_QUOTA" = true ]; then
    info "Skipping quota check (--skip-quota)"
    return 0
  fi
  
  if [ ! -f "$QUOTA_SCRIPT" ]; then
    warn "Quota script not found, skipping quota check"
    return 0
  fi
  
  echo ""
  echo -e "${CYAN}Quota Check${NC}"
  echo "─────────────────────────────────────────"
  
  "$QUOTA_SCRIPT" --preflight
  local result=$?
  
  case $result in
    0)
      return 0
      ;;
    1)
      warn "Quota is high but within limits"
      return 0
      ;;
    2)
      echo ""
      error "Quota exhausted! Cannot proceed."
      echo ""
      read -p "Wait for cooldown? [Y/n] " -n 1 -r
      echo ""
      
      if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        "$QUOTA_SCRIPT" --wait
        return $?
      else
        info "Aborted by user."
        exit 0
      fi
      ;;
    *)
      warn "Could not check quota (continuing anyway)"
      return 0
      ;;
  esac
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
  run_quota_check
  run_hybrid_check
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
