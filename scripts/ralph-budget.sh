#!/bin/bash
# Ralph Ultra Budget Planner - Quota-aware execution planning
# Checks available quota and recommends execution strategy
#
# Usage: ./ralph-budget.sh [project_dir] [--budget N]

set -e

MANUAL_BUDGET=""
PROJECT_DIR="."

while [[ $# -gt 0 ]]; do
  case "$1" in
    --budget|-b)
      MANUAL_BUDGET="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [project_dir] [--budget N]"
      echo ""
      echo "Options:"
      echo "  --budget, -b N   Set manual budget in USD"
      echo "  --help, -h       Show this help"
      echo ""
      echo "Examples:"
      echo "  $0 .              # Analyze current directory"
      echo "  $0 . --budget 20  # Plan with \$20 budget"
      exit 0
      ;;
    *)
      if [ -d "$1" ]; then
        PROJECT_DIR="$1"
      fi
      shift
      ;;
  esac
done

PROJECT_DIR="$(cd "$PROJECT_DIR" 2>/dev/null && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m'

AVG_INPUT_TOKENS_PER_STORY=50000
AVG_OUTPUT_TOKENS_PER_STORY=8000

get_input_price() {
  case "$1" in
    opus) echo "15.00" ;;
    sonnet) echo "3.00" ;;
    haiku) echo "0.25" ;;
    gpt4) echo "10.00" ;;
    gpt4o) echo "2.50" ;;
    *) echo "3.00" ;;
  esac
}

get_output_price() {
  case "$1" in
    opus) echo "75.00" ;;
    sonnet) echo "15.00" ;;
    haiku) echo "1.25" ;;
    gpt4) echo "30.00" ;;
    gpt4o) echo "10.00" ;;
    *) echo "15.00" ;;
  esac
}

get_openrouter_balance() {
  local api_key="$1"
  
  if [ -z "$api_key" ]; then
    echo '{"error": "no_key"}'
    return
  fi
  
  local response=$(curl -s -H "Authorization: Bearer $api_key" \
    "https://openrouter.ai/api/v1/credits" 2>/dev/null)
  
  if echo "$response" | jq -e '.data' &>/dev/null; then
    local total=$(echo "$response" | jq -r '.data.total_credits // 0')
    local used=$(echo "$response" | jq -r '.data.total_usage // 0')
    local remaining=$(echo "$total - $used" | bc 2>/dev/null || echo "0")
    echo "{\"provider\":\"openrouter\",\"total\":$total,\"used\":$used,\"remaining\":$remaining}"
  else
    echo '{"error": "api_failed"}'
  fi
}

get_anthropic_limits() {
  # Anthropic doesn't have a direct balance API for prepaid accounts
  # But we can check rate limit headers from a minimal request
  # For now, return tier-based limits
  
  local api_key="$1"
  
  if [ -z "$api_key" ]; then
    echo '{"error": "no_key"}'
    return
  fi
  
  # Make a minimal request to check headers
  local response=$(curl -s -i -X POST "https://api.anthropic.com/v1/messages" \
    -H "x-api-key: $api_key" \
    -H "anthropic-version: 2024-01-01" \
    -H "content-type: application/json" \
    -d '{"model":"claude-3-haiku-20240307","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' 2>/dev/null | head -50)
  
  local rate_limit=$(echo "$response" | grep -i "x-ratelimit-limit" | head -1 | cut -d: -f2 | tr -d ' \r')
  local rate_remaining=$(echo "$response" | grep -i "x-ratelimit-remaining" | head -1 | cut -d: -f2 | tr -d ' \r')
  
  if [ -n "$rate_remaining" ]; then
    echo "{\"provider\":\"anthropic\",\"rate_limit\":$rate_limit,\"rate_remaining\":$rate_remaining,\"type\":\"rate_based\"}"
  else
    echo '{"provider":"anthropic","type":"unknown","note":"Check console.anthropic.com for usage"}'
  fi
}

