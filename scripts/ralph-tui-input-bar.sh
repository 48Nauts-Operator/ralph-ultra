#!/usr/bin/env bash
# ralph-tui-input-bar.sh - Simple command input for Ralph TUI

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$(pwd)}"
[[ -d "$PROJECT_DIR" ]] && PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

show_help() {
    clear
    echo -e "${BOLD}${CYAN}Ralph TUI Commands${NC}"
    echo -e "${DIM}─────────────────────────────────────${NC}"
    echo ""
    echo -e "  ${GREEN}/help${NC}, ${GREEN}/h${NC}        Show this help"
    echo -e "  ${GREEN}/quit${NC}, ${GREEN}/q${NC}        Exit TUI"
    echo -e "  ${GREEN}/monitor${NC}        Switch to live log view"
    echo -e "  ${GREEN}/status${NC}         Show system status"
    echo -e "  ${GREEN}/logs${NC}           Browse log files"
    echo -e "  ${GREEN}/run${NC}            Start Ralph"
    echo -e "  ${GREEN}/stop${NC}           Stop Ralph"
    echo -e "  ${GREEN}/report${NC}         Generate HTML report"
    echo ""
    echo -e "${DIM}Press Enter to continue...${NC}"
    read -r
}

switch_view() {
    local view="$1"
    tmux send-keys -t ralph-tui:0.1 C-c
    sleep 0.2
    tmux send-keys -t ralph-tui:0.1 "'$SCRIPT_DIR/ralph-tui-right-panel.sh' $view '$PROJECT_DIR'" C-m
}

cmd_monitor() {
    echo -e "${BLUE}Switching to monitor view...${NC}"
    switch_view "monitor"
}

cmd_status() {
    echo -e "${BLUE}Switching to status view...${NC}"
    switch_view "status"
}

cmd_logs() {
    echo -e "${BLUE}Switching to logs view...${NC}"
    switch_view "logs"
}

cmd_run() {
    if pgrep -f "ralph.sh.*$PROJECT_DIR" > /dev/null 2>&1; then
        echo -e "${YELLOW}Ralph is already running${NC}"
        return
    fi
    echo -e "${GREEN}Starting Ralph in right panel...${NC}"
    tmux send-keys -t ralph-tui:0.1 C-c
    sleep 0.2
    tmux send-keys -t ralph-tui:0.1 "cd '$PROJECT_DIR' && '$SCRIPT_DIR/ralph.sh' --skip-budget --skip-quota --agent-only '$PROJECT_DIR'" C-m
    echo -e "${GREEN}Ralph running in right panel${NC}"
}

cmd_stop() {
    local pid
    pid=$(pgrep -f "ralph.sh.*$PROJECT_DIR" 2>/dev/null | head -1)
    if [[ -n "$pid" ]]; then
        kill "$pid" 2>/dev/null
        echo -e "${GREEN}Ralph stopped (PID: $pid)${NC}"
    else
        echo -e "${YELLOW}Ralph is not running${NC}"
    fi
}

cmd_report() {
    echo -e "${BLUE}Generating report...${NC}"
    "$SCRIPT_DIR/ralph.sh" --report "$PROJECT_DIR" 2>/dev/null
    echo -e "${GREEN}Report generated${NC}"
}

cmd_quit() {
    echo -e "${YELLOW}Exiting TUI...${NC}"
    tmux kill-session -t ralph-tui 2>/dev/null
    exit 0
}

process_command() {
    local cmd="$1"
    cmd=$(echo "$cmd" | tr '[:upper:]' '[:lower:]' | xargs)
    
    [[ -z "$cmd" ]] && return
    
    if [[ ! "$cmd" =~ ^/ ]]; then
        echo -e "${RED}Commands must start with /${NC}"
        return
    fi
    
    local base_cmd="${cmd%% *}"
    
    case "$base_cmd" in
        /help|/h)      show_help ;;
        /quit|/q)      cmd_quit ;;
        /monitor)      cmd_monitor ;;
        /status)       cmd_status ;;
        /logs)         cmd_logs ;;
        /run)          cmd_run ;;
        /stop)         cmd_stop ;;
        /report)       cmd_report ;;
        *)             echo -e "${RED}Unknown: $base_cmd${NC}. Type ${GREEN}/help${NC}" ;;
    esac
}

clear
echo -e "${BOLD}${CYAN}Ralph TUI Input${NC}"
echo -e "${DIM}Type /help for commands${NC}"
echo ""

while true; do
    echo -n -e "${BOLD}${CYAN}> ${NC}"
    read -r input || break
    process_command "$input"
done
