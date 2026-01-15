#!/bin/bash
# Ralph Ultra Setup - Configure opencode for cost-optimized autonomous execution

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

CONFIG_FILE="$HOME/.config/opencode/oh-my-opencode.json"
BACKUP_SUFFIX=".backup.$(date +%Y%m%d_%H%M%S)"

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

show_banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║           Ralph Ultra - Setup Wizard                 ║${NC}"
  echo -e "${CYAN}║     Cost-optimized autonomous agent configuration   ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
}

check_prereqs() {
  if ! command -v jq &> /dev/null; then
    error "jq is required. Install with: brew install jq (macOS) or apt install jq (Linux)"
  fi
  
  if ! command -v opencode &> /dev/null; then
    warn "opencode CLI not found. Install from: https://opencode.ai"
  fi
}

show_current_config() {
  echo -e "${BLUE}Current Configuration:${NC}"
  echo "─────────────────────────────────────────"
  
  if [ -f "$CONFIG_FILE" ]; then
    echo -e "File: ${CYAN}$CONFIG_FILE${NC}"
    echo ""
    if command -v jq &> /dev/null; then
      jq -r '.agents // {} | to_entries[] | "  \(.key): \(.value.model // "default")"' "$CONFIG_FILE" 2>/dev/null || echo "  (no agents configured)"
    else
      cat "$CONFIG_FILE"
    fi
  else
    echo -e "  ${YELLOW}No configuration file found${NC}"
  fi
  echo ""
}

show_recommended_config() {
  echo -e "${GREEN}Recommended Ralph Ultra Configuration:${NC}"
  echo "─────────────────────────────────────────"
  cat << 'EOF'
  Sisyphus (main):        claude-sonnet-4      (~$3/M tokens)
  oracle:                 claude-opus-4.5      (~$15/M tokens)
  explore:                claude-3.5-haiku     (~$0.25/M tokens)
  librarian:              claude-3.5-haiku     (~$0.25/M tokens)
  frontend-ui-ux-engineer: claude-sonnet-4     (~$3/M tokens)
  document-writer:        claude-sonnet-4      (~$3/M tokens)
  multimodal-looker:      claude-sonnet-4      (~$3/M tokens)

Cost Optimization Strategy:
  - Main agent uses Sonnet (good balance of cost/quality)
  - Oracle uses Opus (expensive, but used sparingly for complex reasoning)
  - Explore/Librarian use Haiku (cheap, fast for searches)
EOF
  echo ""
}

generate_config() {
  cat << 'EOF'
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
  "agents": {
    "Sisyphus": {
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    "oracle": {
      "model": "anthropic/claude-opus-4-5"
    },
    "explore": {
      "model": "anthropic/claude-3-5-haiku-20241022"
    },
    "librarian": {
      "model": "anthropic/claude-3-5-haiku-20241022"
    },
    "frontend-ui-ux-engineer": {
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    "document-writer": {
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    "multimodal-looker": {
      "model": "anthropic/claude-sonnet-4-20250514"
    }
  }
}
EOF
}

apply_config() {
  local config_dir=$(dirname "$CONFIG_FILE")
  
  if [ ! -d "$config_dir" ]; then
    info "Creating config directory: $config_dir"
    mkdir -p "$config_dir"
  fi
  
  if [ -f "$CONFIG_FILE" ]; then
    info "Backing up existing config to ${CONFIG_FILE}${BACKUP_SUFFIX}"
    cp "$CONFIG_FILE" "${CONFIG_FILE}${BACKUP_SUFFIX}"
  fi
  
  info "Writing new configuration..."
  generate_config > "$CONFIG_FILE"
  success "Configuration applied to $CONFIG_FILE"
}

merge_config() {
  if [ ! -f "$CONFIG_FILE" ]; then
    apply_config
    return
  fi
  
  info "Merging with existing configuration..."
  
  local backup="${CONFIG_FILE}${BACKUP_SUFFIX}"
  cp "$CONFIG_FILE" "$backup"
  info "Backup saved to $backup"
  
  local new_config=$(generate_config)
  local merged=$(jq -s '.[0] * .[1]' "$CONFIG_FILE" <(echo "$new_config"))
  
  echo "$merged" > "$CONFIG_FILE"
  success "Configuration merged successfully"
}

show_diff() {
  if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}No existing config to compare${NC}"
    return
  fi
  
  echo -e "${BLUE}Changes that will be applied:${NC}"
  echo "─────────────────────────────────────────"
  
  local current_agents=$(jq -r '.agents // {} | keys[]' "$CONFIG_FILE" 2>/dev/null | sort)
  local new_agents="Sisyphus oracle explore librarian frontend-ui-ux-engineer document-writer multimodal-looker"
  
  for agent in $new_agents; do
    local current_model=$(jq -r ".agents.\"$agent\".model // \"(not set)\"" "$CONFIG_FILE" 2>/dev/null)
    local new_model=$(generate_config | jq -r ".agents.\"$agent\".model")
    
    if [ "$current_model" = "$new_model" ]; then
      echo -e "  $agent: ${GREEN}$new_model${NC} (unchanged)"
    elif [ "$current_model" = "(not set)" ]; then
      echo -e "  $agent: ${CYAN}+ $new_model${NC} (new)"
    else
      echo -e "  $agent: ${RED}$current_model${NC} → ${GREEN}$new_model${NC}"
    fi
  done
  echo ""
}

interactive_setup() {
  show_banner
  check_prereqs
  
  echo ""
  show_current_config
  show_recommended_config
  show_diff
  
  echo -e "${YELLOW}Choose an option:${NC}"
  echo "  1) Apply recommended config (overwrites existing)"
  echo "  2) Merge with existing config (preserves custom settings)"
  echo "  3) Show config only (no changes)"
  echo "  4) Cancel"
  echo ""
  read -p "Enter choice [1-4]: " choice
  
  case "$choice" in
    1)
      apply_config
      ;;
    2)
      merge_config
      ;;
    3)
      echo ""
      echo -e "${BLUE}Recommended config (copy to $CONFIG_FILE):${NC}"
      echo "─────────────────────────────────────────"
      generate_config
      ;;
    4)
      info "Cancelled"
      exit 0
      ;;
    *)
      error "Invalid choice"
      ;;
  esac
  
  echo ""
  success "Setup complete!"
  echo ""
  echo -e "${CYAN}Next steps:${NC}"
  echo "  1. Create a prd.json for your project (use the 'prd' skill)"
  echo "  2. Run: ./scripts/ralph-budget.sh . --budget YOUR_BUDGET"
  echo "  3. Run: ./scripts/ralph.sh . [max_iterations]"
  echo ""
}

case "${1:-}" in
  --apply|-a)
    check_prereqs
    apply_config
    ;;
  --merge|-m)
    check_prereqs
    merge_config
    ;;
  --show|-s)
    generate_config
    ;;
  --diff|-d)
    check_prereqs
    show_diff
    ;;
  --help|-h)
    echo "Usage: $0 [option]"
    echo ""
    echo "Options:"
    echo "  (none)      Interactive setup wizard"
    echo "  --apply     Apply recommended config (overwrites)"
    echo "  --merge     Merge with existing config"
    echo "  --show      Print recommended config to stdout"
    echo "  --diff      Show what would change"
    echo "  --help      Show this help"
    echo ""
    echo "Config file: $CONFIG_FILE"
    ;;
  *)
    interactive_setup
    ;;
esac
