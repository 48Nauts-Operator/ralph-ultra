#!/bin/bash
# Ralph Ultra Quota Manager - Cross-platform Claude Pro quota checking
# Supports macOS (Keychain) and Linux (~/.claude/.credentials.json)
# Usage: ralph-quota.sh [--check|--wait|--status]
#
# Features:
#   - Pre-flight quota check before starting runs
#   - Cooldown detection and auto-resume
#   - Cross-platform credential retrieval

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

ANTHROPIC_USAGE_API="https://api.anthropic.com/api/oauth/usage"
COOLDOWN_BUFFER_MINUTES="${RALPH_COOLDOWN_BUFFER:-5}"  # Extra minutes after reset
QUOTA_THRESHOLD="${RALPH_QUOTA_THRESHOLD:-90}"         # Warn at this % usage
QUOTA_CRITICAL="${RALPH_QUOTA_CRITICAL:-98}"           # Pause at this % usage

# State file for tracking cooldowns
STATE_DIR="${HOME}/.ralph-ultra"
COOLDOWN_STATE_FILE="${STATE_DIR}/cooldown-state.json"

# =============================================================================
# COLORS AND LOGGING
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_quota() { echo -e "${MAGENTA}[QUOTA]${NC} $1"; }

# =============================================================================
# PLATFORM DETECTION
# =============================================================================

detect_platform() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    Linux*)  echo "linux" ;;
    *)       echo "unknown" ;;
  esac
}

PLATFORM=$(detect_platform)

# =============================================================================
# CREDENTIAL RETRIEVAL (Cross-Platform)
# =============================================================================

# Get OAuth token from macOS Keychain
get_token_macos() {
  local creds=""
  
  # Try "Claude Code-credentials" first (newer format)
  creds=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null) || true
  
  if [ -z "$creds" ]; then
    # Try older format
    creds=$(security find-generic-password -s "Claude Code" -w 2>/dev/null) || true
  fi
  
  if [ -z "$creds" ]; then
    return 1
  fi
  
  # Parse JSON and extract access token
  echo "$creds" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null
}

# Get OAuth token from Linux credentials file
get_token_linux() {
  local creds_file="${HOME}/.claude/.credentials.json"
  
  if [ ! -f "$creds_file" ]; then
    return 1
  fi
  
  jq -r '.claudeAiOauth.accessToken // empty' "$creds_file" 2>/dev/null
}

# Get OAuth token from environment variable (fallback)
get_token_env() {
  echo "${CLAUDE_CODE_OAUTH_TOKEN:-}"
}

# Main credential retrieval function
get_oauth_token() {
  local token=""
  
  # Priority 1: Environment variable (allows override)
  token=$(get_token_env)
  if [ -n "$token" ]; then
    log_info "Using OAuth token from CLAUDE_CODE_OAUTH_TOKEN env var" >&2
    echo "$token"
    return 0
  fi
  
  # Priority 2: Platform-specific storage
  case "$PLATFORM" in
    macos)
      token=$(get_token_macos)
      if [ -n "$token" ]; then
        log_info "Using OAuth token from macOS Keychain" >&2
        echo "$token"
        return 0
      fi
      ;;
    linux)
      token=$(get_token_linux)
      if [ -n "$token" ]; then
        log_info "Using OAuth token from ~/.claude/.credentials.json" >&2
        echo "$token"
        return 0
      fi
      ;;
  esac
  
  # Priority 3: Try both methods as fallback
  token=$(get_token_macos 2>/dev/null) || token=$(get_token_linux 2>/dev/null) || true
  
  if [ -n "$token" ]; then
    echo "$token"
    return 0
  fi
  
  return 1
}

# =============================================================================
# USAGE API INTEGRATION
# =============================================================================

