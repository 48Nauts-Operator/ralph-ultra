#!/bin/bash
# Ralph Ultra Setup - Install scripts and configure opencode

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCODE_DIR="$HOME/.config/opencode"
INSTALL_DIR="$OPENCODE_DIR/scripts/ralph-ultra"
CONFIG_FILE="$OPENCODE_DIR/oh-my-opencode.json"
BACKUP_SUFFIX=".backup.$(date +%Y%m%d_%H%M%S)"

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

show_banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║           Ralph Ultra - Setup Wizard                 ║${NC}"
  echo -e "${CYAN}║     Autonomous AI Agent with Health Monitoring      ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
}

check_prereqs() {
  local has_errors=false
  
  echo -e "${BLUE}Checking prerequisites...${NC}"
  echo ""
  
  # jq
  if command -v jq &> /dev/null; then
    success "jq installed"
  else
    echo -e "${RED}[MISSING]${NC} jq - Install with: brew install jq (macOS) or apt install jq (Linux)"
    has_errors=true
  fi
  
  # tmux
  if command -v tmux &> /dev/null; then
    success "tmux installed"
  else
    echo -e "${RED}[MISSING]${NC} tmux - Install with: brew install tmux (macOS) or apt install tmux (Linux)"
    has_errors=true
  fi
  
  # opencode
  if command -v opencode &> /dev/null; then
    success "opencode CLI installed"
  else
    echo -e "${RED}[MISSING]${NC} opencode CLI"
    echo -e "         Install from: ${CYAN}https://opencode.ai${NC}"
    has_errors=true
  fi
  
  # oh-my-opencode plugin
  if [ -f "$CONFIG_FILE" ] || [ -d "$OPENCODE_DIR" ]; then
    if [ -f "$CONFIG_FILE" ]; then
      success "oh-my-opencode plugin detected"
    else
      warn "opencode config directory exists but oh-my-opencode.json not found"
      echo -e "         Will create config file during installation"
    fi
  else
    echo -e "${RED}[MISSING]${NC} oh-my-opencode plugin"
    echo -e "         Install from: ${CYAN}https://github.com/code-yeongyu/oh-my-opencode${NC}"
    echo ""
    echo -e "         Quick install:"
    echo -e "         ${YELLOW}git clone https://github.com/code-yeongyu/oh-my-opencode ~/.config/opencode${NC}"
    has_errors=true
  fi
  
  echo ""
  
  if [ "$has_errors" = true ]; then
    error "Please install missing prerequisites and run setup again"
  fi
  
  success "All prerequisites met!"
  echo ""
}

