#!/usr/bin/env bash
#
# ralph-resources.sh - System resource checker for Ralph Ultra
# Checks CPU, RAM, and running sessions before starting new agents
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

CPU_WARN_THRESHOLD="${RALPH_CPU_WARN:-70}"
RAM_MIN_GB="${RALPH_RAM_MIN:-2}"

get_cpu_usage() {
    case "$(uname -s)" in
        Darwin*)
            top -l 1 -n 0 2>/dev/null | grep "CPU usage" | awk '{print int($3)}' || echo "0"
            ;;
        Linux*)
            top -bn1 2>/dev/null | grep "Cpu(s)" | awk '{print int($2)}' || echo "0"
            ;;
        *)
            echo "0"
            ;;
    esac
}

get_ram_available_gb() {
    case "$(uname -s)" in
        Darwin*)
            local page_size pages_free pages_inactive pages_speculative
            page_size=$(vm_stat 2>/dev/null | head -1 | grep -o '[0-9]*' || echo "16384")
            pages_free=$(vm_stat 2>/dev/null | grep "Pages free" | awk '{print $3}' | tr -d '.')
            pages_inactive=$(vm_stat 2>/dev/null | grep "Pages inactive" | awk '{print $3}' | tr -d '.')
            pages_speculative=$(vm_stat 2>/dev/null | grep "Pages speculative" | awk '{print $3}' | tr -d '.')
            local total_pages=$(( ${pages_free:-0} + ${pages_inactive:-0} + ${pages_speculative:-0} ))
            echo "scale=1; $total_pages * $page_size / 1024 / 1024 / 1024" | bc 2>/dev/null || echo "0"
            ;;
        Linux*)
            free -g 2>/dev/null | awk '/^Mem:/ {print $7}' || echo "0"
            ;;
        *)
            echo "0"
            ;;
    esac
}

get_ram_total_gb() {
    case "$(uname -s)" in
        Darwin*)
            sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.0f", $1/1024/1024/1024}' || echo "0"
            ;;
        Linux*)
            free -g 2>/dev/null | awk '/^Mem:/ {print $2}' || echo "0"
            ;;
        *)
            echo "0"
            ;;
    esac
}

get_cpu_cores() {
    case "$(uname -s)" in
        Darwin*)
            sysctl -n hw.ncpu 2>/dev/null || echo "1"
            ;;
        Linux*)
            nproc 2>/dev/null || echo "1"
            ;;
        *)
            echo "1"
            ;;
    esac
}

get_running_ralph_sessions() {
    tmux list-sessions 2>/dev/null | grep -c "^ralph-" || echo "0"
}

get_running_ralph_details() {
    tmux list-sessions 2>/dev/null | grep "^ralph-" | cut -d: -f1 || true
}

check_resources() {
    local cpu_usage ram_available ram_total cpu_cores ralph_sessions
    local warnings=0
    local can_proceed=true
    
    cpu_usage=$(get_cpu_usage)
    ram_available=$(get_ram_available_gb)
    ram_total=$(get_ram_total_gb)
    cpu_cores=$(get_cpu_cores)
    ralph_sessions=$(get_running_ralph_sessions)
    
    echo -e "${BOLD}${CYAN}System Resources${NC}"
    echo -e "${DIM}────────────────────────────────${NC}"
    
    # CPU check
    if [[ "$cpu_usage" -gt "$CPU_WARN_THRESHOLD" ]]; then
        echo -e "  CPU:    ${RED}${cpu_usage}%${NC} used ${YELLOW}(>${CPU_WARN_THRESHOLD}% threshold)${NC}"
        warnings=$((warnings + 1))
    else
        echo -e "  CPU:    ${GREEN}${cpu_usage}%${NC} used (${cpu_cores} cores)"
    fi
    
    # RAM check
    local ram_available_int=${ram_available%.*}
    ram_available_int=${ram_available_int:-0}
    if [[ "$ram_available_int" -lt "$RAM_MIN_GB" ]]; then
        echo -e "  RAM:    ${RED}${ram_available}GB${NC} free ${YELLOW}(<${RAM_MIN_GB}GB minimum)${NC}"
        warnings=$((warnings + 1))
        can_proceed=false
    else
        echo -e "  RAM:    ${GREEN}${ram_available}GB${NC} free (${ram_total}GB total)"
    fi
    
    # Running sessions
    if [[ "$ralph_sessions" -gt 0 ]]; then
        echo -e "  Ralph:  ${YELLOW}${ralph_sessions}${NC} session(s) running"
        local sessions
        sessions=$(get_running_ralph_details)
        for s in $sessions; do
            echo -e "          ${DIM}└─ $s${NC}"
        done
    else
        echo -e "  Ralph:  ${GREEN}0${NC} sessions running"
    fi
    
    echo ""
    
    # Summary
    if [[ "$warnings" -gt 0 ]]; then
        if [[ "$can_proceed" == "false" ]]; then
            echo -e "${RED}${BOLD}⚠ Insufficient resources${NC}"
            echo -e "${DIM}Starting another Ralph session may cause system instability.${NC}"
            return 1
        else
            echo -e "${YELLOW}${BOLD}⚠ Resources are limited${NC}"
            echo -e "${DIM}System is under load. Proceed with caution.${NC}"
            return 2
        fi
    else
        echo -e "${GREEN}${BOLD}✓ Resources OK${NC}"
        return 0
    fi
}

show_status() {
    check_resources
}

case "${1:-}" in
    --status|-s)
        show_status
        ;;
    --check|-c)
        check_resources
        exit_code=$?
        if [[ $exit_code -eq 1 ]]; then
            exit 1
        fi
        exit 0
        ;;
    --json)
        cpu_usage=$(get_cpu_usage)
        ram_available=$(get_ram_available_gb)
        ram_total=$(get_ram_total_gb)
        cpu_cores=$(get_cpu_cores)
        ralph_sessions=$(get_running_ralph_sessions)
        cat <<EOF
{
  "cpu_usage": $cpu_usage,
  "cpu_cores": $cpu_cores,
  "ram_available_gb": $ram_available,
  "ram_total_gb": $ram_total,
  "ralph_sessions": $ralph_sessions,
  "cpu_threshold": $CPU_WARN_THRESHOLD,
  "ram_min_gb": $RAM_MIN_GB
}
EOF
        ;;
    --help|-h)
        cat <<EOF
ralph-resources.sh - Check system resources before starting Ralph

Usage:
    ralph-resources.sh [--status|--check|--json|--help]

Options:
    --status, -s    Show resource status (default)
    --check, -c     Check and exit with code: 0=OK, 1=critical, 2=warning
    --json          Output as JSON
    --help, -h      Show this help

Environment:
    RALPH_CPU_WARN  CPU warning threshold % (default: 70)
    RALPH_RAM_MIN   Minimum free RAM in GB (default: 2)

EOF
        ;;
    *)
        show_status
        ;;
esac
