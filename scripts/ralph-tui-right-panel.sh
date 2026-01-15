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
    echo -e "${DIM}Status view will be implemented in TUI-006${NC}"
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