fetch_usage() {
  local token="$1"
  
  if [ -z "$token" ]; then
    log_error "No OAuth token provided"
    return 1
  fi
  
  local response
  response=$(curl -s -w "\n%{http_code}" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -H "User-Agent: ralph-ultra/1.1.0" \
    -H "Authorization: Bearer ${token}" \
    -H "anthropic-beta: oauth-2025-04-20" \
    "$ANTHROPIC_USAGE_API" 2>/dev/null)
  
  local http_code=$(echo "$response" | tail -1)
  local body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" != "200" ]; then
    log_error "API request failed with HTTP $http_code"
    if [ "$http_code" = "401" ]; then
      log_error "Unauthorized - OAuth token may be expired. Run 'claude /login' to refresh."
    fi
    return 1
  fi
  
  echo "$body"
}

# Parse usage response and extract key values
parse_usage() {
  local usage_json="$1"
  
  local five_hour_util=$(echo "$usage_json" | jq -r '.five_hour.utilization // 0')
  local five_hour_reset=$(echo "$usage_json" | jq -r '.five_hour.resets_at // empty')
  local seven_day_util=$(echo "$usage_json" | jq -r '.seven_day.utilization // 0')
  local seven_day_reset=$(echo "$usage_json" | jq -r '.seven_day.resets_at // empty')
  
  cat << EOF
{
  "five_hour": {
    "utilization": $five_hour_util,
    "resets_at": "$five_hour_reset"
  },
  "seven_day": {
    "utilization": $seven_day_util,
    "resets_at": "$seven_day_reset"
  }
}
EOF
}

# =============================================================================
# COOLDOWN MANAGEMENT
# =============================================================================

init_state_dir() {
  mkdir -p "$STATE_DIR"
}

save_cooldown_state() {
  local reason="$1"
  local reset_time="$2"
  local utilization="$3"
  
  init_state_dir
  
  cat > "$COOLDOWN_STATE_FILE" << EOF
{
  "in_cooldown": true,
  "reason": "$reason",
  "reset_time": "$reset_time",
  "utilization": $utilization,
  "entered_at": "$(date -Iseconds)",
  "platform": "$PLATFORM"
}
EOF
  
  log_warn "Cooldown state saved: $reason"
}

clear_cooldown_state() {
  if [ -f "$COOLDOWN_STATE_FILE" ]; then
    rm -f "$COOLDOWN_STATE_FILE"
    log_ok "Cooldown state cleared"
  fi
}

is_in_cooldown() {
  if [ ! -f "$COOLDOWN_STATE_FILE" ]; then
    return 1
  fi
  
  local in_cooldown=$(jq -r '.in_cooldown // false' "$COOLDOWN_STATE_FILE" 2>/dev/null)
  [ "$in_cooldown" = "true" ]
}

get_cooldown_info() {
  if [ -f "$COOLDOWN_STATE_FILE" ]; then
    cat "$COOLDOWN_STATE_FILE"
  else
    echo '{"in_cooldown": false}'
  fi
}

# Calculate seconds until reset time
seconds_until_reset() {
  local reset_time="$1"
  
  if [ -z "$reset_time" ] || [ "$reset_time" = "null" ]; then
    echo "0"
    return
  fi
  
  local now=$(date +%s)
  local reset_epoch
  
  # Parse ISO 8601 timestamp to epoch
  case "$PLATFORM" in
    macos)
      # macOS date command
      reset_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${reset_time%%.*}" "+%s" 2>/dev/null) || \
      reset_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S%z" "$reset_time" "+%s" 2>/dev/null) || \
      reset_epoch=$now
      ;;
    linux)
      # GNU date command
      reset_epoch=$(date -d "$reset_time" +%s 2>/dev/null) || reset_epoch=$now
      ;;
    *)
      reset_epoch=$now
      ;;
  esac
  
  local diff=$((reset_epoch - now))
  [ "$diff" -lt 0 ] && diff=0
  
  echo "$diff"
}

# Format seconds as human-readable duration
format_duration() {
  local seconds="$1"
  
  if [ "$seconds" -lt 60 ]; then
    echo "${seconds}s"
  elif [ "$seconds" -lt 3600 ]; then
    local mins=$((seconds / 60))
    local secs=$((seconds % 60))
    echo "${mins}m ${secs}s"
  else
    local hours=$((seconds / 3600))
    local mins=$(( (seconds % 3600) / 60 ))
    echo "${hours}h ${mins}m"
  fi
}

