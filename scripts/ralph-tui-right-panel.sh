#!/usr/bin/env bash
# ralph-tui-right-panel.sh - Right panel for Ralph TUI
# Shows live monitor view by default, streaming logs from ralph-monitor.log

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

# Default view mode
VIEW_MODE="${1:-monitor}"
PROJECT_DIR="${2:-.}"

# Resolve absolute project path
if [[ -d "$PROJECT_DIR" ]]; then
    PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
else
    PROJECT_DIR="$(pwd)"
fi
LOG_FILE="$PROJECT_DIR/logs/ralph-monitor.log"

# Format timestamp for display
format_timestamp() {
    local line="$1"

    # Extract timestamp if present (ISO format: 2026-01-16T01:23:45)
    if [[ "$line" =~ ([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}) ]]; then
        local timestamp="${BASH_REMATCH[1]}"
        # Convert to [HH:MM:SS] format
        local time_part="${timestamp##*T}"
        echo -e "${DIM}[${time_part}]${NC} ${line#*"$timestamp"}"
    else
        echo "$line"
    fi
}

# Apply color coding based on log content
colorize_log_line() {
    local line="$1"

    # Format timestamp first
    line="$(format_timestamp "$line")"

    # Apply color based on keywords
    if [[ "$line" =~ (ERROR|FAIL|Failed|failed) ]]; then
        echo -e "${RED}${line}${NC}"
    elif [[ "$line" =~ (SUCCESS|PASS|Passed|passed|Complete|complete|✓) ]]; then
        echo -e "${GREEN}${line}${NC}"
    elif [[ "$line" =~ (WARN|WARNING|Warning|⚠) ]]; then
        echo -e "${YELLOW}${line}${NC}"
    elif [[ "$line" =~ (INFO|Starting|Initialized) ]]; then
        echo -e "${CYAN}${line}${NC}"
    else
        echo "$line"
    fi
}

# Render live monitor view
render_monitor() {
    clear

    # Header
    echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${BLUE}║${NC}  ${BOLD}Live Monitor${NC}                                              ${BOLD}${BLUE}║${NC}"
    echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check if log file exists
    if [[ ! -f "$LOG_FILE" ]]; then
        echo -e "${DIM}Waiting for activity...${NC}"
        echo -e "${DIM}Log file: ${LOG_FILE}${NC}"
        return
    fi

    # Stream log file with tail -f
    # Use -n 50 to show last 50 lines initially
    tail -n 50 -f "$LOG_FILE" 2>/dev/null | while IFS= read -r line; do
        colorize_log_line "$line"
    done
}

# Render help view
render_help() {
    clear

    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}Ralph TUI - Help${NC}                                         ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BOLD}Available Commands:${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${BOLD}/help, /h${NC}      Show this help"
    echo -e "  ${BOLD}/quit, /q${NC}      Exit Ralph TUI"
    echo -e "  ${BOLD}/monitor${NC}       Switch to live monitor view"
    echo -e "  ${BOLD}/status${NC}        Show system status (quota, hybrid, timing)"
    echo -e "  ${BOLD}/logs${NC}          Browse log files"
    echo -e "  ${BOLD}/run${NC}           Start Ralph run"
    echo -e "  ${BOLD}/stop${NC}          Stop Ralph run"
    echo -e "  ${BOLD}/report${NC}        Generate HTML report"
    echo ""
    echo -e "${BOLD}Keyboard Shortcuts:${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${BOLD}1${NC}             Switch to monitor view"
    echo -e "  ${BOLD}2${NC}             Switch to status view"
    echo -e "  ${BOLD}3${NC}             Switch to logs view"
    echo -e "  ${BOLD}?${NC}             Show help"
    echo -e "  ${BOLD}r${NC}             Run Ralph"
    echo -e "  ${BOLD}s${NC}             Stop Ralph"
    echo -e "  ${BOLD}Tab${NC}           Cycle through views"
    echo ""
    echo -e "${DIM}Press any key to return to monitor view...${NC}"

    # Wait for keypress
    read -n 1 -s

    # Switch back to monitor view
    exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" monitor "$PROJECT_DIR"
}

