#!/usr/bin/env bash
#
# ralph-tui-left-panel.sh - PRD Progress Display for Left Panel
# Renders project info, story progress, and summary stats
# Supports watch mode to auto-refresh when prd.json changes
#

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Parse arguments
WATCH_MODE=false
if [[ "${1:-}" == "--watch" ]]; then
    WATCH_MODE=true
    shift
fi

# Get project path from argument or environment
PROJECT_PATH="${1:-${RALPH_PROJECT_PATH:-.}}"
PRD_FILE="$PROJECT_PATH/prd.json"
TIMING_FILE="$PROJECT_PATH/.ralph-timing.json"

# Check if prd.json exists
if [[ ! -f "$PRD_FILE" ]]; then
    echo -e "${RED}ERROR: prd.json not found at: $PRD_FILE${NC}"
    exit 1
fi

# Helper functions
truncate_text() {
    local text="$1"
    local max_width="$2"
    if [[ ${#text} -gt $max_width ]]; then
        echo "${text:0:$max_width-3}..."
    else
        echo "$text"
    fi
}

calculate_eta() {
    local total_stories="$1"
    local completed_stories="$2"

    if [[ ! -f "$TIMING_FILE" ]]; then
        echo "N/A"
        return
    fi

    local remaining_stories=$((total_stories - completed_stories))
    if [[ $remaining_stories -le 0 ]]; then
        echo "0m"
        return
    fi

    local total_minutes=0
    local story_ids=$(jq -r '[.userStories[] | select(.passes == false) | .id] | .[] // empty' "$PRD_FILE" 2>/dev/null)

    if [[ -z "$story_ids" ]]; then
        total_minutes=$((remaining_stories * 30))
    else
        for story_id in $story_ids; do
            local complexity=$(jq -r ".userStories[] | select(.id == \"$story_id\") | .complexity // \"medium\"" "$PRD_FILE" 2>/dev/null)
            local avg_time=$(jq -r ".averages.${complexity:-medium} // 30" "$TIMING_FILE" 2>/dev/null)
            total_minutes=$((total_minutes + ${avg_time:-30}))
        done
    fi

    if [[ $total_minutes -lt 60 ]]; then
        echo "${total_minutes}m"
    else
        local hours=$((total_minutes / 60))
        local mins=$((total_minutes % 60))
        echo "${hours}h ${mins}m"
    fi
}

calculate_cost() {
    local completed=$1
    echo "\$$(echo "scale=2; $completed * 0.50" | bc)"
}

# Detect PRD format and extract stories
detect_prd_format() {
    if jq -e '.userStories' "$PRD_FILE" > /dev/null 2>&1; then
        echo "ralph"
    elif jq -e '.features' "$PRD_FILE" > /dev/null 2>&1; then
        echo "features"
    elif jq -e '.implementation_phases' "$PRD_FILE" > /dev/null 2>&1; then
        echo "phases"
    else
        echo "unknown"
    fi
}

# Render panel function
render_panel() {
    # Parse PRD data - support multiple formats
    local project_name=$(jq -r '.project.name // .project // "Unknown"' "$PRD_FILE")
    local branch_name=$(jq -r '.branchName // .project.repository // "main"' "$PRD_FILE")
    local description=$(jq -r '.description // .overview.problem // .project.description // ""' "$PRD_FILE")

    # Detect format and calculate story statistics
    local prd_format=$(detect_prd_format)
    local total_stories=0
    local completed_stories=0
    local in_progress_story="none"

    case "$prd_format" in
        ralph)
            total_stories=$(jq '.userStories | length // 0' "$PRD_FILE")
            completed_stories=$(jq '[.userStories[] | select(.passes == true)] | length // 0' "$PRD_FILE")
            in_progress_story=$(jq -r '[.userStories[] | select(.passes == false)] | .[0].id // "none"' "$PRD_FILE")
            ;;
        features)
            total_stories=$(jq '[.features[].user_stories // [] | .[]] | length // 0' "$PRD_FILE")
            completed_stories=0
            in_progress_story=$(jq -r '.features[0].id // "none"' "$PRD_FILE")
            ;;
        phases)
            total_stories=$(jq '[.implementation_phases[].tasks // [] | .[]] | length // 0' "$PRD_FILE")
            completed_stories=0
            in_progress_story="phase-1"
            ;;
        *)
            total_stories=0
            completed_stories=0
            ;;
    esac

    # Safety check for division
    if [[ $total_stories -eq 0 ]]; then
        total_stories=1
    fi

    # Get panel width (default 40% of 80 cols = 32 cols, but use tput if available)
    local panel_width=${RALPH_TUI_LEFT_WIDTH:-32}
    if command -v tput &> /dev/null; then
        local term_width=$(tput cols 2>/dev/null || echo 80)
        panel_width=$((term_width * 40 / 100))
    fi

    # Calculate stats
    local completion_pct=$((completed_stories * 100 / total_stories))
    local eta=$(calculate_eta "$total_stories" "$completed_stories")
    local cost=$(calculate_cost "$completed_stories")

    local max_text_width=$((panel_width - 4))

    # Clear screen
    clear

    # Header
    echo -e "${BOLD}${BLUE}╔══════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${BLUE}║${NC}  ${BOLD}Ralph Ultra - TUI${NC}                 ${BOLD}${BLUE}║${NC}"
    echo -e "${BOLD}${BLUE}╚══════════════════════════════════════╝${NC}"
    echo ""

    # Project Info
    echo -e "${BOLD}Project:${NC} $(truncate_text "$project_name" "$max_text_width")"
    echo -e "${BOLD}Branch:${NC}  ${GREEN}$branch_name${NC}"
    if [[ -n "$description" ]]; then
        echo -e "${DIM}$(truncate_text "$description" "$max_text_width")${NC}"
    fi
    echo ""

    # Progress Summary
    echo -e "${BOLD}${CYAN}Progress Summary${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  Completed:  ${GREEN}${completed_stories}${NC}/${total_stories} (${completion_pct}%)"
    echo -e "  ETA:        ${YELLOW}${eta}${NC}"
    echo -e "  Cost:       ${MAGENTA}${cost}${NC}"
    echo ""

    # Story List
    echo -e "${BOLD}${CYAN}User Stories${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Render stories based on PRD format
    case "$prd_format" in
        ralph)
            jq -c '.userStories[] // empty' "$PRD_FILE" 2>/dev/null | while IFS= read -r story; do
                id=$(echo "$story" | jq -r '.id // "?"')
                title=$(echo "$story" | jq -r '.title // "Untitled"')
                passes=$(echo "$story" | jq -r '.passes // false')

                if [[ "$passes" == "true" ]]; then
                    icon="✓"; color="$GREEN"; arrow=""
                elif [[ "$id" == "$in_progress_story" ]]; then
                    icon="▸"; color="$YELLOW"; arrow="${YELLOW}→ ${NC}"
                else
                    icon=" "; color="$DIM"; arrow=""
                fi

                display_title=$(truncate_text "$title" "$max_text_width")
                echo -e "${arrow}${color}[${icon}]${NC} ${color}${id}${NC} ${color}${display_title}${NC}"
            done
            ;;
        features)
            jq -c '.features[] // empty' "$PRD_FILE" 2>/dev/null | while IFS= read -r feature; do
                id=$(echo "$feature" | jq -r '.id // "?"')
                name=$(echo "$feature" | jq -r '.name // "Untitled"')
                priority=$(echo "$feature" | jq -r '.priority // "medium"')

                if [[ "$priority" == "critical" ]]; then
                    icon="!"; color="$RED"
                elif [[ "$priority" == "high" ]]; then
                    icon="▸"; color="$YELLOW"
                else
                    icon=" "; color="$DIM"
                fi

                display_name=$(truncate_text "$name" "$max_text_width")
                echo -e "${color}[${icon}]${NC} ${color}${id}${NC} ${color}${display_name}${NC}"
            done
            ;;
        phases)
            jq -c '.implementation_phases[] // empty' "$PRD_FILE" 2>/dev/null | while IFS= read -r phase; do
                phase_num=$(echo "$phase" | jq -r '.phase // "?"')
                name=$(echo "$phase" | jq -r '.name // "Untitled"')
                duration=$(echo "$phase" | jq -r '.duration // "?"')

                display_name=$(truncate_text "$name" "$max_text_width")
                echo -e "${CYAN}[${phase_num}]${NC} ${display_name} ${DIM}(${duration})${NC}"
            done
            ;;
        *)
            echo -e "${DIM}  No stories found in PRD${NC}"
            ;;
    esac

    echo ""
    echo -e "${DIM}Press ? for help, /quit to exit${NC}"
}

# Main execution
if [[ "$WATCH_MODE" == "true" ]]; then
    # Watch mode: continuously render when PRD changes
    LAST_MOD=0
    while true; do
        if [[ -f "$PRD_FILE" ]]; then
            CURRENT_MOD=$(stat -f %m "$PRD_FILE" 2>/dev/null || stat -c %Y "$PRD_FILE" 2>/dev/null || echo 0)
            if [[ "$CURRENT_MOD" != "$LAST_MOD" ]]; then
                render_panel
                LAST_MOD=$CURRENT_MOD
            fi
        fi
        sleep 2
    done
else
    # Single render mode
    render_panel
fi