# =============================================================================
# QUOTA CHECK LOGIC
# =============================================================================

check_quota() {
  local token
  token=$(get_oauth_token)
  
  if [ -z "$token" ]; then
    log_error "Could not retrieve OAuth token"
    log_info "Ensure you're logged into Claude Code: claude /login"
    log_info "Or set CLAUDE_CODE_OAUTH_TOKEN environment variable"
    return 1
  fi
  
  local usage
  usage=$(fetch_usage "$token")
  
  if [ -z "$usage" ]; then
    log_error "Could not fetch usage data"
    return 1
  fi
  
  local parsed=$(parse_usage "$usage")
  
  local five_hour_util=$(echo "$parsed" | jq -r '.five_hour.utilization')
  local five_hour_reset=$(echo "$parsed" | jq -r '.five_hour.resets_at')
  local seven_day_util=$(echo "$parsed" | jq -r '.seven_day.utilization')
  local seven_day_reset=$(echo "$parsed" | jq -r '.seven_day.resets_at')
  
  # Calculate time until resets
  local five_hour_secs=$(seconds_until_reset "$five_hour_reset")
  local seven_day_secs=$(seconds_until_reset "$seven_day_reset")
  
  # Display status
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║          Claude Pro Quota Status                 ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  
  # 5-hour window
  local five_color="$GREEN"
  [ "${five_hour_util%.*}" -ge "$QUOTA_THRESHOLD" ] && five_color="$YELLOW"
  [ "${five_hour_util%.*}" -ge "$QUOTA_CRITICAL" ] && five_color="$RED"
  
  echo -e "  5-Hour Window:"
  echo -e "    Utilization: ${five_color}${five_hour_util}%${NC}"
  echo -e "    Resets in:   $(format_duration "$five_hour_secs")"
  echo ""
  
  # 7-day window
  local seven_color="$GREEN"
  [ "${seven_day_util%.*}" -ge "$QUOTA_THRESHOLD" ] && seven_color="$YELLOW"
  [ "${seven_day_util%.*}" -ge "$QUOTA_CRITICAL" ] && seven_color="$RED"
  
  echo -e "  7-Day Window:"
  echo -e "    Utilization: ${seven_color}${seven_day_util}%${NC}"
  echo -e "    Resets in:   $(format_duration "$seven_day_secs")"
  echo ""
  
  # Return status based on thresholds
  local five_int=${five_hour_util%.*}
  local seven_int=${seven_day_util%.*}
  
  if [ "$five_int" -ge "$QUOTA_CRITICAL" ]; then
    log_warn "5-hour quota critical (${five_hour_util}% >= ${QUOTA_CRITICAL}%)"
    save_cooldown_state "5-hour quota critical" "$five_hour_reset" "$five_hour_util"
    return 2  # Critical - should wait
  fi
  
  if [ "$seven_int" -ge "$QUOTA_CRITICAL" ]; then
    log_warn "7-day quota critical (${seven_day_util}% >= ${QUOTA_CRITICAL}%)"
    save_cooldown_state "7-day quota critical" "$seven_day_reset" "$seven_day_util"
    return 2  # Critical - should wait
  fi
  
  if [ "$five_int" -ge "$QUOTA_THRESHOLD" ] || [ "$seven_int" -ge "$QUOTA_THRESHOLD" ]; then
    log_warn "Quota usage high - monitor closely"
    return 1  # Warning - can proceed but be careful
  fi
  
  clear_cooldown_state
  log_ok "Quota levels healthy"
  return 0  # All good
}

# =============================================================================
# WAIT FOR COOLDOWN
# =============================================================================

