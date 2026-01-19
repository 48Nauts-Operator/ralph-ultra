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
MONITOR_LOG="$PROJECT_DIR/logs/ralph-monitor.log"
AGENT_LOG="$PROJECT_DIR/logs/ralph-agent.log"

# Use agent log if it exists and is newer, otherwise monitor log
if [[ -f "$AGENT_LOG" ]] && [[ -f "$MONITOR_LOG" ]]; then
    if [[ "$AGENT_LOG" -nt "$MONITOR_LOG" ]]; then
        LOG_FILE="$AGENT_LOG"
    else
        LOG_FILE="$MONITOR_LOG"
    fi
elif [[ -f "$AGENT_LOG" ]]; then
    LOG_FILE="$AGENT_LOG"
else
    LOG_FILE="$MONITOR_LOG"
fi

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

# Handle keyboard shortcuts (global across all views)
handle_keyboard_shortcut() {
    local key="$1"

    case "$key" in
        1)
            # Switch to monitor view
            exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" monitor "$PROJECT_DIR"
            ;;
        2)
            # Switch to status view
            exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" status "$PROJECT_DIR"
            ;;
        3)
            # Switch to logs view
            exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" logs "$PROJECT_DIR"
            ;;
        '?')
            # Show help
            exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" help "$PROJECT_DIR"
            ;;
        r)
            # Run Ralph - send command to input bar pane
            tmux send-keys -t ralph-tui:0.3 "/run" C-m
            ;;
        s)
            # Stop Ralph - send command to input bar pane
            tmux send-keys -t ralph-tui:0.3 "/stop" C-m
            ;;
        $'\t')
            # Tab: cycle through views (monitor -> status -> logs -> monitor)
            case "$VIEW_MODE" in
                monitor)
                    exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" status "$PROJECT_DIR"
                    ;;
                status)
                    exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" logs "$PROJECT_DIR"
                    ;;
                logs|help)
                    exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" monitor "$PROJECT_DIR"
                    ;;
            esac
            ;;
    esac

    return 0
}

# Render live monitor view with keyboard shortcuts
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
        echo ""
        echo -e "${DIM}Keyboard shortcuts: 1=monitor 2=status 3=logs ?=help Tab=cycle r=run s=stop${NC}"

        # Wait for keypress with shortcuts
        while true; do
            read -rsn1 -t 2 key || continue
            handle_keyboard_shortcut "$key"
        done
        return
    fi

    # Display initial log content and keyboard hint
    echo -e "${DIM}Keyboard shortcuts: 1=monitor 2=status 3=logs ?=help Tab=cycle r=run s=stop${NC}"
    echo ""

    # Show last 50 lines
    tail -n 50 "$LOG_FILE" 2>/dev/null | while IFS= read -r line; do
        colorize_log_line "$line"
    done

    # Start tail -f in background and capture its PID
    tail -f "$LOG_FILE" 2>/dev/null | while IFS= read -r line; do
        colorize_log_line "$line"
    done &
    local tail_pid=$!

    # Listen for keyboard shortcuts while tail runs
    while kill -0 $tail_pid 2>/dev/null; do
        # Check for keypress with timeout (non-blocking)
        if read -rsn1 -t 1 key; then
            # Kill tail process
            kill $tail_pid 2>/dev/null
            # Handle the shortcut
            handle_keyboard_shortcut "$key"
        fi
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

    # Wait for keypress and handle shortcuts
    while true; do
        read -rsn1 key
        # Try shortcuts first
        handle_keyboard_shortcut "$key" || true
        # If not a shortcut (function returns 1), just return to monitor
        exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" monitor "$PROJECT_DIR"
    done
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

    echo -e "${DIM}Keyboard shortcuts: 1=monitor 2=status 3=logs ?=help Tab=cycle r=run s=stop${NC}"

    # Wait for keyboard shortcuts
    while true; do
        read -rsn1 -t 2 key || continue
        handle_keyboard_shortcut "$key"
    done
}

