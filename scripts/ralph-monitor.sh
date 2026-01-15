#!/bin/bash
# Ralph Ultra Monitor - Health monitoring, auto-restart, cost tracking
# Works on: macOS and Linux (Ubuntu)
# Usage: ralph-monitor.sh <project_dir> [check_interval_minutes]
#
# Examples:
#   ralph-monitor.sh /path/to/project       # Specific project, 5 min interval
#   ralph-monitor.sh /path/to/project 10    # Specific project, 10 min interval

set -e

# =============================================================================
# EARLY FLAG HANDLING (before directory resolution)
# =============================================================================

handle_early_flags() {
  case "${1:-}" in
    --help|-h)
      echo "Usage: $0 <project_dir> [check_interval_minutes]"
      echo "       $0 --status <project_dir>"
      echo "       $0 --report <project_dir>"
      echo ""
      echo "Arguments:"
      echo "  project_dir    Path to project (REQUIRED)"
      echo ""
      echo "Options:"
      echo "  --status, -s   Show current status without starting monitor"
      echo "  --report, -r   Generate HTML report from collected data"
      echo "  --help, -h     Show this help"
      echo ""
      echo "Environment Variables:"
      echo "  NTFY_ENABLED   Enable NTFY push notifications (true/false)"
      echo "  NTFY_SERVER    NTFY server URL (e.g., https://ntfy.sh)"
      echo "  NTFY_TOPIC     NTFY topic name"
      echo "  WEBHOOK_URL    Webhook URL for Slack/Discord/generic"
      echo "  WEBHOOK_TYPE   Webhook type: slack, discord, or generic"
      echo ""
      echo "Examples:"
      echo "  $0 /path/to/project       # Monitor project, 5 min interval"
      echo "  $0 /path/to/project 10    # Monitor project, 10 min interval"
      echo "  $0 --status /path/to/project"
      echo "  $0 --report /path/to/project"
      exit 0
      ;;
    --status|-s|--report|-r)
      return 1
      ;;
  esac
  return 0
}

if ! handle_early_flags "$1"; then
  PROJECT_DIR="${2:-}"
  EARLY_FLAG="$1"
else
  PROJECT_DIR="${1:-}"
  EARLY_FLAG=""
fi

if [ -z "$PROJECT_DIR" ]; then
  echo "ERROR: Project directory is required."
  echo "Usage: $0 <project_dir> [check_interval_minutes]"
  exit 1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

CHECK_INTERVAL="${2:-5}"

# NTFY Push Notifications (optional)
NTFY_SERVER="${NTFY_SERVER:-}"
NTFY_TOPIC="${NTFY_TOPIC:-}"
NTFY_ENABLED="${NTFY_ENABLED:-false}"

PROJECT_DIR="$(cd "$PROJECT_DIR" 2>/dev/null && pwd)" || {
  echo "ERROR: Cannot access directory: $PROJECT_DIR"
  exit 1
}

if [[ "$PROJECT_DIR" == *".config/opencode"* ]]; then
  echo "ERROR: Cannot run Ralph Ultra Monitor in the global config directory."
  echo "       Please specify a project directory."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/ralph-monitor.log"
TIMING_FILE="$PROJECT_DIR/.ralph-timing.json"
STATE_FILE="$PROJECT_DIR/.ralph-monitor-state.json"
EVENTS_FILE="$PROJECT_DIR/.ralph-events.json"
REPORT_FILE="$PROJECT_DIR/ralph-report.html"
RALPH_SCRIPT="$SCRIPT_DIR/ralph.sh"
RALPH_ITERATIONS=50

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
# CROSS-PLATFORM UTILITIES
# =============================================================================

get_file_mod_time() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "0"
    return
  fi
  
  case "$PLATFORM" in
    macos) stat -f %m "$file" 2>/dev/null || echo "0" ;;
    linux) stat -c %Y "$file" 2>/dev/null || echo "0" ;;
    *)     echo "0" ;;
  esac
}

get_file_age_minutes() {
  local file="$1"
  local mod_time=$(get_file_mod_time "$file")
  local now=$(date +%s)
  
  if [ "$mod_time" -eq 0 ]; then
    echo "9999"
  else
    echo $(( (now - mod_time) / 60 ))
  fi
}

send_notification() {
  local title="$1"
  local message="$2"
  
  case "$PLATFORM" in
    macos)
      osascript -e "display notification \"$message\" with title \"$title\"" 2>/dev/null || true
      ;;
    linux)
      notify-send "$title" "$message" 2>/dev/null || true
      ;;
  esac
}

get_process_cpu() {
  local pid="$1"
  if [ -z "$pid" ]; then
    echo "0"
    return
  fi
  
  case "$PLATFORM" in
    macos) ps -p "$pid" -o %cpu= 2>/dev/null | tr -d ' ' || echo "0" ;;
    linux) ps -p "$pid" -o pcpu --no-headers 2>/dev/null | tr -d ' ' || echo "0" ;;
  esac
}

find_recent_files() {
  local dir="$1"
  local minutes="$2"
  
  case "$PLATFORM" in
    macos) find "$dir" -type f -mmin -"$minutes" 2>/dev/null | wc -l | tr -d ' ' ;;
    linux) find "$dir" -type f -mmin -"$minutes" 2>/dev/null | wc -l ;;
  esac
}

# =============================================================================
# COLORS AND LOGGING
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() {
  local level="$1"
  local message="$2"
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local color=""
  
  case "$level" in
    INFO)  color="$BLUE" ;;
    OK)    color="$GREEN" ;;
    WARN)  color="$YELLOW" ;;
    ERROR) color="$RED" ;;
    *)     color="$NC" ;;
  esac
  
  echo -e "${color}[$timestamp] [$level]${NC} $message" | tee -a "$LOG_FILE"
}

notify() {
  local message="$1"
  send_notification "Ralph Monitor" "$message"
  log "NOTIFY" "$message"
}

# =============================================================================
# NTFY PUSH NOTIFICATIONS
# =============================================================================

ntfy_configured() {
  [ "$NTFY_ENABLED" = "true" ] && [ -n "$NTFY_SERVER" ] && [ -n "$NTFY_TOPIC" ]
}

ntfy_send() {
  local message="$1"
  local title="${2:-Ralph Monitor}"
  local priority="${3:-default}"
  local tags="${4:-robot}"
  
  if ! ntfy_configured; then
    return 0
  fi
  
  curl -s \
    -H "Title: $title" \
    -H "Priority: $priority" \
    -H "Tags: $tags" \
    -d "$message" \
    "$NTFY_SERVER/$NTFY_TOPIC" >/dev/null 2>&1 || true
}

ntfy_send_status() {
  local story="$1"
  local health="$2"
  local progress="$3"
  local age="$4"
  local max="$5"
  local cpu="$6"
  
  if ! ntfy_configured; then
    return 0
  fi
  
  local message="[$health] $story
Progress: $progress
Time: ${age}m / ${max}m max
CPU: ${cpu}%"
  
  ntfy_send "$message" "Ralph Status" "low" "chart_with_upwards_trend"
}

ntfy_send_alert() {
  local alert_type="$1"
  local message="$2"
  
  if ! ntfy_configured; then
    return 0
  fi
  
  local priority="default"
  local tags="warning"
  
  case "$alert_type" in
    complete)
      priority="high"
      tags="white_check_mark,tada"
      ;;
    restart)
      priority="high"
      tags="rotating_light,warning"
      ;;
    error)
      priority="urgent"
      tags="x,skull"
      ;;
    stuck)
      priority="high"
      tags="hourglass,snail"
      ;;
  esac
  
  ntfy_send "$message" "Ralph Alert: $alert_type" "$priority" "$tags"
}

validate_ntfy() {
  if [ "$NTFY_ENABLED" = "true" ]; then
    if [ -z "$NTFY_SERVER" ] || [ -z "$NTFY_TOPIC" ]; then
      log "WARN" "NTFY enabled but server/topic not configured"
      log "WARN" "Set NTFY_SERVER and NTFY_TOPIC, or set NTFY_ENABLED=false"
      return 1
    fi
    
    if ! command -v curl &>/dev/null; then
      log "WARN" "NTFY enabled but curl not installed - notifications disabled"
      NTFY_ENABLED="false"
      return 1
    fi
    
    log "INFO" "NTFY notifications: $NTFY_SERVER/$NTFY_TOPIC"
  else
    log "INFO" "NTFY notifications: disabled"
  fi
  return 0
}

# =============================================================================
# EVENT TRACKING & HTML REPORT
# =============================================================================