wait_for_cooldown() {
  local token
  token=$(get_oauth_token)
  
  if [ -z "$token" ]; then
    log_error "Could not retrieve OAuth token"
    return 1
  fi
  
  # Check current usage
  local usage
  usage=$(fetch_usage "$token")
  
  if [ -z "$usage" ]; then
    log_error "Could not fetch usage data"
    return 1
  fi
  
  local parsed=$(parse_usage "$usage")
  local five_hour_util=$(echo "$parsed" | jq -r '.five_hour.utilization')
  local five_hour_reset=$(echo "$parsed" | jq -r '.five_hour.resets_at')
  local five_int=${five_hour_util%.*}
  
  if [ "$five_int" -lt "$QUOTA_CRITICAL" ]; then
    log_ok "Quota is below critical threshold (${five_hour_util}% < ${QUOTA_CRITICAL}%)"
    clear_cooldown_state
    return 0
  fi
  
  # Calculate wait time
  local wait_secs=$(seconds_until_reset "$five_hour_reset")
  local buffer_secs=$((COOLDOWN_BUFFER_MINUTES * 60))
  local total_wait=$((wait_secs + buffer_secs))
  
  if [ "$total_wait" -le 0 ]; then
    log_ok "Cooldown period has passed"
    clear_cooldown_state
    return 0
  fi
  
  echo ""
  log_quota "Quota exhausted (${five_hour_util}%)"
  log_quota "Waiting for cooldown: $(format_duration "$total_wait") (includes ${COOLDOWN_BUFFER_MINUTES}m buffer)"
  log_quota "Resume time: $(date -d "@$(($(date +%s) + total_wait))" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -r "$(($(date +%s) + total_wait))" '+%Y-%m-%d %H:%M:%S')"
  echo ""
  
  save_cooldown_state "Waiting for 5-hour reset" "$five_hour_reset" "$five_hour_util"
  
  # Progress bar for wait
  local elapsed=0
  local interval=60  # Update every minute
  
  while [ "$elapsed" -lt "$total_wait" ]; do
    local remaining=$((total_wait - elapsed))
    local pct=$((elapsed * 100 / total_wait))
    
    # Draw progress bar
    local bar_width=40
    local filled=$((pct * bar_width / 100))
    local empty=$((bar_width - filled))
    
    printf "\r  [${GREEN}"
    printf "%${filled}s" | tr ' ' '█'
    printf "${NC}"
    printf "%${empty}s" | tr ' ' '░'
    printf "] %3d%% - %s remaining" "$pct" "$(format_duration "$remaining")"
    
    sleep $interval
    elapsed=$((elapsed + interval))
    
    # Re-check quota periodically
    if [ $((elapsed % 300)) -eq 0 ]; then  # Every 5 minutes
      usage=$(fetch_usage "$token" 2>/dev/null) || continue
      five_hour_util=$(echo "$usage" | jq -r '.five_hour.utilization // 100')
      five_int=${five_hour_util%.*}
      
      if [ "$five_int" -lt "$QUOTA_CRITICAL" ]; then
        echo ""
        log_ok "Quota recovered early! (${five_hour_util}%)"
        clear_cooldown_state
        return 0
      fi
    fi
  done
  
  echo ""
  log_ok "Cooldown complete!"
  clear_cooldown_state
  return 0
}

# =============================================================================
# STATUS DISPLAY
# =============================================================================

show_status() {
  echo ""
  echo -e "${CYAN}Ralph Ultra Quota Manager${NC}"
  echo "=========================="
  echo ""
  echo "Platform: $PLATFORM"
  echo "Threshold: ${QUOTA_THRESHOLD}% (warning)"
  echo "Critical:  ${QUOTA_CRITICAL}% (pause)"
  echo "Buffer:    ${COOLDOWN_BUFFER_MINUTES} minutes"
  echo ""
  
  # Check cooldown state
  if is_in_cooldown; then
    local info=$(get_cooldown_info)
    echo -e "${YELLOW}Currently in cooldown:${NC}"
    echo "  Reason: $(echo "$info" | jq -r '.reason')"
    echo "  Reset:  $(echo "$info" | jq -r '.reset_time')"
    echo "  Since:  $(echo "$info" | jq -r '.entered_at')"
    echo ""
  fi
  
  # Try to get current quota
  local token
  token=$(get_oauth_token 2>/dev/null)
  
  if [ -n "$token" ]; then
    check_quota
  else
    log_warn "Could not retrieve OAuth token"
    echo ""
    echo "To enable quota checking:"
    echo "  1. Run 'claude /login' to authenticate"
    echo "  2. Or set CLAUDE_CODE_OAUTH_TOKEN env var"
    echo ""
  fi
}