# Render status view
render_status() {
    clear

    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}System Status${NC}                                            ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Claude Pro Quota Section
    echo -e "${BOLD}Claude Pro Quota:${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Run quota check and parse output (strip ANSI codes for parsing)
    local quota_output quota_clean
    quota_output=$("$SCRIPT_DIR/ralph-quota.sh" --status 2>&1) || true
    # Strip ANSI color codes: \033[...m or \e[...m
    quota_clean=$(echo "$quota_output" | sed 's/\x1b\[[0-9;]*m//g')

    # Extract 5-hour quota
    local five_hour_util five_hour_reset
    if [[ "$quota_clean" =~ Utilization:[[:space:]]*([0-9.]+)% ]]; then
        five_hour_util="${BASH_REMATCH[1]}"
    else
        five_hour_util="N/A"
    fi

    if [[ "$quota_clean" =~ Resets[[:space:]]in:[[:space:]]*([0-9]+h[[:space:]]+[0-9]+m) ]]; then
        five_hour_reset="${BASH_REMATCH[1]}"
    else
        five_hour_reset="N/A"
    fi

    # Extract 7-day quota (look for second occurrence)
    local seven_day_util seven_day_reset
    # Use awk to get the second Utilization line
    seven_day_util=$(echo "$quota_clean" | grep "Utilization:" | tail -1 | sed -n 's/.*Utilization:[[:space:]]*\([0-9.]*\)%.*/\1/p')
    seven_day_reset=$(echo "$quota_clean" | grep "Resets in:" | tail -1 | sed -n 's/.*Resets in:[[:space:]]*\([0-9]*h[[:space:]]*[0-9]*m\).*/\1/p')

    if [[ -z "$seven_day_util" ]]; then
        seven_day_util="N/A"
    fi
    if [[ -z "$seven_day_reset" ]]; then
        seven_day_reset="N/A"
    fi

    # Color code based on utilization
    local five_hour_color="$GREEN"
    if [[ "$five_hour_util" != "N/A" ]]; then
        if (( $(echo "$five_hour_util >= 98" | bc -l 2>/dev/null || echo 0) )); then
            five_hour_color="$RED"
        elif (( $(echo "$five_hour_util >= 90" | bc -l 2>/dev/null || echo 0) )); then
            five_hour_color="$YELLOW"
        fi
    fi

    local seven_day_color="$GREEN"
    if [[ "$seven_day_util" != "N/A" ]]; then
        if (( $(echo "$seven_day_util >= 98" | bc -l 2>/dev/null || echo 0) )); then
            seven_day_color="$RED"
        elif (( $(echo "$seven_day_util >= 90" | bc -l 2>/dev/null || echo 0) )); then
            seven_day_color="$YELLOW"
        fi
    fi

    echo -e "  5-Hour:  ${five_hour_color}${five_hour_util}%${NC}  ${DIM}(resets in ${five_hour_reset})${NC}"
    echo -e "  7-Day:   ${seven_day_color}${seven_day_util}%${NC}  ${DIM}(resets in ${seven_day_reset})${NC}"
    echo ""

    # Hybrid LLM Section
    echo -e "${BOLD}Hybrid LLM Configuration:${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local hybrid_output
    hybrid_output=$("$SCRIPT_DIR/ralph-hybrid.sh" --status 2>&1) || true

    # Extract hybrid mode
    local hybrid_mode hybrid_provider hybrid_local_available
    if [[ "$hybrid_output" =~ Mode:[[:space:]]*([a-z]+) ]]; then
        hybrid_mode="${BASH_REMATCH[1]}"
    else
        hybrid_mode="disabled"
    fi

    if [[ "$hybrid_output" =~ Provider:[[:space:]]*([a-z]+) ]]; then
        hybrid_provider="${BASH_REMATCH[1]}"
    else
        hybrid_provider="N/A"
    fi

    if [[ "$hybrid_output" =~ "Local LLM is not available" ]]; then
        hybrid_local_available="no"
    elif [[ "$hybrid_output" =~ "Local LLM Status:" ]]; then
        hybrid_local_available="yes"
    else
        hybrid_local_available="unknown"
    fi

    # Extract statistics
    local total_requests local_requests api_requests
    if [[ "$hybrid_output" =~ Total[[:space:]]Requests:[[:space:]]*([0-9]+) ]]; then
        total_requests="${BASH_REMATCH[1]}"
    else
        total_requests="0"
    fi

    if [[ "$hybrid_output" =~ Local:[[:space:]]*([0-9]+) ]]; then
        local_requests="${BASH_REMATCH[1]}"
    else
        local_requests="0"
    fi

    if [[ "$hybrid_output" =~ API:[[:space:]]*([0-9]+) ]]; then
        api_requests="${BASH_REMATCH[1]}"
    else
        api_requests="0"
    fi

    # Display hybrid status
    echo -e "  Mode:            ${BOLD}${hybrid_mode}${NC}"
    echo -e "  Provider:        ${hybrid_provider}"
    echo -e "  Local Available: ${hybrid_local_available}"
    echo -e "  Requests:        Total: ${total_requests}, Local: ${local_requests}, API: ${api_requests}"
    echo ""

    # Timing Database Section
    echo -e "${BOLD}Timing Database:${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local timing_output
    timing_output=$("$SCRIPT_DIR/ralph-timing-db.sh" --stats 2>&1) || true

    # Extract timing stats
    local total_runs avg_duration success_rate total_hours
    if [[ "$timing_output" =~ total_runs[[:space:]]+projects.*[[:space:]]([0-9]+)[[:space:]]+[0-9]+[[:space:]]+([0-9.]+) ]]; then
        total_runs="${BASH_REMATCH[1]}"
        avg_duration="${BASH_REMATCH[2]}"
    else
        total_runs="0"
        avg_duration="0"
    fi

    # Try to extract success rate and total hours from the table
    if [[ "$timing_output" =~ total_hours[[:space:]]+success_rate.*[[:space:]]([0-9.]+)[[:space:]]+([0-9.]+)[[:space:]]*$ ]]; then
        total_hours="${BASH_REMATCH[1]}"
        success_rate="${BASH_REMATCH[2]}"
    else
        total_hours="0"
        success_rate="100.0"
    fi

    echo -e "  Total Runs:      ${BOLD}${total_runs}${NC}"
    echo -e "  Avg Duration:    ${avg_duration} minutes"
    echo -e "  Total Runtime:   ${total_hours} hours"
    echo -e "  Success Rate:    ${GREEN}${success_rate}%${NC}"
    echo ""

    echo -e "${DIM}Type /monitor to return to live monitor view${NC}"
}

# Render logs browser view
render_logs() {
    clear

    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}Log Files${NC}                                                ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${DIM}Log browser will be implemented in TUI-007${NC}"
}

# Main dispatcher
case "$VIEW_MODE" in
    monitor)
        render_monitor
        ;;
    help)
        render_help
        ;;
    status)
        render_status
        ;;
    logs)
        render_logs
        ;;
    *)
        echo -e "${RED}Unknown view mode: $VIEW_MODE${NC}"
        exit 1
        ;;
esac