init_events_file() {
  if [ ! -f "$EVENTS_FILE" ]; then
    cat > "$EVENTS_FILE" << 'EOF'
{
  "started": "",
  "project": "",
  "platform": "",
  "events": [],
  "stories_completed": [],
  "restarts": [],
  "total_restarts": 0,
  "final_status": "running"
}
EOF
  fi
}

record_event() {
  local event_type="$1"
  local message="$2"
  local story="${3:-}"
  local timestamp=$(date -Iseconds)
  
  if [ ! -f "$EVENTS_FILE" ]; then
    init_events_file
  fi
  
  local tmp=$(mktemp)
  jq --arg t "$timestamp" --arg type "$event_type" --arg msg "$message" --arg story "$story" \
    '.events += [{"timestamp": $t, "type": $type, "message": $msg, "story": $story}]' \
    "$EVENTS_FILE" > "$tmp" && mv "$tmp" "$EVENTS_FILE"
}

record_story_completed() {
  local story="$1"
  local duration="$2"
  local estimate="$3"
  local timestamp=$(date -Iseconds)
  
  local tmp=$(mktemp)
  jq --arg t "$timestamp" --arg s "$story" --argjson d "$duration" --argjson e "$estimate" \
    '.stories_completed += [{"timestamp": $t, "story": $s, "duration": $d, "estimate": $e}]' \
    "$EVENTS_FILE" > "$tmp" && mv "$tmp" "$EVENTS_FILE"
}

record_restart() {
  local reason="$1"
  local story="$2"
  local timestamp=$(date -Iseconds)
  
  local tmp=$(mktemp)
  jq --arg t "$timestamp" --arg r "$reason" --arg s "$story" \
    '.restarts += [{"timestamp": $t, "reason": $r, "story": $s}] | .total_restarts += 1' \
    "$EVENTS_FILE" > "$tmp" && mv "$tmp" "$EVENTS_FILE"
}

set_run_metadata() {
  local tmp=$(mktemp)
  jq --arg started "$(date -Iseconds)" --arg project "$(basename "$PROJECT_DIR")" --arg platform "$PLATFORM" \
    '.started = $started | .project = $project | .platform = $platform' \
    "$EVENTS_FILE" > "$tmp" && mv "$tmp" "$EVENTS_FILE"
}

set_final_status() {
  local status="$1"
  local tmp=$(mktemp)
  jq --arg s "$status" --arg ended "$(date -Iseconds)" \
    '.final_status = $s | .ended = $ended' \
    "$EVENTS_FILE" > "$tmp" && mv "$tmp" "$EVENTS_FILE"
}