install_scripts() {
  info "Installing Ralph Ultra scripts to $INSTALL_DIR"
  
  mkdir -p "$INSTALL_DIR"
  
  # Copy scripts
  cp "$SCRIPT_DIR/ralph.sh" "$INSTALL_DIR/"
  cp "$SCRIPT_DIR/ralph-monitor.sh" "$INSTALL_DIR/"
  cp "$SCRIPT_DIR/ralph-budget.sh" "$INSTALL_DIR/"
  cp "$SCRIPT_DIR/prompt.md" "$INSTALL_DIR/"
  
  # Make executable
  chmod +x "$INSTALL_DIR"/*.sh
  
  success "Scripts installed to $INSTALL_DIR"
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

show_current_config() {
  echo -e "${BLUE}Current Model Configuration:${NC}"
  echo "─────────────────────────────────────────"
  
  if [ -f "$CONFIG_FILE" ]; then
    jq -r '.agents // {} | to_entries[] | "  \(.key): \(.value.model // "default")"' "$CONFIG_FILE" 2>/dev/null || echo "  (no agents configured)"
  else
    echo -e "  ${YELLOW}No configuration file found${NC}"
  fi
  echo ""
}

show_recommended_config() {
  echo -e "${GREEN}Recommended Configuration:${NC}"
  echo "─────────────────────────────────────────"
  cat << 'EOF'
  Sisyphus (main):         Sonnet 4     (~$3/M tokens)
  oracle:                  Opus 4.5     (~$15/M tokens, used sparingly)
  explore:                 Haiku 3.5    (~$0.25/M tokens)
  librarian:               Haiku 3.5    (~$0.25/M tokens)
  frontend-ui-ux-engineer: Sonnet 4     (~$3/M tokens)
  document-writer:         Sonnet 4     (~$3/M tokens)
EOF
  echo ""
}

show_diff() {
  if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}No existing config - will create new file${NC}"
    echo ""
    echo -e "${BLUE}Agents to be configured:${NC}"
    echo "─────────────────────────────────────────"
    local new_agents="Sisyphus oracle explore librarian frontend-ui-ux-engineer document-writer multimodal-looker"
    for agent in $new_agents; do
      local new_model=$(generate_config | jq -r ".agents.\"$agent\".model")
      echo -e "  ${CYAN}+ $agent${NC}: $new_model"
    done
    echo ""
    return
  fi
  
  echo -e "${BLUE}Changes to model configuration:${NC}"
  echo "─────────────────────────────────────────"
  
  local new_agents="Sisyphus oracle explore librarian frontend-ui-ux-engineer document-writer multimodal-looker"
  local has_conflicts=false
  
  for agent in $new_agents; do
    local current_model=$(jq -r ".agents.\"$agent\".model // \"(not set)\"" "$CONFIG_FILE" 2>/dev/null)
    local new_model=$(generate_config | jq -r ".agents.\"$agent\".model")
    
    if [ "$current_model" = "$new_model" ]; then
      echo -e "  $agent: ${GREEN}$new_model${NC} (already set)"
    elif [ "$current_model" = "(not set)" ]; then
      echo -e "  $agent: ${CYAN}+ $new_model${NC} (will add)"
    else
      echo -e "  $agent: ${YELLOW}$current_model${NC} → ${GREEN}$new_model${NC} (will update)"
      has_conflicts=true
    fi
  done
  
  echo ""
  
  if [ "$has_conflicts" = true ]; then
    echo -e "${YELLOW}WARNING: Some agents already have different models configured.${NC}"
    echo -e "         Merge will update them to Ralph Ultra's recommended models."
    echo -e "         A backup will be created before any changes."
    echo ""
  fi
  
  local existing_agents=$(jq -r '.agents // {} | keys[]' "$CONFIG_FILE" 2>/dev/null)
  local custom_agents=""
  for agent in $existing_agents; do
    case "$agent" in
      Sisyphus|oracle|explore|librarian|frontend-ui-ux-engineer|document-writer|multimodal-looker)
        ;;
      *)
        custom_agents="$custom_agents $agent"
        ;;
    esac
  done
  
  if [ -n "$custom_agents" ]; then
    echo -e "${GREEN}Your custom agents (will be preserved):${NC}"
    for agent in $custom_agents; do
      local model=$(jq -r ".agents.\"$agent\".model // \"default\"" "$CONFIG_FILE" 2>/dev/null)
      echo -e "  $agent: $model"
    done
    echo ""
  fi
}

apply_config() {
  if [ -f "$CONFIG_FILE" ]; then
    info "Backing up existing config to ${CONFIG_FILE}${BACKUP_SUFFIX}"
    cp "$CONFIG_FILE" "${CONFIG_FILE}${BACKUP_SUFFIX}"
  fi
  
  info "Writing model configuration..."
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

show_install_status() {
  echo -e "${BLUE}Installation Status:${NC}"
  echo "─────────────────────────────────────────"
  
  if [ -d "$INSTALL_DIR" ]; then
    echo -e "  Scripts: ${GREEN}Installed${NC} at $INSTALL_DIR"
    ls -1 "$INSTALL_DIR" 2>/dev/null | while read f; do
      echo -e "    - $f"
    done
  else
    echo -e "  Scripts: ${YELLOW}Not installed${NC}"
  fi
  echo ""
  
  if [ -f "$CONFIG_FILE" ]; then
    echo -e "  Config:  ${GREEN}Found${NC} at $CONFIG_FILE"
  else
    echo -e "  Config:  ${YELLOW}Not found${NC}"
  fi
  echo ""
}

interactive_setup() {
  show_banner
  check_prereqs
  
  show_install_status
  show_current_config
  show_recommended_config
  show_diff
  
  echo -e "${YELLOW}Choose an option:${NC}"
  echo "  1) Full install (scripts + config) - Recommended"
  echo "  2) Install scripts only"
  echo "  3) Configure models only (merge with existing)"
  echo "  4) Configure models only (overwrite)"
  echo "  5) Show status only (no changes)"
  echo "  6) Cancel"
  echo ""
  read -p "Enter choice [1-6]: " choice
  
  case "$choice" in
    1)
      install_scripts
      merge_config
      ;;
    2)
      install_scripts
      ;;
    3)
      merge_config
      ;;
    4)
      apply_config
      ;;
    5)
      info "No changes made"
      exit 0
      ;;
    6)
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
  echo -e "${CYAN}Ralph Ultra is now installed globally.${NC}"
  echo ""
  echo -e "Usage:"
  echo -e "  ${YELLOW}$INSTALL_DIR/ralph.sh /path/to/project${NC}"
  echo ""
  echo -e "Or add to your PATH:"
  echo -e "  ${YELLOW}export PATH=\"\$PATH:$INSTALL_DIR\"${NC}"
  echo ""
  echo -e "Then from any project:"
  echo -e "  ${YELLOW}ralph.sh .${NC}"
  echo ""
}

uninstall() {
  echo -e "${YELLOW}Uninstalling Ralph Ultra...${NC}"
  
  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    success "Removed $INSTALL_DIR"
  else
    info "Scripts not installed"
  fi
  
  echo ""
  info "Model configuration in $CONFIG_FILE was NOT removed"
  info "Remove manually if needed"
}

case "${1:-}" in
  --install|-i)
    check_prereqs
    install_scripts
    merge_config
    success "Installation complete!"
    ;;
  --scripts-only)
    check_prereqs
    install_scripts
    ;;
  --config-only)
    check_prereqs
    merge_config
    ;;
  --uninstall|-u)
    uninstall
    ;;
  --status|-s)
    show_banner
    show_install_status
    show_current_config
    ;;
  --diff|-d)
    show_diff
    ;;
  --help|-h)
    echo "Usage: $0 [option]"
    echo ""
    echo "Options:"
    echo "  (none)          Interactive setup wizard"
    echo "  --install       Full install (scripts + config)"
    echo "  --scripts-only  Install scripts only"
    echo "  --config-only   Configure models only"
    echo "  --uninstall     Remove Ralph Ultra scripts"
    echo "  --status        Show installation status"
    echo "  --diff          Show config changes"
    echo "  --help          Show this help"
    echo ""
    echo "Paths:"
    echo "  Scripts: $INSTALL_DIR"
    echo "  Config:  $CONFIG_FILE"
    ;;
  *)
    interactive_setup
    ;;
esac