# Format file size for display
format_size() {
    local size="$1"
    if (( size < 1024 )); then
        echo "${size}B"
    elif (( size < 1048576 )); then
        echo "$(( size / 1024 ))KB"
    else
        echo "$(( size / 1048576 ))MB"
    fi
}

# Format modification time for display
format_mtime() {
    local file="$1"
    # Use stat with cross-platform flags
    if stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$file" 2>/dev/null; then
        : # BSD/macOS format
    elif stat -c "%y" "$file" 2>/dev/null | cut -d'.' -f1; then
        : # GNU/Linux format
    else
        echo "unknown"
    fi
}

# Render logs browser view
render_logs() {
    local logs_dir="$PROJECT_DIR/logs"
    local selected_index=0

    # Check if logs directory exists
    if [[ ! -d "$logs_dir" ]]; then
        clear
        echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}Log Files${NC}                                                ${BOLD}${CYAN}║${NC}"
        echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${RED}Logs directory not found: ${logs_dir}${NC}"
        echo ""
        echo -e "${DIM}Press any key to return to monitor view...${NC}"
        read -n 1 -s
        exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" monitor "$PROJECT_DIR"
    fi

    # Get list of log files, sorted by modification time (newest first)
    local log_files=()
    while IFS= read -r file; do
        log_files+=("$file")
    done < <(find "$logs_dir" -maxdepth 1 -type f -name "*.log" -print0 | xargs -0 ls -t 2>/dev/null)

    # If no log files found
    if [[ ${#log_files[@]} -eq 0 ]]; then
        clear
        echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}Log Files${NC}                                                ${BOLD}${CYAN}║${NC}"
        echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${DIM}No log files found in ${logs_dir}${NC}"
        echo ""
        echo -e "${DIM}Press any key to return to monitor view...${NC}"
        read -n 1 -s
        exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" monitor "$PROJECT_DIR"
    fi

    # Main navigation loop
    while true; do
        clear

        # Header
        echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}Log Files${NC}  ${DIM}(${#log_files[@]} files)${NC}                              ${BOLD}${CYAN}║${NC}"
        echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${DIM}j/k: navigate  Enter: view  q: back${NC}"
        echo -e "${DIM}Shortcuts: 1=monitor 2=status 3=logs ?=help Tab=cycle r=run s=stop${NC}"
        echo ""

        # List log files
        local index=0
        for file in "${log_files[@]}"; do
            local basename="${file##*/}"
            local size
            size=$(stat -f "%z" "$file" 2>/dev/null || stat -c "%s" "$file" 2>/dev/null || echo 0)
            local size_formatted
            size_formatted=$(format_size "$size")
            local mtime
            mtime=$(format_mtime "$file")

            # Highlight selected file
            if [[ $index -eq $selected_index ]]; then
                echo -e "${YELLOW}▸${NC} ${BOLD}${basename}${NC}"
                echo -e "  ${DIM}${size_formatted}  ${mtime}${NC}"
            else
                echo -e "  ${basename}"
                echo -e "  ${DIM}${size_formatted}  ${mtime}${NC}"
            fi

            (( index++ ))
        done

        # Read user input
        read -rsn1 input

        case "$input" in
            j)
                # Move down
                if (( selected_index < ${#log_files[@]} - 1 )); then
                    (( selected_index++ ))
                fi
                ;;
            k)
                # Move up
                if (( selected_index > 0 )); then
                    (( selected_index-- ))
                fi
                ;;
            "")
                # Enter key - view selected log
                local selected_file="${log_files[$selected_index]}"
                less +G "$selected_file"
                ;;
            q)
                # Return to monitor view
                exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" monitor "$PROJECT_DIR"
                ;;
            /)
                # Check if it's a slash command (read rest of command)
                local cmd=""
                echo -n "/"
                read -r cmd
                if [[ "$cmd" == "monitor" ]]; then
                    exec "$SCRIPT_DIR/ralph-tui-right-panel.sh" monitor "$PROJECT_DIR"
                fi
                ;;
            *)
                # Try keyboard shortcuts
                handle_keyboard_shortcut "$input" || true
                ;;
        esac
    done
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