generate_html_report() {
  local events_data=$(cat "$EVENTS_FILE")
  local project=$(echo "$events_data" | jq -r '.project')
  local started=$(echo "$events_data" | jq -r '.started')
  local ended=$(echo "$events_data" | jq -r '.ended // "running"')
  local platform=$(echo "$events_data" | jq -r '.platform')
  local final_status=$(echo "$events_data" | jq -r '.final_status')
  local total_restarts=$(echo "$events_data" | jq -r '.total_restarts')
  local stories_count=$(echo "$events_data" | jq '.stories_completed | length')
  
  local total_duration=0
  local total_estimate=0
  local total_files_changed=0
  local total_lines_added=0
  local total_lines_removed=0
  local total_cost=0
  local total_input_tokens=0
  local total_output_tokens=0
  
  if [ "$stories_count" -gt 0 ]; then
    total_duration=$(echo "$events_data" | jq '[.stories_completed[].duration] | add // 0')
    total_estimate=$(echo "$events_data" | jq '[.stories_completed[].estimate] | add // 0')
    total_files_changed=$(echo "$events_data" | jq '[.stories_completed[].git.files_changed // 0] | add // 0')
    total_lines_added=$(echo "$events_data" | jq '[.stories_completed[].git.lines_added // 0] | add // 0')
    total_lines_removed=$(echo "$events_data" | jq '[.stories_completed[].git.lines_removed // 0] | add // 0')
    total_cost=$(echo "$events_data" | jq '[.stories_completed[].cost.total // 0] | add // 0')
    total_input_tokens=$(echo "$events_data" | jq '[.stories_completed[].cost.input_tokens // 0] | add // 0')
    total_output_tokens=$(echo "$events_data" | jq '[.stories_completed[].cost.output_tokens // 0] | add // 0')
  fi
  
  init_timing_file
  local eta_info=$(calculate_eta_with_confidence)
  local eta=$(echo "$eta_info" | jq -r '.eta' 2>/dev/null)
  local eta_confidence=$(echo "$eta_info" | jq -r '.confidence' 2>/dev/null)
  local eta_mins=$(echo "$eta_info" | jq -r '.eta_minutes' 2>/dev/null)
  local eta_completion=$(get_eta_completion_time "${eta_mins:-0}")
  
  local status_color="green"
  local status_icon="✓"
  case "$final_status" in
    complete) status_color="#22c55e"; status_icon="✓" ;;
    running)  status_color="#3b82f6"; status_icon="⟳" ;;
    failed)   status_color="#ef4444"; status_icon="✗" ;;
    *)        status_color="#6b7280"; status_icon="?" ;;
  esac

  cat > "$REPORT_FILE" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ralph Report - $project</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e2e8f0;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { 
      font-size: 2.5rem; 
      margin-bottom: 0.5rem;
      background: linear-gradient(90deg, #60a5fa, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 1rem;
      padding: 1.5rem;
      backdrop-filter: blur(10px);
    }
    .card-title { font-size: 0.875rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card-value { font-size: 2rem; font-weight: 700; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-weight: 600;
      background: ${status_color}22;
      color: ${status_color};
      border: 1px solid ${status_color}44;
    }
    .section { margin-bottom: 2rem; }
    .section-title { font-size: 1.25rem; margin-bottom: 1rem; color: #f1f5f9; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
    th { color: #94a3b8; font-weight: 500; font-size: 0.875rem; text-transform: uppercase; }
    tr:hover { background: rgba(255,255,255,0.03); }
    .event-type {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .event-complete { background: #22c55e22; color: #22c55e; }
    .event-restart { background: #f59e0b22; color: #f59e0b; }
    .event-error { background: #ef444422; color: #ef4444; }
    .event-start { background: #3b82f622; color: #3b82f6; }
    .event-info { background: #6b728022; color: #94a3b8; }
    .progress-bar {
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 0.5rem;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #22c55e, #3b82f6);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .duration-comparison {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .faster { color: #22c55e; }
    .slower { color: #f59e0b; }
    .timestamp { color: #64748b; font-size: 0.875rem; }
    .empty-state { text-align: center; padding: 3rem; color: #64748b; }
    footer { margin-top: 3rem; text-align: center; color: #64748b; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Ralph Report</h1>
      <p class="subtitle">$project on $platform</p>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Status</div>
        <div class="status-badge">
          <span>${status_icon}</span>
          <span>${final_status}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Stories Completed</div>
        <div class="card-value">$stories_count / $(get_story_count)</div>
      </div>
      <div class="card">
        <div class="card-title">Total Time</div>
        <div class="card-value">$(format_duration "$total_duration")</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: $([ "$total_estimate" -gt 0 ] && echo "$((total_duration * 100 / total_estimate))" || echo "0")%"></div>
        </div>
        <div style="font-size: 0.875rem; color: #64748b; margin-top: 0.25rem;">vs $(format_duration "$total_estimate") estimated</div>
      </div>
      <div class="card">
        <div class="card-title">ETA</div>
        <div class="card-value" style="color: #60a5fa">$eta</div>
        <div style="font-size: 0.875rem; color: #64748b; margin-top: 0.25rem;">~$eta_completion ($eta_confidence)</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Files Changed</div>
        <div class="card-value">$total_files_changed</div>
      </div>
      <div class="card">
        <div class="card-title">Lines Added</div>
        <div class="card-value" style="color: #22c55e">+$total_lines_added</div>
      </div>
      <div class="card">
        <div class="card-title">Lines Removed</div>
        <div class="card-value" style="color: #ef4444">-$total_lines_removed</div>
      </div>
      <div class="card">
        <div class="card-title">Restarts</div>
        <div class="card-value" style="color: $([ "$total_restarts" -gt 0 ] && echo "#f59e0b" || echo "#22c55e")">$total_restarts</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Total Cost</div>
        <div class="card-value" style="color: #a78bfa">$(format_cost "$total_cost")</div>
      </div>
      <div class="card">
        <div class="card-title">Input Tokens</div>
        <div class="card-value">$(format_tokens "$total_input_tokens")</div>
      </div>
      <div class="card">
        <div class="card-title">Output Tokens</div>
        <div class="card-value">$(format_tokens "$total_output_tokens")</div>
      </div>
      <div class="card">
        <div class="card-title">Total Tokens</div>
        <div class="card-value">$(format_tokens "$((total_input_tokens + total_output_tokens))")</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Stories Completed</h2>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Story</th>
              <th>Duration</th>
              <th>Estimate</th>
              <th>Diff</th>
              <th>Files</th>
              <th>Lines</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
EOF

  echo "$events_data" | jq -r '.stories_completed[] | "\(.story)|\(.duration)|\(.estimate)|\(.git.files_changed // 0)|\(.git.lines_added // 0)|\(.git.lines_removed // 0)|\(.timestamp)"' 2>/dev/null | while IFS='|' read -r story duration estimate files_changed lines_added lines_removed timestamp; do
    local diff=$((duration - estimate))
    local diff_class="faster"
    local diff_text="${diff}m"
    if [ "$diff" -gt 0 ]; then
      diff_class="slower"
      diff_text="+${diff}m"
    elif [ "$diff" -lt 0 ]; then
      diff_text="${diff}m"
    else
      diff_class=""
      diff_text="exact"
    fi
    
    cat >> "$REPORT_FILE" << EOF
            <tr>
              <td><strong>$story</strong></td>
              <td>${duration}m</td>
              <td>${estimate}m</td>
              <td class="$diff_class">$diff_text</td>
              <td>${files_changed:-0}</td>
              <td><span class="faster">+${lines_added:-0}</span>/<span class="slower">-${lines_removed:-0}</span></td>
              <td class="timestamp">$timestamp</td>
            </tr>
EOF
  done

  if [ "$stories_count" -eq 0 ]; then
    echo '            <tr><td colspan="7" class="empty-state">No stories completed yet</td></tr>' >> "$REPORT_FILE"
  fi

  cat >> "$REPORT_FILE" << 'EOF'
          </tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Restarts</h2>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Reason</th>
              <th>Story</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
EOF

  echo "$events_data" | jq -r '.restarts[] | "\(.reason)|\(.story)|\(.timestamp)"' 2>/dev/null | while IFS='|' read -r reason story timestamp; do
    cat >> "$REPORT_FILE" << EOF
            <tr>
              <td>$reason</td>
              <td>$story</td>
              <td class="timestamp">$timestamp</td>
            </tr>
EOF
  done

  if [ "$total_restarts" -eq 0 ]; then
    echo '            <tr><td colspan="3" class="empty-state">No restarts - clean run!</td></tr>' >> "$REPORT_FILE"
  fi

  cat >> "$REPORT_FILE" << 'EOF'
          </tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Event Timeline</h2>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Message</th>
              <th>Story</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
EOF

  echo "$events_data" | jq -r '.events[] | "\(.type)|\(.message)|\(.story)|\(.timestamp)"' 2>/dev/null | tail -50 | while IFS='|' read -r type message story timestamp; do
    local type_class="event-info"
    case "$type" in
      complete|story_complete) type_class="event-complete" ;;
      restart) type_class="event-restart" ;;
      error|dead) type_class="event-error" ;;
      start|started) type_class="event-start" ;;
    esac
    
    cat >> "$REPORT_FILE" << EOF
            <tr>
              <td><span class="event-type $type_class">$type</span></td>
              <td>$message</td>
              <td>$story</td>
              <td class="timestamp">$timestamp</td>
            </tr>
EOF
  done

  cat >> "$REPORT_FILE" << EOF
          </tbody>
        </table>
      </div>
    </div>

    <footer>
      <p>Generated by Ralph Monitor on $(date '+%Y-%m-%d %H:%M:%S')</p>
      <p>Started: $started | Ended: $ended</p>
    </footer>
  </div>
</body>
</html>
EOF

  log "OK" "HTML report generated: $REPORT_FILE"
}

# =============================================================================
# GIT DIFF SUMMARY
# =============================================================================

get_git_status() {
  if [ ! -d "$PROJECT_DIR/.git" ]; then
    echo "not_a_repo"
    return
  fi
  
  cd "$PROJECT_DIR" || return
  
  local modified=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
  local staged=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
  local untracked=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
  
  echo "{\"modified\":$modified,\"staged\":$staged,\"untracked\":$untracked}"
}

get_files_changed_since() {
  local since_commit="$1"
  
  if [ ! -d "$PROJECT_DIR/.git" ]; then
    echo "[]"
    return
  fi
  
  cd "$PROJECT_DIR" || return
  
  if [ -z "$since_commit" ]; then
    git diff --name-only HEAD~1 2>/dev/null | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo "[]"
  else
    git diff --name-only "$since_commit" 2>/dev/null | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo "[]"
  fi
}

get_recent_commits() {
  local count="${1:-5}"
  
  if [ ! -d "$PROJECT_DIR/.git" ]; then
    echo "[]"
    return
  fi
  
  cd "$PROJECT_DIR" || return
  
  git log --oneline -n "$count" 2>/dev/null | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo "[]"
}

get_current_commit() {
  if [ ! -d "$PROJECT_DIR/.git" ]; then
    echo ""
    return
  fi
  
  cd "$PROJECT_DIR" || return
  git rev-parse --short HEAD 2>/dev/null || echo ""
}

record_story_git_diff() {
  local story="$1"
  local start_commit="$2"
  
  if [ ! -d "$PROJECT_DIR/.git" ]; then
    return
  fi
  
  cd "$PROJECT_DIR" || return
  
  local end_commit=$(get_current_commit)
  local files_changed="[]"
  local lines_added=0
  local lines_removed=0
  
  if [ -n "$start_commit" ] && [ -n "$end_commit" ]; then
    files_changed=$(git diff --name-only "$start_commit" "$end_commit" 2>/dev/null | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo "[]")
    local diff_stats=$(git diff --shortstat "$start_commit" "$end_commit" 2>/dev/null)
    lines_added=$(echo "$diff_stats" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
    lines_removed=$(echo "$diff_stats" | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")
  fi
  
  local file_count=$(echo "$files_changed" | jq 'length' 2>/dev/null || echo "0")
  
  if [ -f "$EVENTS_FILE" ]; then
    local tmp=$(mktemp)
    jq --arg s "$story" --arg sc "$start_commit" --arg ec "$end_commit" \
       --argjson fc "$file_count" --argjson la "${lines_added:-0}" --argjson lr "${lines_removed:-0}" \
       --argjson files "$files_changed" \
       '.stories_completed |= map(if .story == $s then . + {
         "git": {
           "start_commit": $sc,
           "end_commit": $ec,
           "files_changed": $fc,
           "lines_added": $la,
           "lines_removed": $lr,
           "files": $files
         }
       } else . end)' "$EVENTS_FILE" > "$tmp" && mv "$tmp" "$EVENTS_FILE"
  fi
  
  log "INFO" "Git diff for $story: $file_count files, +${lines_added:-0}/-${lines_removed:-0} lines"
}

# =============================================================================
# RESOURCE MONITOR
# =============================================================================

get_disk_usage() {
  local path="${1:-$PROJECT_DIR}"
  
  case "$PLATFORM" in
    macos) df -h "$path" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%' ;;
    linux) df -h "$path" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%' ;;
    *) echo "0" ;;
  esac
}

get_available_disk_gb() {
  local path="${1:-$PROJECT_DIR}"
  
  case "$PLATFORM" in
    macos) df -g "$path" 2>/dev/null | tail -1 | awk '{print $4}' ;;
    linux) df -BG "$path" 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G' ;;
    *) echo "0" ;;
  esac
}

get_memory_usage() {
  case "$PLATFORM" in
    macos)
      local pages_free=$(vm_stat 2>/dev/null | grep "Pages free" | awk '{print $3}' | tr -d '.')
      local pages_inactive=$(vm_stat 2>/dev/null | grep "Pages inactive" | awk '{print $3}' | tr -d '.')
      local page_size=4096
      local free_mb=$(( (pages_free + pages_inactive) * page_size / 1024 / 1024 ))
      echo "$free_mb"
      ;;
    linux)
      free -m 2>/dev/null | grep Mem | awk '{print $7}'
      ;;
    *) echo "0" ;;
  esac
}

check_resources() {
  local disk_pct=$(get_disk_usage)
  local disk_avail=$(get_available_disk_gb)
  local mem_free=$(get_memory_usage)
  local warnings=""
  
  if [ "${disk_pct:-0}" -gt 90 ]; then
    warnings="DISK_CRITICAL:${disk_pct}%"
    log "ERROR" "CRITICAL: Disk usage at ${disk_pct}%!"
    record_event "resource_alert" "Disk usage critical: ${disk_pct}%" ""
    ntfy_send_alert "error" "CRITICAL: Disk usage at ${disk_pct}%"
  elif [ "${disk_pct:-0}" -gt 80 ]; then
    warnings="DISK_WARNING:${disk_pct}%"
    log "WARN" "Disk usage high: ${disk_pct}%"
  fi
  
  if [ "${disk_avail:-999}" -lt 5 ]; then
    warnings="${warnings:+$warnings,}DISK_LOW:${disk_avail}GB"
    log "WARN" "Low disk space: ${disk_avail}GB available"
    record_event "resource_alert" "Low disk space: ${disk_avail}GB" ""
  fi
  
  if [ "${mem_free:-9999}" -lt 500 ]; then
    warnings="${warnings:+$warnings,}MEM_LOW:${mem_free}MB"
    log "WARN" "Low memory: ${mem_free}MB available"
    record_event "resource_alert" "Low memory: ${mem_free}MB" ""
  fi
  
  echo "$warnings"
}

# =============================================================================
# WEBHOOK SUPPORT
# =============================================================================

WEBHOOK_URL="${WEBHOOK_URL:-}"
WEBHOOK_TYPE="${WEBHOOK_TYPE:-generic}"

webhook_send() {
  local message="$1"
  local title="${2:-Ralph Monitor}"
  local level="${3:-info}"
  
  if [ -z "$WEBHOOK_URL" ]; then
    return 0
  fi
  
  local payload=""
  local content_type="application/json"
  
  case "$WEBHOOK_TYPE" in
    slack)
      local color="#36a64f"
      [ "$level" = "warning" ] && color="#ff9800"
      [ "$level" = "error" ] && color="#f44336"
      
      payload=$(jq -n --arg title "$title" --arg msg "$message" --arg color "$color" '{
        "attachments": [{
          "color": $color,
          "title": $title,
          "text": $msg,
          "footer": "Ralph Monitor"
        }]
      }')
      ;;
    discord)
      local color=3066993
      [ "$level" = "warning" ] && color=16744448
      [ "$level" = "error" ] && color=15158332
      
      payload=$(jq -n --arg title "$title" --arg msg "$message" --argjson color "$color" '{
        "embeds": [{
          "title": $title,
          "description": $msg,
          "color": $color
        }]
      }')
      ;;
    *)
      payload=$(jq -n --arg title "$title" --arg msg "$message" --arg level "$level" '{
        "title": $title,
        "message": $msg,
        "level": $level,
        "timestamp": (now | todate)
      }')
      ;;
  esac
  
  curl -s -X POST \
    -H "Content-Type: $content_type" \
    -d "$payload" \
    "$WEBHOOK_URL" >/dev/null 2>&1 || true
}

