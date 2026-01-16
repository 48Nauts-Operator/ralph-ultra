#!/usr/bin/env bash
# ralph-tui-status-bar.sh - Top status bar for Ralph TUI
# Shows version, quota, hybrid status, and running state

set -euo pipefail

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BG_BLUE='\033[44m'
readonly BG_BLACK='\033[40m'
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

# Version
readonly VERSION="v1.5.0"

# PID file for Ralph process
readonly PID_FILE="$PROJECT_DIR/.ralph-run.pid"

# Get quota percentage
get_quota_percentage() {
    local quota_output
    quota_output=$("$SCRIPT_DIR/ralph-quota.sh" 2>/dev/null || echo "")

    # Strip ANSI codes for reliable parsing
    quota_output=$(echo "$quota_output" | sed 's/\x1b\[[0-9;]*m//g')

    # Extract 7-day utilization percentage
    # Look for the second "Utilization:" line (7-day window)
    local percentage
    percentage=$(echo "$quota_output" | grep -i "Utilization:" | tail -n1 | grep -oE '[0-9]+(\.[0-9]+)?%' | tr -d '%' || echo "0")

    if [[ -z "$percentage" ]] || [[ "$percentage" == "0" ]]; then
        echo "N/A"
    else
        echo "$percentage"
    fi
}

# Get quota color based on percentage
get_quota_color() {
    local percentage="$1"

    # Handle N/A case
    if [[ "$percentage" == "N/A" ]]; then
        echo "$CYAN"
        return
    fi

    # Convert to integer for comparison
    local pct_int
    pct_int=$(echo "$percentage" | cut -d. -f1)

    if [[ $pct_int -ge 98 ]]; then
        echo "$RED"
    elif [[ $pct_int -ge 90 ]]; then
        echo "$YELLOW"
    else
        echo "$GREEN"
    fi
}

# Get hybrid status
get_hybrid_status() {
    local hybrid_output
    hybrid_output=$("$SCRIPT_DIR/ralph-hybrid.sh" status 2>/dev/null || echo "")

    # Strip ANSI codes for reliable parsing
    hybrid_output=$(echo "$hybrid_output" | sed 's/\x1b\[[0-9;]*m//g')

    # Check if hybrid mode is enabled
    if echo "$hybrid_output" | grep -q "Mode:.*hybrid"; then
        echo "ON"
    else
        echo "OFF"
    fi
}

# Get running state
get_running_state() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null || echo "")

        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            echo "Running"
        else
            echo "Idle"
        fi
    else
        echo "Idle"
    fi
}

# Render status bar
render_status_bar() {
    # Get terminal width
    local term_width
    term_width=$(tput cols)

    # Get data
    local quota_pct
    quota_pct=$(get_quota_percentage)

    local quota_color
    quota_color=$(get_quota_color "$quota_pct")

    local hybrid_status
    hybrid_status=$(get_hybrid_status)

    local running_state
    running_state=$(get_running_state)

    # Build status bar content
    local left_content="Ralph Ultra $VERSION"
    local right_content

    # Format quota display
    if [[ "$quota_pct" == "N/A" ]]; then
        right_content="Quota: N/A | Hybrid: $hybrid_status | $running_state"
    else
        right_content="Quota: ${quota_pct}% | Hybrid: $hybrid_status | $running_state"
    fi

    # Calculate padding
    local content_length=$((${#left_content} + ${#right_content}))
    local padding_length=$((term_width - content_length - 2))

    # Ensure padding is non-negative
    if [[ $padding_length -lt 0 ]]; then
        padding_length=0
    fi

    local padding
    padding=$(printf '%*s' "$padding_length" '' | tr ' ' ' ')

    # Print status bar with background color
    echo -en "${BG_BLUE}${BOLD} ${left_content}${padding}"

    # Print quota with appropriate color
    echo -en "${BG_BLUE}${quota_color}Quota: "
    if [[ "$quota_pct" == "N/A" ]]; then
        echo -en "N/A"
    else
        echo -en "${quota_pct}%"
    fi

    echo -en "${BG_BLUE}${NC}${BG_BLUE}${BOLD} | Hybrid: ${hybrid_status} | ${running_state} ${NC}"
    echo ""
}

# Main loop with auto-refresh
main() {
    local update_interval=30  # seconds

    while true; do
        # Clear line and move cursor to beginning
        echo -ne "\r\033[K"

        # Render status bar
        render_status_bar

        # Wait for update interval
        sleep "$update_interval"
    done
}

# Run main function
main
