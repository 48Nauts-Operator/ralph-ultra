#!/usr/bin/env bash
#
# ralph-tui.sh - Interactive Terminal UI for Ralph Ultra
# Displays PRD progress, live monitoring, and accepts slash commands
#

set -euo pipefail

# Color codes for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Constants
SESSION_NAME="ralph-tui"
MIN_TMUX_VERSION="2.1"

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RALPH_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Usage information
usage() {
    cat << EOF
Ralph TUI - Interactive Terminal Dashboard

Usage:
    $(basename "$0") [PROJECT_PATH]

Arguments:
    PROJECT_PATH    Path to project directory (default: current directory)
                    Must contain prd.json file

Options:
    -h, --help      Show this help message

Examples:
    $(basename "$0")                    # Use current directory
    $(basename "$0") ~/my-project       # Use specified project

EOF
    exit 0
}

# Error handling
error() {
    echo -e "${RED}ERROR:${NC} $1" >&2
    exit 1
}

warn() {
    echo -e "${YELLOW}WARNING:${NC} $1" >&2
}

info() {
    echo -e "${BLUE}INFO:${NC} $1"
}

success() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

# Check if tmux is installed
check_tmux() {
    if ! command -v tmux &> /dev/null; then
        error "tmux is not installed. Please install tmux first:
    macOS: brew install tmux
    Ubuntu/Debian: sudo apt-get install tmux
    RHEL/CentOS: sudo yum install tmux"
    fi

    # Check tmux version
    local tmux_version
    tmux_version=$(tmux -V | cut -d' ' -f2)
    if ! printf '%s\n%s\n' "$MIN_TMUX_VERSION" "$tmux_version" | sort -V -C; then
        warn "tmux version $tmux_version detected. Recommended: $MIN_TMUX_VERSION or higher"
    fi
}

# Validate project directory
validate_project() {
    local project_path="$1"

    if [[ ! -d "$project_path" ]]; then
        error "Project path does not exist: $project_path"
    fi

    if [[ ! -f "$project_path/prd.json" ]]; then
        error "prd.json not found in: $project_path
Please ensure this is a valid Ralph project directory."
    fi

    # Validate prd.json is valid JSON
    if ! jq empty "$project_path/prd.json" 2>/dev/null; then
        error "prd.json is not valid JSON in: $project_path"
    fi

    success "Valid Ralph project found: $project_path"
}

# Kill existing session if running
kill_session() {
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        info "Killing existing TUI session..."
        tmux kill-session -t "$SESSION_NAME"
    fi
}

# Create tmux session with layout
create_session() {
    local project_path="$1"

    info "Creating TUI session for: $project_path"

    # Create new session in detached mode
    tmux new-session -d -s "$SESSION_NAME" -c "$project_path"

    # Split window: create right pane (60%)
    tmux split-window -h -t "$SESSION_NAME:0" -p 60 -c "$project_path"

    # Split bottom for input bar (3 lines from bottom)
    tmux split-window -v -t "$SESSION_NAME:0.1" -l 3 -c "$project_path"

    # Set pane titles
    tmux select-pane -t "$SESSION_NAME:0.0" -T "PRD Progress"
    tmux select-pane -t "$SESSION_NAME:0.1" -T "Live Monitor"
    tmux select-pane -t "$SESSION_NAME:0.2" -T "Command Input"

    # Set environment variable for project path
    tmux set-environment -t "$SESSION_NAME" RALPH_PROJECT_PATH "$project_path"

    # Initialize panes with placeholder content
    # Left pane: PRD progress viewer (with watch mode for auto-refresh)
    tmux send-keys -t "$SESSION_NAME:0.0" "'$SCRIPT_DIR/ralph-tui-left-panel.sh' --watch '$project_path'" C-m

    # Right pane: Live monitor (default view)
    tmux send-keys -t "$SESSION_NAME:0.1" "'$SCRIPT_DIR/ralph-tui-right-panel.sh' monitor '$project_path'" C-m

    # Bottom pane: Interactive input bar
    tmux send-keys -t "$SESSION_NAME:0.2" "'$SCRIPT_DIR/ralph-tui-input-bar.sh' '$project_path'" C-m

    # Focus on input pane
    tmux select-pane -t "$SESSION_NAME:0.2"

    success "TUI session created successfully"
}

# Attach to existing session or create new one
attach_or_create() {
    local project_path="$1"

    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        info "Attaching to existing TUI session..."
        # Check if the session is for the same project
        local existing_path
        existing_path=$(tmux show-environment -t "$SESSION_NAME" RALPH_PROJECT_PATH 2>/dev/null | cut -d'=' -f2 || echo "")

        if [[ "$existing_path" != "$project_path" ]]; then
            warn "Existing session is for a different project: $existing_path"
            read -p "Kill existing session and create new one? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                kill_session
                create_session "$project_path"
            else
                info "Keeping existing session"
            fi
        fi

        tmux attach-session -t "$SESSION_NAME"
    else
        create_session "$project_path"
        tmux attach-session -t "$SESSION_NAME"
    fi
}

# Cleanup handler
cleanup() {
    info "Cleaning up TUI session..."
    kill_session
    exit 0
}

# Main function
main() {
    # Parse arguments
    local project_path="${1:-.}"

    # Handle help flag
    if [[ "$project_path" == "-h" ]] || [[ "$project_path" == "--help" ]]; then
        usage
    fi

    # Resolve to absolute path
    if [[ -d "$project_path" ]]; then
        project_path=$(cd "$project_path" && pwd)
    else
        error "Directory does not exist: $project_path"
    fi

    # Check dependencies
    check_tmux

    # Validate project
    validate_project "$project_path"

    # Setup cleanup trap
    trap cleanup SIGINT SIGTERM

    # Create or attach to session
    attach_or_create "$project_path"
}

# Run main function
main "$@"