webhook_story_complete() {
  local story="$1"
  local duration="$2"
  local progress="$3"
  
  webhook_send "Story *$story* completed in ${duration}m\nProgress: $progress" "Story Complete" "info"
}

webhook_restart() {
  local story="$1"
  local reason="$2"
  
  webhook_send "Restarting on *$story*\nReason: $reason" "Ralph Restart" "warning"
}

webhook_complete() {
  local total="$1"
  local total_time="$2"
  
  webhook_send "All $total stories complete!\nTotal time: $total_time" "Ralph Complete!" "info"
}

# =============================================================================
# COST TRACKING (from opencode session data)
# =============================================================================

OPENCODE_MESSAGE_DIR="${HOME}/.local/share/opencode/storage/message"

get_session_cost() {
  local session_id="$1"
  
  if [ ! -d "$OPENCODE_MESSAGE_DIR/$session_id" ]; then
    echo '{"cost":0,"tokens":{"input":0,"output":0}}'
    return
  fi
  
  local total_cost=0
  local total_input=0
  local total_output=0
  
  for msg_file in "$OPENCODE_MESSAGE_DIR/$session_id"/*.json; do
    if [ -f "$msg_file" ]; then
      local cost=$(jq -r '.cost // 0' "$msg_file" 2>/dev/null)
      local input=$(jq -r '.tokens.input // 0' "$msg_file" 2>/dev/null)
      local output=$(jq -r '.tokens.output // 0' "$msg_file" 2>/dev/null)
      
      total_cost=$(echo "$total_cost + ${cost:-0}" | bc 2>/dev/null || echo "$total_cost")
      total_input=$((total_input + ${input:-0}))
      total_output=$((total_output + ${output:-0}))
    fi
  done
  
  echo "{\"cost\":$total_cost,\"tokens\":{\"input\":$total_input,\"output\":$total_output}}"
}

get_current_session_id() {
  local project_hash=$(echo -n "$PROJECT_DIR" | shasum | cut -d' ' -f1)
  local session_dir="${HOME}/.local/share/opencode/storage/session/$project_hash"
  
  if [ -d "$session_dir" ]; then
    ls -t "$session_dir"/*.json 2>/dev/null | head -1 | xargs -I{} jq -r '.id' {} 2>/dev/null
  else
    echo ""
  fi
}

get_all_sessions_cost() {
  local project_hash=$(echo -n "$PROJECT_DIR" | shasum | cut -d' ' -f1)
  local session_dir="${HOME}/.local/share/opencode/storage/session/$project_hash"
  
  local total_cost=0
  local total_input=0
  local total_output=0
  
  if [ -d "$session_dir" ]; then
    for session_file in "$session_dir"/*.json; do
      if [ -f "$session_file" ]; then
        local session_id=$(jq -r '.id' "$session_file" 2>/dev/null)
        if [ -n "$session_id" ] && [ -d "$OPENCODE_MESSAGE_DIR/$session_id" ]; then
          local session_data=$(get_session_cost "$session_id")
          local cost=$(echo "$session_data" | jq -r '.cost' 2>/dev/null)
          local input=$(echo "$session_data" | jq -r '.tokens.input' 2>/dev/null)
          local output=$(echo "$session_data" | jq -r '.tokens.output' 2>/dev/null)
          
          total_cost=$(echo "$total_cost + ${cost:-0}" | bc 2>/dev/null || echo "$total_cost")
          total_input=$((total_input + ${input:-0}))
          total_output=$((total_output + ${output:-0}))
        fi
      fi
    done
  fi
  
  echo "{\"cost\":$total_cost,\"tokens\":{\"input\":$total_input,\"output\":$total_output}}"
}

format_tokens() {
  local tokens="$1"
  
  if [ "$tokens" -ge 1000000 ]; then
    echo "$(echo "scale=1; $tokens / 1000000" | bc)M"
  elif [ "$tokens" -ge 1000 ]; then
    echo "$(echo "scale=1; $tokens / 1000" | bc)K"
  else
    echo "$tokens"
  fi
}

format_cost() {
  local cost="$1"
  
  if [ -z "$cost" ] || [ "$cost" = "0" ]; then
    echo "\$0.00"
  else
    printf "\$%.2f" "$cost"
  fi
}

record_story_cost() {
  local story="$1"
  local session_id="$2"
  
  if [ -z "$session_id" ]; then
    return
  fi
  
  local cost_data=$(get_session_cost "$session_id")
  local cost=$(echo "$cost_data" | jq -r '.cost' 2>/dev/null)
  local input=$(echo "$cost_data" | jq -r '.tokens.input' 2>/dev/null)
  local output=$(echo "$cost_data" | jq -r '.tokens.output' 2>/dev/null)
  
  if [ -f "$EVENTS_FILE" ]; then
    local tmp=$(mktemp)
    jq --arg s "$story" --argjson c "${cost:-0}" --argjson i "${input:-0}" --argjson o "${output:-0}" \
       '.stories_completed |= map(if .story == $s then . + {
         "cost": {"total": $c, "input_tokens": $i, "output_tokens": $o}
       } else . end)' "$EVENTS_FILE" > "$tmp" && mv "$tmp" "$EVENTS_FILE"
  fi
  
  log "INFO" "Cost for $story: $(format_cost "$cost") ($(format_tokens "$input") in, $(format_tokens "$output") out)"
}

# =============================================================================
# FAILURE ANALYSIS
# =============================================================================

FAILURE_LOG_DIR="$PROJECT_DIR/.ralph-failures"

capture_failure_context() {
  local story="$1"
  local reason="$2"
  local timestamp=$(date +%Y%m%d_%H%M%S)
  
  mkdir -p "$FAILURE_LOG_DIR"
  
  local failure_file="$FAILURE_LOG_DIR/failure_${story}_${timestamp}.txt"
  
  {
    echo "=== Ralph Failure Context ==="
    echo "Story: $story"
    echo "Reason: $reason"
    echo "Timestamp: $(date -Iseconds)"
    echo "Health: $(get_health_status)"
    echo ""
    echo "=== Last 100 lines from tmux ==="
    tmux capture-pane -t ralph -p -S -100 2>/dev/null || echo "(Could not capture tmux pane)"
    echo ""
    echo "=== Resource Status ==="
    echo "Disk: $(get_disk_usage)% used, $(get_available_disk_gb)GB free"
    echo "Memory: $(get_memory_usage)MB free"
    echo ""
    echo "=== Git Status ==="
    cd "$PROJECT_DIR" && git status --short 2>/dev/null || echo "(Not a git repo)"
    echo ""
    echo "=== Last Progress Entry ==="
    get_last_progress_entry
    echo ""
    echo "=== Process Info ==="
    local pid=$(get_ai_pid)
    if [ -n "$pid" ]; then
      echo "AI PID: $pid"
      ps -p "$pid" -o pid,ppid,%cpu,%mem,state,time,command 2>/dev/null || true
    else
      echo "No AI process found"
    fi
  } > "$failure_file"
  
  if [ -f "$EVENTS_FILE" ]; then
    local tmp=$(mktemp)
    jq --arg story "$story" --arg reason "$reason" --arg file "$failure_file" \
       '.restarts |= map(if .story == $story then . + {"failure_log": $file} else . end)' \
       "$EVENTS_FILE" > "$tmp" && mv "$tmp" "$EVENTS_FILE"
  fi
  
  log "INFO" "Failure context captured: $failure_file"
  
  ls -t "$FAILURE_LOG_DIR"/failure_*.txt 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null || true
}

# =============================================================================
# VALIDATION
# =============================================================================

validate_project() {
  local errors=0
  
  if [ ! -f "$PROJECT_DIR/prd.json" ]; then
    log "ERROR" "prd.json not found in $PROJECT_DIR"
    errors=$((errors + 1))
  fi
  
  if [ ! -f "$RALPH_SCRIPT" ]; then
    log "WARN" "ralph.sh not found at $RALPH_SCRIPT"
    log "WARN" "Looking for alternative locations..."
    
    if [ -f "$PROJECT_DIR/ralph.sh" ]; then
      RALPH_SCRIPT="$PROJECT_DIR/ralph.sh"
      log "OK" "Found ralph.sh at $RALPH_SCRIPT"
    elif [ -f "$SCRIPT_DIR/ralph.sh" ]; then
      RALPH_SCRIPT="$SCRIPT_DIR/ralph.sh"
      log "OK" "Found ralph.sh at $RALPH_SCRIPT"
    else
      log "ERROR" "Cannot find ralph.sh"
      errors=$((errors + 1))
    fi
  fi
  
  if [ ! -f "$PROJECT_DIR/scripts/prompt.md" ] && [ ! -f "$SCRIPT_DIR/prompt.md" ]; then
    log "ERROR" "prompt.md not found"
    errors=$((errors + 1))
  fi
  
  if ! command -v jq &>/dev/null; then
    log "ERROR" "jq is required but not installed"
    errors=$((errors + 1))
  fi
  
  if ! command -v tmux &>/dev/null; then
    log "ERROR" "tmux is required but not installed"
    errors=$((errors + 1))
  fi
  
  return $errors
}

validate_prd_structure() {
  if [ ! -f "$PROJECT_DIR/prd.json" ]; then
    return 1
  fi
  
  if ! jq -e '.userStories' "$PROJECT_DIR/prd.json" &>/dev/null; then
    log "ERROR" "prd.json missing 'userStories' array"
    return 1
  fi
  
  local total=$(jq '.userStories | length' "$PROJECT_DIR/prd.json" 2>/dev/null)
  if [ -z "$total" ] || [ "$total" -eq 0 ]; then
    log "ERROR" "prd.json has no user stories"
    return 1
  fi
  
  return 0
}

# =============================================================================
# AI PROCESS DETECTION
# =============================================================================

get_ai_pid() {
  local pid=""
  
  # Try claude first (preferred CLI) - process shows as just "claude"
  pid=$(pgrep -x "claude" 2>/dev/null | head -1)
  [ -n "$pid" ] && echo "$pid" && return
  
  # Try opencode (both run and prompt variants)
  pid=$(pgrep -f "opencode run" 2>/dev/null | head -1)
  [ -n "$pid" ] && echo "$pid" && return
  
  pid=$(pgrep -f "opencode --prompt" 2>/dev/null | head -1)
  [ -n "$pid" ] && echo "$pid" && return
  
  # Try amp
  pid=$(pgrep -f "amp.*dangerously" 2>/dev/null | head -1)
  [ -n "$pid" ] && echo "$pid" && return
  
  echo ""
}

get_ai_cli_name() {
  local pid=$(get_ai_pid)
  [ -z "$pid" ] && echo "none" && return
  
  local cmdline=""
  case "$PLATFORM" in
    macos) cmdline=$(ps -p "$pid" -o command= 2>/dev/null) ;;
    linux) cmdline=$(cat /proc/$pid/cmdline 2>/dev/null | tr '\0' ' ') ;;
  esac
  
  if echo "$cmdline" | grep -q "opencode"; then
    echo "opencode"
  elif echo "$cmdline" | grep -q "amp"; then
    echo "amp"
  elif echo "$cmdline" | grep -q "claude"; then
    echo "claude"
  else
    echo "unknown"
  fi
}

get_ai_cpu() {
  local pid=$(get_ai_pid)
  get_process_cpu "$pid"
}

# =============================================================================
# PROGRESS TRACKING
# =============================================================================

get_story_count() {
  if [ -f "$PROJECT_DIR/prd.json" ]; then
    jq '.userStories | length' "$PROJECT_DIR/prd.json" 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

get_completed_count() {
  if [ -f "$PROJECT_DIR/prd.json" ]; then
    jq '[.userStories[] | select(.passes == true)] | length' "$PROJECT_DIR/prd.json" 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

get_current_story() {
  if [ -f "$PROJECT_DIR/prd.json" ]; then
    jq -r '.userStories | sort_by(.priority) | .[] | select(.passes == false) | .id' "$PROJECT_DIR/prd.json" 2>/dev/null | head -1
  else
    echo "unknown"
  fi
}

get_current_story_title() {
  local story_id="$1"
  if [ -f "$PROJECT_DIR/prd.json" ] && [ -n "$story_id" ]; then
    jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .title' "$PROJECT_DIR/prd.json" 2>/dev/null
  else
    echo ""
  fi
}

get_progress_summary() {
  local total=$(get_story_count)
  local done=$(get_completed_count)
  local remaining=$((total - done))
  local percent=0
  
  if [ "$total" -gt 0 ]; then
    percent=$((done * 100 / total))
  fi
  
  echo "$done/$total ($percent%) - $remaining remaining"
}

check_all_complete() {
  local total=$(get_story_count)
  local done=$(get_completed_count)
  
  [ "$total" -gt 0 ] && [ "$done" -eq "$total" ]
}

# =============================================================================
# PROGRESS FILE VALIDATION
# =============================================================================

validate_progress_file() {
  local progress_file="$PROJECT_DIR/progress.txt"
  
  if [ ! -f "$progress_file" ]; then
    log "WARN" "progress.txt not found, will be created on first run"
    return 0
  fi
  
  # Check if it has the header
  if ! head -1 "$progress_file" | grep -q "# Ralph Progress Log"; then
    log "WARN" "progress.txt missing header"
  fi
  
  # Check for Codebase Patterns section
  if ! grep -q "## Codebase Patterns" "$progress_file"; then
    log "WARN" "progress.txt missing Codebase Patterns section"
  fi
  
  # Count completed entries
  local entry_count=$(grep -c "^## \[" "$progress_file" 2>/dev/null || echo "0")
  local prd_done=$(get_completed_count)
  
  log "INFO" "Progress file has $entry_count entries, PRD shows $prd_done completed"
  
  return 0
}

get_last_progress_entry() {
  local progress_file="$PROJECT_DIR/progress.txt"
  
  if [ -f "$progress_file" ]; then
    grep "^## \[" "$progress_file" | tail -1 | sed 's/## \[.*\] - //'
  else
    echo "none"
  fi
}

# =============================================================================
# STATE MANAGEMENT
# =============================================================================

save_state() {
  local current_story="$1"
  local story_start="$2"
  local restart_count="$3"
  
  cat > "$STATE_FILE" << EOF
{
  "current_story": "$current_story",
  "story_start_time": $story_start,
  "restart_count": $restart_count,
  "last_check": $(date +%s),
  "platform": "$PLATFORM"
}
EOF
}

load_state() {
  if [ -f "$STATE_FILE" ]; then
    cat "$STATE_FILE"
  else
    echo '{"current_story":"","story_start_time":0,"restart_count":0}'
  fi
}

get_state_value() {
  local key="$1"
  local state=$(load_state)
  echo "$state" | jq -r ".$key // empty" 2>/dev/null
}

# =============================================================================
# TIMING AND LEARNING
# =============================================================================

init_timing_file() {
  if [ ! -f "$TIMING_FILE" ]; then
    echo '{"stories":{},"averages":{"simple":20,"medium":30,"complex":45,"heavy":60}}' > "$TIMING_FILE"
  fi
}

record_completion() {
  local story="$1"
  local duration="$2"
  
  init_timing_file
  
  local base_estimate=$(get_base_timeout "$story")
  local delta=$((duration - base_estimate))
  local delta_pct=0
  
  if [ "$base_estimate" -gt 0 ]; then
    delta_pct=$((delta * 100 / base_estimate))
  fi
  
  local tmp=$(mktemp)
  jq --arg s "$story" --argjson d "$duration" --argjson e "$base_estimate" \
    '.stories[$s] = {actual: $d, estimate: $e}' "$TIMING_FILE" > "$tmp" && mv "$tmp" "$TIMING_FILE"
  
  if [ "$delta" -lt 0 ]; then
    log "OK" "Learned: $story done in ${duration}m (estimate: ${base_estimate}m, ${delta_pct}% faster)"
  elif [ "$delta" -gt 0 ]; then
    log "OK" "Learned: $story done in ${duration}m (estimate: ${base_estimate}m, +${delta_pct}% slower)"
  else
    log "OK" "Learned: $story done in ${duration}m (estimate: ${base_estimate}m, exact match)"
  fi
}

get_learned_timeout() {
  local story="$1"
  
  if [ -f "$TIMING_FILE" ]; then
    local learned=$(jq -r --arg s "$story" '.stories[$s].actual // .stories[$s] // empty' "$TIMING_FILE" 2>/dev/null)
    if [ -n "$learned" ] && [ "$learned" != "null" ] && [ "$learned" != "" ]; then
      echo $(( learned + 15 ))
      return
    fi
  fi
  echo ""
}

get_base_timeout() {
  local story="$1"
  
  # Heavy: complex integrations, multi-file changes - 60 min
  if echo "$story" | grep -qiE "(integration|provider|complex|video)"; then
    echo 60; return
  fi
  
  # Complex: full tools, platform modules - 45 min  
  if echo "$story" | grep -qiE "(platform|tool|analyze|design)"; then
    echo 45; return
  fi
  
  # Medium: utilities, individual tools - 30 min
  if echo "$story" | grep -qiE "(util|core|app)"; then
    echo 30; return
  fi
  
  # Simple: setup, config - 20 min
  echo 20
}

get_story_timeout() {
  local story="$1"
  local learned=$(get_learned_timeout "$story")
  
  if [ -n "$learned" ]; then
    echo "$learned"
  else
    get_base_timeout "$story"
  fi
}

# =============================================================================
# ETA CALCULATOR
# =============================================================================

calculate_eta() {
  local total=$(get_story_count)
  local done=$(get_completed_count)
  local remaining=$((total - done))
  
  if [ "$remaining" -eq 0 ]; then
    echo "Complete!"
    return
  fi
  
  local avg_duration=0
  local completed_stories=0
  
  if [ -f "$TIMING_FILE" ]; then
    local sum=$(jq '[.stories[].actual] | add // 0' "$TIMING_FILE" 2>/dev/null)
    completed_stories=$(jq '.stories | length' "$TIMING_FILE" 2>/dev/null)
    
    if [ "$completed_stories" -gt 0 ] && [ "$sum" -gt 0 ]; then
      avg_duration=$((sum / completed_stories))
    fi
  fi
  
  if [ "$avg_duration" -eq 0 ]; then
    avg_duration=30
  fi
  
  local eta_minutes=$((remaining * avg_duration))
  format_duration "$eta_minutes"
}

calculate_eta_with_confidence() {
  local total=$(get_story_count)
  local done=$(get_completed_count)
  local remaining=$((total - done))
  
  if [ "$remaining" -eq 0 ]; then
    echo '{"eta":"Complete!","confidence":"high","eta_minutes":0}'
    return
  fi
  
  local sum=0
  local count=0
  local min_time=9999
  local max_time=0
  
  if [ -f "$TIMING_FILE" ]; then
    sum=$(jq '[.stories[].actual] | add // 0' "$TIMING_FILE" 2>/dev/null)
    count=$(jq '.stories | length' "$TIMING_FILE" 2>/dev/null)
    
    if [ "$count" -gt 0 ]; then
      min_time=$(jq '[.stories[].actual] | min // 0' "$TIMING_FILE" 2>/dev/null)
      max_time=$(jq '[.stories[].actual] | max // 0' "$TIMING_FILE" 2>/dev/null)
    fi
  fi
  
  local avg=30
  local confidence="low"
  
  if [ "$count" -gt 0 ] && [ "$sum" -gt 0 ]; then
    avg=$((sum / count))
    
    if [ "$count" -ge 5 ]; then
      confidence="high"
    elif [ "$count" -ge 2 ]; then
      confidence="medium"
    fi
  fi
  
  local eta_minutes=$((remaining * avg))
  local eta_min=$((remaining * min_time))
  local eta_max=$((remaining * max_time))
  
  local eta_formatted=$(format_duration "$eta_minutes")
  
  if [ "$confidence" = "high" ] && [ "$min_time" -lt 9999 ]; then
    local range_min=$(format_duration "$eta_min")
    local range_max=$(format_duration "$eta_max")
    echo "{\"eta\":\"$eta_formatted\",\"confidence\":\"$confidence\",\"eta_minutes\":$eta_minutes,\"range\":\"$range_min - $range_max\",\"avg_per_story\":$avg}"
  else
    echo "{\"eta\":\"$eta_formatted\",\"confidence\":\"$confidence\",\"eta_minutes\":$eta_minutes,\"avg_per_story\":$avg}"
  fi
}

format_duration() {
  local minutes="$1"
  
  if [ "$minutes" -lt 60 ]; then
    echo "${minutes}m"
  elif [ "$minutes" -lt 1440 ]; then
    local hours=$((minutes / 60))
    local mins=$((minutes % 60))
    if [ "$mins" -gt 0 ]; then
      echo "${hours}h ${mins}m"
    else
      echo "${hours}h"
    fi
  else
    local days=$((minutes / 1440))
    local hours=$(( (minutes % 1440) / 60 ))
    if [ "$hours" -gt 0 ]; then
      echo "${days}d ${hours}h"
    else
      echo "${days}d"
    fi
  fi
}

get_eta_completion_time() {
  local eta_minutes="$1"
  
  if [ -z "$eta_minutes" ] || [ "$eta_minutes" -eq 0 ]; then
    echo "N/A"
    return
  fi
  
  case "$PLATFORM" in
    macos) date -v+${eta_minutes}M '+%Y-%m-%d %H:%M' ;;
    linux) date -d "+${eta_minutes} minutes" '+%Y-%m-%d %H:%M' ;;
    *) echo "N/A" ;;
  esac
}

# =============================================================================
# HEALTH CHECKS (4-Stage)
# =============================================================================

# Stage 1: Ralph tmux session exists with AI process
check_stage1_session() {
  tmux has-session -t ralph 2>/dev/null || return 1
  [ -n "$(get_ai_pid)" ] || return 1
  return 0
}

# Stage 2: AI process actively working (checking logs)
check_stage2_ai_active() {
  local pid=$(get_ai_pid)
  [ -z "$pid" ] && return 1
  
  # Check if process is not zombie/sleeping excessively
  local state=""
  case "$PLATFORM" in
    macos) state=$(ps -p "$pid" -o state= 2>/dev/null) ;;
    linux) state=$(cat /proc/$pid/stat 2>/dev/null | awk '{print $3}') ;;
  esac
  
  # D = disk sleep, Z = zombie, T = stopped
  if echo "$state" | grep -qE "[DZT]"; then
    return 1
  fi
  
  return 0
}

# Stage 3: Files being changed/created
check_stage3_files_changing() {
  # Check src/ directory if it exists
  if [ -d "$PROJECT_DIR/src" ]; then
    local recent=$(find_recent_files "$PROJECT_DIR/src" 10)
    [ "$recent" -gt 0 ] && return 0
  fi
  
  # Check root for any changes
  local progress_age=$(get_file_age_minutes "$PROJECT_DIR/progress.txt")
  local prd_age=$(get_file_age_minutes "$PROJECT_DIR/prd.json")
  
  [ "$progress_age" -lt 10 ] || [ "$prd_age" -lt 10 ] && return 0
  
  return 1
}

# Stage 4: CPU actively being used
check_stage4_cpu_active() {
  local cpu=$(get_ai_cpu)
  local cpu_int=${cpu%.*}
  [ "${cpu_int:-0}" -gt 2 ] && return 0
  return 1
}

get_health_status() {
  local s1="✗" s2="✗" s3="✗" s4="✗"
  
  check_stage1_session && s1="✓"
  check_stage2_ai_active && s2="✓"
  check_stage3_files_changing && s3="✓"
  check_stage4_cpu_active && s4="✓"
  
  echo "$s1$s2$s3$s4"
}

is_ralph_healthy() {
  # Must have session and active AI
  check_stage1_session || return 1
  check_stage2_ai_active || return 1
  
  # Must have either file changes OR CPU activity
  if ! check_stage3_files_changing && ! check_stage4_cpu_active; then
    return 1
  fi
  
  return 0
}

# =============================================================================
# RALPH CONTROL
# =============================================================================

backup_progress() {
  local timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_dir="$PROJECT_DIR/.ralph-backups"
  
  mkdir -p "$backup_dir"
  
  if [ -f "$PROJECT_DIR/progress.txt" ]; then
    cp "$PROJECT_DIR/progress.txt" "$backup_dir/progress_$timestamp.txt"
  fi
  
  if [ -f "$PROJECT_DIR/prd.json" ]; then
    cp "$PROJECT_DIR/prd.json" "$backup_dir/prd_$timestamp.json"
  fi
  
  # Keep only last 10 backups
  ls -t "$backup_dir"/progress_*.txt 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
  ls -t "$backup_dir"/prd_*.json 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
  
  log "INFO" "Backed up progress to $backup_dir"
}

restart_ralph() {
  local reason="${1:-Unknown}"
  
  log "WARN" "Restarting Ralph: $reason"
  notify "Restarting Ralph: $reason"
  
  # Kill existing session
  tmux kill-session -t ralph 2>/dev/null || true
  sleep 2
  
  # Capture failure context
  capture_failure_context "$reason"
  
  # Start new session
  tmux new-session -d -s ralph -c "$PROJECT_DIR" "$RALPH_SCRIPT --agent-only $PROJECT_DIR $RALPH_ITERATIONS"
  sleep 3
  
  # Verify restart
  if check_stage1_session; then
    log "OK" "Ralph restarted successfully"
    notify "Ralph restarted - $reason"
    return 0
  else
    log "ERROR" "Failed to restart Ralph"
    notify "ERROR: Ralph failed to restart!"
    return 1
  fi
}

start_ralph() {
  if check_stage1_session; then
    log "INFO" "Ralph already running"
    return 0
  fi
  
  log "INFO" "Starting Ralph..."
  tmux new-session -d -s ralph -c "$PROJECT_DIR" "$RALPH_SCRIPT --agent-only $PROJECT_DIR $RALPH_ITERATIONS"
  sleep 3
  
  if check_stage1_session; then
    log "OK" "Ralph started successfully"
    notify "Ralph started"
    return 0
  else
    log "ERROR" "Failed to start Ralph"
    return 1
  fi
}

# =============================================================================
# STUCK DETECTION
# =============================================================================

check_story_stuck() {
  local story="$1"
  local start_time="$2"
  local max_minutes="$3"
  
  local now=$(date +%s)
  local elapsed=$(( (now - start_time) / 60 ))
  
  if [ "$elapsed" -gt "$max_minutes" ]; then
    return 0  # Stuck
  fi
  
  return 1  # Not stuck
}

# =============================================================================
# MAIN MONITOR LOOP
# =============================================================================

cleanup_on_exit() {
  log "INFO" "Monitor shutting down..."
  record_event "shutdown" "Monitor stopped by user" "$(get_current_story 2>/dev/null || echo '')"
  set_final_status "stopped"
  generate_html_report
  log "OK" "Final report: $REPORT_FILE"
  exit 0
}

main() {
  trap cleanup_on_exit SIGINT SIGTERM
  
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║           Ralph Monitor - Cross-Platform              ║${NC}"
  echo -e "${CYAN}║       Health Monitoring & Auto-Restart System         ║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  log "INFO" "=========================================="
  log "INFO" "Ralph Monitor starting"
  log "INFO" "Platform: $PLATFORM"
  log "INFO" "Project: $PROJECT_DIR"
  log "INFO" "Check interval: ${CHECK_INTERVAL}m"
  log "INFO" "=========================================="
  
  # Validate setup
  if ! validate_project; then
    log "ERROR" "Project validation failed"
    exit 1
  fi
  
  if ! validate_prd_structure; then
    log "ERROR" "PRD structure validation failed"
    exit 1
  fi
  
  validate_progress_file
  validate_ntfy
  init_timing_file
  init_events_file
  set_run_metadata
  
  record_event "started" "Monitor started for $(basename "$PROJECT_DIR")" ""
  ntfy_send "Monitor started for $(basename "$PROJECT_DIR")" "Ralph Started" "low" "rocket"
  
  # Show initial status
  log "INFO" "Progress: $(get_progress_summary)"
  log "INFO" "Current story: $(get_current_story)"
  
  # State tracking
  local last_story=""
  local story_start_time=$(date +%s)
  local story_start_commit=$(get_current_commit)
  local restart_count=0
  local consecutive_unhealthy=0
  
  # Load previous state if exists
  if [ -f "$STATE_FILE" ]; then
    last_story=$(get_state_value "current_story")
    local saved_start=$(get_state_value "story_start_time")
    [ -n "$saved_start" ] && [ "$saved_start" != "0" ] && story_start_time=$saved_start
    restart_count=$(get_state_value "restart_count")
    log "INFO" "Resumed from saved state (story: $last_story, restarts: $restart_count)"
  fi
  
  # Start Ralph if not running
  if ! check_stage1_session; then
    start_ralph
    record_event "start" "Ralph started" "$(get_current_story)"
  else
    record_event "resume" "Monitor attached to running Ralph session" "$(get_current_story)"
  fi
  
  # Main loop
  while true; do
    # Check if all complete
    if check_all_complete; then
      local total_stories=$(get_story_count)
      local total_time_min=0
      if [ -f "$EVENTS_FILE" ]; then
        total_time_min=$(jq '[.stories_completed[].duration] | add // 0' "$EVENTS_FILE" 2>/dev/null || echo "0")
      fi
      local total_time_fmt=$(format_duration "$total_time_min")
      
      record_event "complete" "All $total_stories stories complete in $total_time_fmt!" ""
      set_final_status "complete"
      generate_html_report
      notify "Ralph COMPLETE! All $total_stories stories passing!"
      ntfy_send_alert "complete" "All $total_stories stories complete in $total_time_fmt! Project: $(basename "$PROJECT_DIR")"
      webhook_complete "$total_stories" "$total_time_fmt"
      log "OK" "All stories complete in $total_time_fmt. Monitor exiting."
      log "OK" "HTML report: $REPORT_FILE"
      rm -f "$STATE_FILE"
      exit 0
    fi
    
    # Get current state
    local current_story=$(get_current_story)
    local current_title=$(get_current_story_title "$current_story")
    
    # Story changed - record timing and reset
    if [ "$current_story" != "$last_story" ] && [ -n "$last_story" ]; then
      local now=$(date +%s)
      local duration=$(( (now - story_start_time) / 60 ))
      local estimate=$(get_base_timeout "$last_story")
      
      if [ "$duration" -gt 0 ]; then
        record_completion "$last_story" "$duration"
        record_story_completed "$last_story" "$duration" "$estimate"
        record_event "story_complete" "Completed: $last_story in ${duration}m" "$last_story"
        record_story_git_diff "$last_story" "$story_start_commit"
        webhook_story_complete "$last_story" "$duration" "$(get_progress_summary)"
      fi
      
      log "OK" "Story completed: $last_story (${duration}m)"
      story_start_time=$(date +%s)
      story_start_commit=$(get_current_commit)
      consecutive_unhealthy=0
      
      generate_html_report
    fi
    
    if [ "$current_story" != "$last_story" ]; then
      last_story="$current_story"
      story_start_time=$(date +%s)
      story_start_commit=$(get_current_commit)
      local eta_info=$(calculate_eta_with_confidence)
      local eta=$(echo "$eta_info" | jq -r '.eta' 2>/dev/null)
      local eta_mins=$(echo "$eta_info" | jq -r '.eta_minutes' 2>/dev/null)
      local completion_time=$(get_eta_completion_time "${eta_mins:-0}")
      log "INFO" "Now working on: $current_story - $current_title"
      log "INFO" "ETA: $eta (completion ~$completion_time)"
    fi
    
    # Calculate timeouts and status
    local max_stuck=$(get_story_timeout "$current_story")
    local progress=$(get_progress_summary)
    local progress_age=$(get_file_age_minutes "$PROJECT_DIR/progress.txt")
    local prd_age=$(get_file_age_minutes "$PROJECT_DIR/prd.json")
    local min_age=$((progress_age < prd_age ? progress_age : prd_age))
    local ai_cpu=$(get_ai_cpu)
    local health=$(get_health_status)
    local ai_cli=$(get_ai_cli_name)
    local last_entry=$(get_last_progress_entry)
    
    # Save state
    save_state "$current_story" "$story_start_time" "$restart_count"
    
    local resource_warnings=$(check_resources)
    
    # Health evaluation
    if is_ralph_healthy; then
      consecutive_unhealthy=0
      local eta=$(calculate_eta)
      log "INFO" "[$health] $current_story | ${min_age}m/${max_stuck}m | CPU:${ai_cpu}% | ETA:$eta | $progress"
      ntfy_send_status "$current_story" "$health" "$progress" "$min_age" "$max_stuck" "$ai_cpu"
    else
      consecutive_unhealthy=$((consecutive_unhealthy + 1))
      
      if ! check_stage1_session; then
        log "ERROR" "[$health] DEAD: Ralph not running"
        ntfy_send_alert "error" "Ralph DEAD on $current_story - restarting"
        
        if ! check_all_complete; then
          restart_ralph "Session died"
          restart_count=$((restart_count + 1))
          story_start_time=$(date +%s)
        fi
        
      elif ! check_stage2_ai_active; then
        log "WARN" "[$health] IDLE: AI process not active on $current_story"
        
        if [ "$min_age" -gt 10 ]; then
          ntfy_send_alert "restart" "AI idle for ${min_age}m on $current_story - restarting"
          restart_ralph "AI idle for ${min_age}m"
          restart_count=$((restart_count + 1))
          story_start_time=$(date +%s)
        fi
        
      elif ! check_stage3_files_changing && ! check_stage4_cpu_active; then
        log "WARN" "[$health] STALLED: No file changes, CPU idle on $current_story"
        
        if [ "$min_age" -gt "$max_stuck" ]; then
          ntfy_send_alert "stuck" "Stuck on $current_story for ${min_age}m (max: ${max_stuck}m) - restarting"
          restart_ralph "Stuck on $current_story for ${min_age}m (max: ${max_stuck}m)"
          restart_count=$((restart_count + 1))
          story_start_time=$(date +%s)
        elif [ "$consecutive_unhealthy" -ge 3 ]; then
          log "WARN" "3 consecutive unhealthy checks, restarting"
          ntfy_send_alert "restart" "3 consecutive unhealthy checks on $current_story - restarting"
          restart_ralph "Consecutive unhealthy: $consecutive_unhealthy"
          restart_count=$((restart_count + 1))
          story_start_time=$(date +%s)
        fi
      fi
      
      log "INFO" "Last progress entry: $last_entry"
      log "INFO" "Progress: $progress"
    fi
    
    # Check for excessive restarts
    if [ "$restart_count" -ge 5 ]; then
      log "ERROR" "Too many restarts ($restart_count), may need manual intervention"
      notify "WARNING: Ralph restarted $restart_count times on $current_story"
      ntfy_send_alert "error" "CRITICAL: $restart_count restarts on $current_story - needs manual intervention!"
      restart_count=0
    fi
    
    sleep $((CHECK_INTERVAL * 60))
  done
}

# =============================================================================
# STATUS COMMAND
# =============================================================================

show_status() {
  echo ""
  echo -e "${CYAN}Ralph Monitor Status${NC}"
  echo "===================="
  echo ""
  echo "Platform:      $PLATFORM"
  echo "Project:       $PROJECT_DIR"
  echo ""
  
  if [ -f "$PROJECT_DIR/prd.json" ]; then
    echo "Progress:      $(get_progress_summary)"
    echo "Current:       $(get_current_story)"
    
    init_timing_file
    local eta_info=$(calculate_eta_with_confidence)
    local eta=$(echo "$eta_info" | jq -r '.eta' 2>/dev/null)
    local confidence=$(echo "$eta_info" | jq -r '.confidence' 2>/dev/null)
    local eta_mins=$(echo "$eta_info" | jq -r '.eta_minutes' 2>/dev/null)
    local completion=$(get_eta_completion_time "${eta_mins:-0}")
    local range=$(echo "$eta_info" | jq -r '.range // empty' 2>/dev/null)
    
    echo ""
    echo -e "${GREEN}ETA:           $eta${NC} (confidence: $confidence)"
    if [ -n "$range" ]; then
      echo "Range:         $range"
    fi
    echo "Est. Complete: $completion"
    echo ""
  fi
  
  echo "Health:        $(get_health_status)"
  echo "AI Process:    $(get_ai_cli_name) (PID: $(get_ai_pid))"
  echo "AI CPU:        $(get_ai_cpu)%"
  echo ""
  
  echo "Resources:"
  echo "  Disk:        $(get_disk_usage)% used, $(get_available_disk_gb)GB free"
  echo "  Memory:      $(get_memory_usage)MB free"
  echo ""
  
  if [ -f "$PROJECT_DIR/progress.txt" ]; then
    echo "Last entry:    $(get_last_progress_entry)"
    echo "Progress age:  $(get_file_age_minutes "$PROJECT_DIR/progress.txt")m"
  fi
  
  if [ -f "$PROJECT_DIR/prd.json" ]; then
    echo "PRD age:       $(get_file_age_minutes "$PROJECT_DIR/prd.json")m"
  fi
  
  if [ -d "$PROJECT_DIR/.git" ]; then
    echo ""
    echo "Git:"
    echo "  Commit:      $(get_current_commit)"
    local git_status=$(get_git_status)
    echo "  Modified:    $(echo "$git_status" | jq -r '.modified' 2>/dev/null) files"
    echo "  Untracked:   $(echo "$git_status" | jq -r '.untracked' 2>/dev/null) files"
  fi
  
  local cost_data=$(get_all_sessions_cost)
  if [ -n "$cost_data" ]; then
    local total_cost=$(echo "$cost_data" | jq -r '.cost' 2>/dev/null)
    local total_input=$(echo "$cost_data" | jq -r '.tokens.input' 2>/dev/null)
    local total_output=$(echo "$cost_data" | jq -r '.tokens.output' 2>/dev/null)
    
    echo ""
    echo "Cost (all sessions):"
    echo "  Total:       $(format_cost "$total_cost")"
    echo "  Input:       $(format_tokens "$total_input") tokens"
    echo "  Output:      $(format_tokens "$total_output") tokens"
  fi
  
  echo ""
  echo "Notifications:"
  if ntfy_configured; then
    echo "  NTFY:        $NTFY_SERVER/$NTFY_TOPIC (enabled)"
  else
    echo "  NTFY:        disabled"
  fi
  if [ -n "$WEBHOOK_URL" ]; then
    echo "  Webhook:     $WEBHOOK_TYPE (enabled)"
  else
    echo "  Webhook:     disabled"
  fi
  echo ""
}

# =============================================================================
# ENTRY POINT
# =============================================================================

case "$EARLY_FLAG" in
  --status|-s)
    show_status
    ;;
  --report|-r)
    if [ ! -f "$EVENTS_FILE" ]; then
      echo "No events file found at $EVENTS_FILE"
      echo "Run the monitor first to collect data."
      exit 1
    fi
    generate_html_report
    echo "Report generated: $REPORT_FILE"
    if command -v open &>/dev/null; then
      open "$REPORT_FILE"
    elif command -v xdg-open &>/dev/null; then
      xdg-open "$REPORT_FILE"
    fi
    ;;
  *)
    main
    ;;
esac
