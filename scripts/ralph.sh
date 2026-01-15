#!/bin/bash
# Ralph Ultra - Autonomous AI Agent System
# Enhanced with: health monitoring, budget planning, sub-agent delegation
# Works with: amp, opencode, claude
# Usage: ./ralph.sh [project_dir] [max_iterations]

set -e

PROJECT_DIR="${1:-.}"
MAX_ITERATIONS="${2:-10}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/prompt.md"

cd "$PROJECT_DIR" || { echo "Cannot access project directory: $PROJECT_DIR"; exit 1; }
PROJECT_DIR="$(pwd)"

PRD_FILE="prd.json"
PROGRESS_FILE="progress.txt"
ARCHIVE_DIR="archive"
LAST_BRANCH_FILE=".last-branch"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Detect available AI CLI
detect_cli() {
  if command -v amp &> /dev/null; then
    echo "amp"
  elif command -v opencode &> /dev/null; then
    echo "opencode"
  elif command -v claude &> /dev/null; then
    echo "claude"
  else
    echo "none"
  fi
}

# Run AI command based on detected CLI
run_ai() {
  local prompt_file="$1"
  local cli=$(detect_cli)
  
  case "$cli" in
    amp)
      cat "$prompt_file" | amp --dangerously-allow-all 2>&1
      ;;
    opencode)
      # OpenCode CLI - use 'run' command for non-interactive mode
      # Permissions are configured via OPENCODE_PERMISSION env var or opencode.json
      # Set OPENCODE_PERMISSION='{"*":"allow"}' to allow all, or configure in opencode.json
      OPENCODE_PERMISSION='{"*":"allow"}' opencode run "$(cat $prompt_file)" 2>&1
      ;;
    claude)
      # Claude Code CLI usage
      claude --print --dangerously-skip-permissions "$(cat $prompt_file)" 2>&1
      ;;
    none)
      error "No AI CLI found. Install one of: amp, opencode, claude"
      ;;
  esac
}

# Check prerequisites
check_prereqs() {
  if ! command -v jq &> /dev/null; then
    error "jq is required but not installed. Install with: brew install jq"
  fi
  
  if [ ! -f "$PRD_FILE" ]; then
    error "prd.json not found. Create one using the 'prd' skill first."
  fi
  
  if [ ! -f "$PROMPT_FILE" ]; then
    error "prompt.md not found at $PROMPT_FILE"
  fi
  
  local cli=$(detect_cli)
  if [ "$cli" = "none" ]; then
    error "No AI CLI found. Install one of: amp, opencode, claude"
  fi
  info "Using CLI: $cli"
}

# Archive previous run if branch changed
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
      
      # Reset progress file
      echo "# Ralph Progress Log" > "$PROGRESS_FILE"
      echo "Started: $(date)" >> "$PROGRESS_FILE"
      echo "---" >> "$PROGRESS_FILE"
    fi
  fi
  
  # Track current branch
  if [ -f "$PRD_FILE" ]; then
    local current_branch=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
    if [ -n "$current_branch" ]; then
      echo "$current_branch" > "$LAST_BRANCH_FILE"
    fi
  fi
}

# Initialize progress file
init_progress() {
  if [ ! -f "$PROGRESS_FILE" ]; then
    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
}

# Main loop
main() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║      Ralph Ultra - AI Agent Loop     ║${NC}"
  echo -e "${BLUE}║    Universal Edition (amp/oc/claude) ║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
  echo ""
  
  check_prereqs
  archive_previous
  init_progress
  
  info "Starting Ralph Ultra - Max iterations: $MAX_ITERATIONS"
  info "Project: $PROJECT_DIR"
  info "PRD: $PRD_FILE"
  info "Progress: $PROGRESS_FILE"
  echo ""

  for i in $(seq 1 $MAX_ITERATIONS); do
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  Ralph Ultra - Iteration $i of $MAX_ITERATIONS"
    echo "═══════════════════════════════════════════════════════"
    
    # Run AI with the ralph prompt
    OUTPUT=$(run_ai "$PROMPT_FILE") || true
    
    # Echo output for visibility
    echo "$OUTPUT"
    
    # Check for completion signal
    if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
      echo ""
      success "Ralph Ultra completed all tasks!"
      echo "Completed at iteration $i of $MAX_ITERATIONS"
      exit 0
    fi
    
    info "Iteration $i complete. Continuing..."
    sleep 2
  done

  echo ""
  warn "Ralph Ultra reached max iterations ($MAX_ITERATIONS) without completing all tasks."
  echo "Check $PROGRESS_FILE for status."
  exit 1
}

# Run
main "$@"