# =============================================================================
# PRE-FLIGHT CHECK (for integration with ralph.sh)
# =============================================================================

preflight_check() {
  local force="${1:-false}"
  
  # Check if we're in cooldown
  if is_in_cooldown; then
    local info=$(get_cooldown_info)
    log_warn "Previous cooldown detected"
    
    if [ "$force" != "true" ]; then
      echo ""
      echo "Options:"
      echo "  1. Run: ralph-quota.sh --wait  (wait for cooldown)"
      echo "  2. Run: ralph-quota.sh --clear (clear cooldown state)"
      echo "  3. Set: RALPH_SKIP_QUOTA_CHECK=true (skip check)"
      echo ""
      return 2
    fi
  fi
  
  # Skip if requested
  if [ "${RALPH_SKIP_QUOTA_CHECK:-false}" = "true" ]; then
    log_info "Quota check skipped (RALPH_SKIP_QUOTA_CHECK=true)"
    return 0
  fi
  
  # Perform quota check
  check_quota
  local result=$?
  
  case $result in
    0)
      log_ok "Pre-flight quota check passed"
      return 0
      ;;
    1)
      log_warn "Quota warning - proceeding with caution"
      return 0
      ;;
    2)
      log_error "Quota critical - cannot proceed"
      echo ""
      echo "Run: ralph-quota.sh --wait  (to wait for cooldown)"
      echo "Or:  ralph-quota.sh --force (to proceed anyway)"
      return 2
      ;;
  esac
}

# =============================================================================
# USAGE
# =============================================================================

show_usage() {
  cat << EOF
Ralph Ultra Quota Manager - Cross-platform Claude Pro quota checking

Usage: ralph-quota.sh [command] [options]

Commands:
  --check, -c     Check current quota status (default)
  --wait, -w      Wait for cooldown to complete, then exit
  --status, -s    Show detailed status
  --preflight     Pre-flight check for ralph.sh integration
  --clear         Clear cooldown state
  --help, -h      Show this help

Environment Variables:
  CLAUDE_CODE_OAUTH_TOKEN   Override OAuth token
  RALPH_QUOTA_THRESHOLD     Warning threshold % (default: 90)
  RALPH_QUOTA_CRITICAL      Critical threshold % (default: 98)
  RALPH_COOLDOWN_BUFFER     Extra minutes after reset (default: 5)
  RALPH_SKIP_QUOTA_CHECK    Skip quota checking (true/false)

Examples:
  ralph-quota.sh                    # Check quota status
  ralph-quota.sh --wait             # Wait for cooldown to complete
  ralph-quota.sh --preflight        # Pre-flight check (for scripts)
  RALPH_QUOTA_THRESHOLD=80 ralph-quota.sh  # Custom threshold

Exit Codes:
  0 - OK (quota healthy)
  1 - Warning (quota high but can proceed)
  2 - Critical (quota exhausted, should wait)
  3 - Error (could not check quota)

EOF
}

# =============================================================================
# MAIN
# =============================================================================

main() {
  local cmd="${1:---check}"
  
  case "$cmd" in
    --check|-c)
      check_quota
      ;;
    --wait|-w)
      wait_for_cooldown
      ;;
    --status|-s)
      show_status
      ;;
    --preflight)
      preflight_check "${2:-false}"
      ;;
    --force)
      preflight_check "true"
      ;;
    --clear)
      clear_cooldown_state
      ;;
    --help|-h)
      show_usage
      ;;
    *)
      log_error "Unknown command: $cmd"
      show_usage
      exit 1
      ;;
  esac
}

main "$@"
