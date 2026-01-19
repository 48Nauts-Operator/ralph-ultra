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

# Command definitions with descriptions and options
declare -A CMD_DESC=(
    ["/help"]="Show this help"
    ["/quit"]="Exit TUI"
    ["/monitor"]="Switch to live log view"
    ["/status"]="Show system status (quota, hybrid, timing)"
    ["/logs"]="Browse log files"
    ["/run"]="Start Ralph"
    ["/stop"]="Stop Ralph"
    ["/report"]="Generate HTML report"
    ["/quota"]="Show Claude Pro quota status"
)

declare -A CMD_OPTS=(
    ["/run"]="--hybrid aggressive|balanced|conservative"
    ["/report"]="--open"
)

show_suggestions() {
    local prefix="$1"
    local matches=()
    
    for cmd in "${!CMD_DESC[@]}"; do
        if [[ "$cmd" == "$prefix"* ]]; then
            matches+=("$cmd")
        fi
    done
    
    if [[ ${#matches[@]} -eq 0 ]]; then
        return
    fi
    
    echo -e "${DIM}Commands:${NC}"
    for cmd in "${matches[@]}"; do
        local opts="${CMD_OPTS[$cmd]:-}"
        if [[ -n "$opts" ]]; then
            echo -e "  ${GREEN}$cmd${NC} ${DIM}[$opts]${NC} - ${CMD_DESC[$cmd]}"
        else
            echo -e "  ${GREEN}$cmd${NC} - ${CMD_DESC[$cmd]}"
        fi
    done
}

show_help() {
    clear
    echo -e "${BOLD}${CYAN}Ralph TUI Commands${NC}"
    echo -e "${DIM}─────────────────────────────────────${NC}"
    echo ""
    for cmd in /help /quit /monitor /status /logs /run /stop /report /quota; do
        local opts="${CMD_OPTS[$cmd]:-}"
        if [[ -n "$opts" ]]; then
            printf "  ${GREEN}%-12s${NC} ${DIM}%-35s${NC} %s\n" "$cmd" "[$opts]" "${CMD_DESC[$cmd]}"
        else
            printf "  ${GREEN}%-12s${NC} %s\n" "$cmd" "${CMD_DESC[$cmd]}"
        fi
    done
    echo ""
    echo -e "${DIM}Tip: Type '/' to see all commands, '/run' to see /run options${NC}"
    echo ""
    echo -e "${DIM}Press Enter to continue...${NC}"
    read -r
}

# Get project name for session naming
get_project_name() {
    local prd_file="$PROJECT_DIR/prd.json"
    local name=""
    
    # Try to get from prd.json
    if [[ -f "$prd_file" ]]; then
        name=$(jq -r '.project // .project.name // empty' "$prd_file" 2>/dev/null | head -1)
    fi
    
    # Fallback to directory basename
    if [[ -z "$name" ]]; then
        name=$(basename "$PROJECT_DIR")
    fi
    
    # Sanitize: lowercase, replace spaces/special chars with dashes
    echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//'
}

PROJECT_NAME=$(get_project_name)
RALPH_SESSION="ralph-${PROJECT_NAME}"
LOG_FILE="$PROJECT_DIR/logs/ralph-${PROJECT_NAME}.log"

is_ralph_running() {
    tmux has-session -t "$RALPH_SESSION" 2>/dev/null
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
    local args="${1:-}"
    
    if is_ralph_running; then
        echo -e "${YELLOW}Ralph is already running${NC}"
        echo -e "${DIM}Use /stop to stop it, or /monitor to view progress${NC}"
        return
    fi
    
    mkdir -p "$PROJECT_DIR/logs"
    
    local extra_args="${RALPH_TUI_ARGS:-} $args"
    echo -e "${GREEN}Starting Ralph in background...${NC}"
    [[ -n "$args" ]] && echo -e "${DIM}Args: $args${NC}"
    
    tmux new-session -d -s "$RALPH_SESSION" -c "$PROJECT_DIR" \
        "'$SCRIPT_DIR/ralph.sh' --skip-budget --skip-quota $extra_args --agent-only '$PROJECT_DIR' 2>&1 | tee '$LOG_FILE'"
    
    sleep 1
    
    if is_ralph_running; then
        echo -e "${GREEN}Ralph running (session: $RALPH_SESSION)${NC}"
        echo -e "${DIM}Use /monitor to view live output${NC}"
        switch_view "monitor"
    else
        echo -e "${RED}Failed to start Ralph${NC}"
    fi
}

cmd_stop() {
    if is_ralph_running; then
        tmux kill-session -t "$RALPH_SESSION" 2>/dev/null
        echo -e "${GREEN}Ralph stopped${NC}"
    else
        echo -e "${YELLOW}Ralph is not running${NC}"
    fi
}

cmd_report() {
    local args="${1:-}"
    echo -e "${BLUE}Generating report...${NC}"
    "$SCRIPT_DIR/ralph.sh" --report "$PROJECT_DIR" 2>/dev/null
    if [[ "$args" == *"--open"* ]]; then
        open "$PROJECT_DIR/ralph-report"*.html 2>/dev/null || xdg-open "$PROJECT_DIR/ralph-report"*.html 2>/dev/null
    fi
    echo -e "${GREEN}Report generated${NC}"
}

cmd_quota() {
    echo -e "${BLUE}Checking quota...${NC}"
    "$SCRIPT_DIR/ralph-quota.sh" --status 2>/dev/null || echo -e "${YELLOW}Quota check unavailable${NC}"
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
    local cmd_args="${cmd#* }"
    [[ "$cmd_args" == "$cmd" ]] && cmd_args=""
    
    case "$base_cmd" in
        /help|/h)      show_help ;;
        /quit|/q)      cmd_quit ;;
        /monitor)      cmd_monitor ;;
        /status)       cmd_status ;;
        /logs)         cmd_logs ;;
        /run)          cmd_run "$cmd_args" ;;
        /stop)         cmd_stop ;;
        /report)       cmd_report "$cmd_args" ;;
        /quota)        cmd_quota ;;
        /*)            show_suggestions "$base_cmd" ;;
        *)             echo -e "${RED}Commands must start with /${NC}" ;;
    esac
}

clear
echo -e "${BOLD}${CYAN}Ralph TUI Input${NC}"
echo -e "${DIM}Type /help for commands${NC}"
echo ""

# Check for auto-run from TUI launch args
if [[ "${RALPH_TUI_AUTO_RUN:-false}" == "true" ]]; then
    sleep 1
    echo -e "${DIM}Auto-starting Ralph...${NC}"
    cmd_run
fi

while true; do
    echo -n -e "${BOLD}${CYAN}> ${NC}"
    read -r input || break
    process_command "$input"
done
