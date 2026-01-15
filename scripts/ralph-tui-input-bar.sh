#!/usr/bin/env bash
# ralph-tui-input-bar.sh - Command input bar for Ralph TUI
# Accepts slash commands, maintains history, and dispatches to handlers

set -euo pipefail

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly DIM='\033[2m'
readonly BOLD='\033[1m'
readonly NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Project directory
PROJECT_DIR="${1:-.}"
if [[ -d "$PROJECT_DIR" ]]; then
    PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
else
    PROJECT_DIR="$(pwd)"
fi

# History file
HISTORY_FILE="$PROJECT_DIR/.ralph-tui-history"
HISTORY_MAX=20

# Command pipe for inter-pane communication
COMMAND_PIPE="/tmp/ralph-tui-commands-$$"

# Initialize history file
init_history() {
    if [[ ! -f "$HISTORY_FILE" ]]; then
        touch "$HISTORY_FILE"
    fi
}

# Add command to history
add_to_history() {
    local cmd="$1"

    # Don't add empty commands
    [[ -z "$cmd" ]] && return

    # Don't add duplicate consecutive commands
    local last_cmd=""
    if [[ -f "$HISTORY_FILE" ]]; then
        last_cmd=$(tail -n 1 "$HISTORY_FILE" 2>/dev/null || echo "")
    fi
    [[ "$cmd" == "$last_cmd" ]] && return

    # Append to history file
    echo "$cmd" >> "$HISTORY_FILE"

    # Trim history to last 20 entries
    local temp_file="${HISTORY_FILE}.tmp"
    tail -n "$HISTORY_MAX" "$HISTORY_FILE" > "$temp_file"
    mv "$temp_file" "$HISTORY_FILE"
}

# Get command from history (offset from end: 0 = last, 1 = second to last, etc.)
get_from_history() {
    local offset="$1"

    if [[ ! -f "$HISTORY_FILE" ]]; then
        return
    fi

    # Count total history entries
    local total
    total=$(wc -l < "$HISTORY_FILE" | tr -d ' ')

    if [[ $total -eq 0 ]]; then
        return
    fi

    # Calculate line number (tail counts from end)
    local line_num=$((offset + 1))

    if [[ $line_num -gt $total ]]; then
        return
    fi

    # Get the command
    tail -n "$line_num" "$HISTORY_FILE" | head -n 1
}

# Validate and normalize command
normalize_command() {
    local cmd="$1"

    # Trim whitespace
    cmd="$(echo "$cmd" | xargs)"

    # Convert to lowercase for case-insensitive matching
    cmd="$(echo "$cmd" | tr '[:upper:]' '[:lower:]')"

    echo "$cmd"
}

# Check if command is valid
is_valid_command() {
    local cmd="$1"

    # List of valid commands (aliases included)
    local valid_commands=(
        "/help" "/h"
        "/quit" "/q"
        "/monitor"
        "/status"
        "/logs"
        "/run"
        "/stop"
        "/report"
    )

    # Extract base command (without arguments)
    local base_cmd
    base_cmd=$(echo "$cmd" | awk '{print $1}')

    for valid in "${valid_commands[@]}"; do
        if [[ "$base_cmd" == "$valid" ]]; then
            return 0
        fi
    done

    return 1
}

# Process command and send to appropriate handler
process_command() {
    local cmd="$1"
    local normalized

    # Normalize command
    normalized="$(normalize_command "$cmd")"

    # Empty command - do nothing
    if [[ -z "$normalized" ]]; then
        return 0
    fi

    # Must start with /
    if [[ ! "$normalized" =~ ^/ ]]; then
        echo -e "${RED}Commands must start with /${NC}"
        echo -e "${DIM}Type /help for available commands${NC}"
        return 1
    fi

    # Check if valid command
    if ! is_valid_command "$normalized"; then
        echo -e "${RED}Unknown command: ${normalized}${NC}"
        echo -e "${DIM}Type /help for list of available commands${NC}"
        return 1
    fi

    # Extract base command and arguments
    local base_cmd
    base_cmd=$(echo "$normalized" | awk '{print $1}')

    local args=""
    if [[ "$normalized" =~ [[:space:]] ]]; then
        args="${normalized#* }"
    fi

    # Add to history
    add_to_history "$cmd"

    # Dispatch command
    dispatch_command "$base_cmd" "$args"
}