get_api_key() {
  local provider="$1"
  local auth_file="$HOME/.local/share/opencode/auth.json"
  
  if [ -f "$auth_file" ]; then
    jq -r ".$provider.apiKey // empty" "$auth_file" 2>/dev/null
  fi
}

estimate_story_cost() {
  local model="$1"
  local input_price=$(get_input_price "$model")
  local output_price=$(get_output_price "$model")
  
  local input_cost=$(echo "scale=4; $AVG_INPUT_TOKENS_PER_STORY * $input_price / 1000000" | bc)
  local output_cost=$(echo "scale=4; $AVG_OUTPUT_TOKENS_PER_STORY * $output_price / 1000000" | bc)
  local total=$(echo "scale=4; $input_cost + $output_cost" | bc)
  
  echo "$total"
}

count_remaining_stories() {
  local prd_file="$PROJECT_DIR/prd.json"
  
  if [ -f "$prd_file" ]; then
    jq '[.userStories[] | select(.passes == false)] | length' "$prd_file" 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

count_story_types() {
  local prd_file="$PROJECT_DIR/prd.json"
  
  if [ ! -f "$prd_file" ]; then
    echo '{"simple":0,"medium":0,"complex":0}'
    return
  fi
  
  local stories=$(jq -r '.userStories[] | select(.passes == false) | .id' "$prd_file" 2>/dev/null)
  
  local simple=0
  local medium=0
  local complex=0
  
  while IFS= read -r story; do
    if echo "$story" | grep -qiE "(setup|config|init)"; then
      simple=$((simple + 1))
    elif echo "$story" | grep -qiE "(integration|provider|complex|video)"; then
      complex=$((complex + 1))
    else
      medium=$((medium + 1))
    fi
  done <<< "$stories"
  
  echo "{\"simple\":$simple,\"medium\":$medium,\"complex\":$complex}"
}

recommend_strategy() {
  local budget="$1"
  local remaining_stories="$2"
  local story_types="$3"
  
  local simple=$(echo "$story_types" | jq -r '.simple')
  local medium=$(echo "$story_types" | jq -r '.medium')
  local complex=$(echo "$story_types" | jq -r '.complex')
  
  # Cost estimates per strategy
  local opus_per_story=$(estimate_story_cost "opus")
  local sonnet_per_story=$(estimate_story_cost "sonnet")
  local haiku_per_story=$(estimate_story_cost "haiku")
  
  # Strategy 1: All Opus (highest quality, highest cost)
  local opus_total=$(echo "scale=2; $remaining_stories * $opus_per_story" | bc)
  
  # Strategy 2: Sonnet for most, Opus for complex (balanced)
  local balanced_total=$(echo "scale=2; ($simple + $medium) * $sonnet_per_story + $complex * $opus_per_story" | bc)
  
  # Strategy 3: Haiku for simple, Sonnet for rest (cost-optimized)
  local optimized_total=$(echo "scale=2; $simple * $haiku_per_story + $medium * $sonnet_per_story + $complex * $opus_per_story" | bc)
  
  # Strategy 4: All Sonnet (good balance)
  local sonnet_total=$(echo "scale=2; $remaining_stories * $sonnet_per_story" | bc)
  
  # Strategy 5: Minimal (Haiku where possible)
  local minimal_total=$(echo "scale=2; ($simple + $medium) * $haiku_per_story + $complex * $sonnet_per_story" | bc)
  
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}                    EXECUTION STRATEGIES                     ${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  
  # Determine which strategies are feasible
  local budget_num=$(echo "$budget" | sed 's/[^0-9.]//g')
  if [ -z "$budget_num" ] || [ "$budget_num" = "0" ]; then
    budget_num="9999"  # Unknown budget, show all
  fi
  
  printf "  %-25s %10s %12s\n" "Strategy" "Est. Cost" "Status"
  echo "  ───────────────────────────────────────────────────"
  
  # Strategy 1: Premium
  local s1_status="${RED}Over budget${NC}"
  if (( $(echo "$opus_total <= $budget_num" | bc -l) )); then
    s1_status="${GREEN}✓ Feasible${NC}"
  fi
  printf "  %-25s ${PURPLE}\$%8.2f${NC}   %b\n" "1. Premium (All Opus)" "$opus_total" "$s1_status"
  
  # Strategy 2: Balanced
  local s2_status="${RED}Over budget${NC}"
  if (( $(echo "$balanced_total <= $budget_num" | bc -l) )); then
    s2_status="${GREEN}✓ Feasible${NC}"
  fi
  printf "  %-25s ${BLUE}\$%8.2f${NC}   %b\n" "2. Balanced (Sonnet+Opus)" "$balanced_total" "$s2_status"
  
  # Strategy 3: All Sonnet
  local s3_status="${RED}Over budget${NC}"
  if (( $(echo "$sonnet_total <= $budget_num" | bc -l) )); then
    s3_status="${GREEN}✓ Feasible${NC}"
  fi
  printf "  %-25s ${GREEN}\$%8.2f${NC}   %b\n" "3. Standard (All Sonnet)" "$sonnet_total" "$s3_status"
  
  # Strategy 4: Optimized
  local s4_status="${RED}Over budget${NC}"
  if (( $(echo "$optimized_total <= $budget_num" | bc -l) )); then
    s4_status="${GREEN}✓ Feasible${NC}"
  fi
  printf "  %-25s ${YELLOW}\$%8.2f${NC}   %b\n" "4. Optimized (Haiku+Sonnet)" "$optimized_total" "$s4_status"
  
  # Strategy 5: Minimal
  local s5_status="${RED}Over budget${NC}"
  if (( $(echo "$minimal_total <= $budget_num" | bc -l) )); then
    s5_status="${GREEN}✓ Feasible${NC}"
  fi
  printf "  %-25s ${YELLOW}\$%8.2f${NC}   %b\n" "5. Minimal (Haiku heavy)" "$minimal_total" "$s5_status"
  
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  
  # Recommendation
  echo -e "  ${PURPLE}RECOMMENDATION:${NC}"
  echo ""
  
  if (( $(echo "$budget_num >= $balanced_total" | bc -l) )); then
    echo -e "  → Use ${GREEN}Strategy 2: Balanced${NC}"
    echo "    Sonnet for simple/medium tasks, Opus only for complex"
    echo "    Best quality-to-cost ratio"
  elif (( $(echo "$budget_num >= $sonnet_total" | bc -l) )); then
    echo -e "  → Use ${GREEN}Strategy 3: Standard${NC}"
    echo "    All Sonnet - good quality, reasonable cost"
  elif (( $(echo "$budget_num >= $optimized_total" | bc -l) )); then
    echo -e "  → Use ${YELLOW}Strategy 4: Optimized${NC}"
    echo "    Haiku for simple, Sonnet for medium/complex"
    echo "    May have slight quality reduction on simple tasks"
  elif (( $(echo "$budget_num >= $minimal_total" | bc -l) )); then
    echo -e "  → Use ${YELLOW}Strategy 5: Minimal${NC}"
    echo "    Haiku-heavy approach"
    echo "    ⚠ Quality may suffer, consider phased execution"
  else
    echo -e "  → ${RED}Insufficient budget for full execution${NC}"
    echo ""
    echo "    Options:"
    echo "    1. Wait for quota reset"
    echo "    2. Top up credits"
    echo "    3. Execute in phases (do $((budget_num / minimal_total * remaining_stories)) stories now)"
  fi
  
  echo ""
}

show_model_config() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}                 RECOMMENDED MODEL CONFIG                   ${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "  Add to ~/.config/opencode/oh-my-opencode.json:"
  echo ""
  echo -e "  ${BLUE}For Balanced Strategy (Recommended):${NC}"
  cat << 'EOF'
  {
    "agents": {
      "Sisyphus": { "model": "anthropic/claude-sonnet-4.5" },
      "frontend-ui-ux-engineer": { "model": "anthropic/claude-sonnet-4.5" },
      "document-writer": { "model": "anthropic/claude-sonnet-4.5" },
      "Coder Agent": { "model": "anthropic/claude-sonnet-4.5" },
      "oracle": { "model": "anthropic/claude-opus-4.5" }
    }
  }
EOF
  echo ""
  echo -e "  ${YELLOW}For Optimized Strategy (Budget-conscious):${NC}"
  cat << 'EOF'
  {
    "agents": {
      "Sisyphus": { "model": "anthropic/claude-sonnet-4.5" },
      "frontend-ui-ux-engineer": { "model": "anthropic/claude-sonnet-4.5" },
      "document-writer": { "model": "anthropic/claude-haiku-4.5" },
      "Coder Agent": { "model": "anthropic/claude-sonnet-4.5" },
      "oracle": { "model": "anthropic/claude-sonnet-4.5" },
      "explore": { "model": "anthropic/claude-haiku-4.5" },
      "librarian": { "model": "anthropic/claude-haiku-4.5" }
    }
  }
EOF
  echo ""
}

main() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║              Ralph Budget Planner                         ║${NC}"
  echo -e "${CYAN}║       Quota-aware execution strategy advisor              ║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  # Check project
  if [ ! -f "$PROJECT_DIR/prd.json" ]; then
    echo -e "${RED}ERROR: No prd.json found in $PROJECT_DIR${NC}"
    exit 1
  fi
  
  local remaining=$(count_remaining_stories)
  local story_types=$(count_story_types)
  local simple=$(echo "$story_types" | jq -r '.simple')
  local medium=$(echo "$story_types" | jq -r '.medium')
  local complex=$(echo "$story_types" | jq -r '.complex')
  
  echo -e "  ${BLUE}Project:${NC} $(basename "$PROJECT_DIR")"
  echo -e "  ${BLUE}Remaining Stories:${NC} $remaining"
  echo -e "  ${BLUE}Breakdown:${NC} $simple simple, $medium medium, $complex complex"
  echo ""
  
  # Check quotas
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}                    QUOTA STATUS                            ${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  
  local total_budget="0"
  
  local auth_file="$HOME/.local/share/opencode/auth.json"
  
  if [ -f "$auth_file" ]; then
    local providers=$(jq -r 'keys[]' "$auth_file" 2>/dev/null)
    
    for provider in $providers; do
      local has_auth=$(jq -e ".$provider" "$auth_file" &>/dev/null && echo "yes" || echo "no")
      if [ "$has_auth" = "yes" ]; then
        case "$provider" in
          anthropic)
            echo -e "  ${GREEN}✓ Anthropic:${NC} Authenticated via OpenCode"
            echo -e "    → Check: ${BLUE}https://console.anthropic.com/settings/usage${NC}"
            ;;
          openrouter)
            echo -e "  ${GREEN}✓ OpenRouter:${NC} Authenticated via OpenCode"
            echo -e "    → Check: ${BLUE}https://openrouter.ai/credits${NC}"
            ;;
          openai)
            echo -e "  ${GREEN}✓ OpenAI:${NC} Authenticated via OpenCode"
            echo -e "    → Check: ${BLUE}https://platform.openai.com/usage${NC}"
            ;;
          google)
            echo -e "  ${GREEN}✓ Google:${NC} Authenticated via OpenCode"
            echo -e "    → Check: ${BLUE}https://console.cloud.google.com/billing${NC}"
            ;;
        esac
      fi
    done
  else
    echo -e "  ${YELLOW}⚠ No auth file found${NC}"
  fi
  
  echo ""
  echo -e "  ${YELLOW}Note:${NC} OpenCode uses OAuth authentication."
  echo "  Check the links above for your actual quota/spend limits."
  
  echo ""
  
  if [ -n "$MANUAL_BUDGET" ]; then
    total_budget="$MANUAL_BUDGET"
    echo -e "  ${PURPLE}Budget (manual):${NC} \$$total_budget"
  else
    echo -e "  ${YELLOW}Budget:${NC} Unknown"
    echo -e "         Run with ${CYAN}--budget N${NC} to set manually"
    total_budget="50"
  fi
  
  # Show strategies
  recommend_strategy "$total_budget" "$remaining" "$story_types"
  
  # Show config
  show_model_config
}

main "$@"