# Dispatch command to handler
dispatch_command() {
    local cmd="$1"
    local args="$2"

    case "$cmd" in
        /help|/h)
            handle_help
            ;;
        /quit|/q)
            handle_quit
            ;;
        /monitor)
            handle_monitor
            ;;
        /status)
            handle_status
            ;;
        /logs)
            handle_logs
            ;;
        /run)
            handle_run
            ;;
        /stop)
            handle_stop
            ;;
        /report)
            handle_report "$args"
            ;;
        *)
            echo -e "${RED}Unknown command: $cmd${NC}"
            return 1
            ;;
    esac
}

# Command handlers
handle_help() {
    # Send command to right panel to show help view
    tmux send-keys -t ralph-tui:0.1 C-c
    tmux send-keys -t ralph-tui:0.1 "'$SCRIPT_DIR/ralph-tui-right-panel.sh' help '$PROJECT_DIR'" C-m
}

handle_quit() {
    echo -e "${CYAN}Exiting Ralph TUI...${NC}"
    # Kill the tmux session
    tmux kill-session -t ralph-tui
}

handle_monitor() {
    # Switch right panel to monitor view
    tmux send-keys -t ralph-tui:0.1 C-c
    tmux send-keys -t ralph-tui:0.1 "'$SCRIPT_DIR/ralph-tui-right-panel.sh' monitor '$PROJECT_DIR'" C-m
}

handle_status() {
    # Switch right panel to status view
    tmux send-keys -t ralph-tui:0.1 C-c
    tmux send-keys -t ralph-tui:0.1 "'$SCRIPT_DIR/ralph-tui-right-panel.sh' status '$PROJECT_DIR'" C-m
}

handle_logs() {
    # Switch right panel to logs browser
    tmux send-keys -t ralph-tui:0.1 C-c
    tmux send-keys -t ralph-tui:0.1 "'$SCRIPT_DIR/ralph-tui-right-panel.sh' logs '$PROJECT_DIR'" C-m
}

handle_run() {
    echo -e "${YELLOW}Run command will be implemented in TUI-008${NC}"
}

handle_stop() {
    echo -e "${YELLOW}Stop command will be implemented in TUI-008${NC}"
}

handle_report() {
    local args="$1"
    echo -e "${YELLOW}Report command will be implemented in TUI-010${NC}"
}

# Main input loop with readline support
main_loop() {
    local history_offset=0
    local current_input=""

    # Enable history
    init_history

    # Set up readline for command history
    # We'll use bash's built-in read with -e for readline support
    while true; do
        # Show prompt and read input with readline support
        # -e enables readline editing
        # -p sets the prompt
        echo -n -e "${BOLD}${CYAN}> ${NC}"

        # Read command with basic input
        read -r user_input || break

        # Process the command
        process_command "$user_input"

        # Reset history offset after command
        history_offset=0
    done
}

# Alternative implementation using readline with history navigation
# This version supports up/down arrow keys for history
interactive_loop() {
    local history_offset=-1
    local temp_input=""

    # Enable history
    init_history

    # Load history into bash's built-in history
    if [[ -f "$HISTORY_FILE" ]]; then
        while IFS= read -r line; do
            history -s "$line"
        done < "$HISTORY_FILE"
    fi

    # Enable readline
    set -o emacs  # or set -o vi for vi mode

    while true; do
        # Read with readline support (-e flag)
        if read -e -p "$(echo -e "${BOLD}${CYAN}> ${NC}")" user_input; then
            # Process the command
            if [[ -n "$user_input" ]]; then
                process_command "$user_input"
                history -s "$user_input"  # Add to bash history for this session
            fi
        else
            # EOF (Ctrl+D) pressed
            break
        fi
    done
}

# Clean up on exit
cleanup() {
    # Remove command pipe if it exists
    [[ -p "$COMMAND_PIPE" ]] && rm -f "$COMMAND_PIPE"
}

trap cleanup EXIT

# Run the interactive loop
interactive_loop
