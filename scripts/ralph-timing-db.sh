#!/bin/bash
# Ralph Ultra Timing Database - Persistent learning across all projects
# Dual backend: SQLite (if available) or JSON (zero deps)
# Usage: ralph-timing-db.sh [--record|--query|--stats|--predict|--export]

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

RALPH_DATA_DIR="${RALPH_DATA_DIR:-$HOME/.ralph-ultra}"
RALPH_TIMING_BACKEND="${RALPH_TIMING_BACKEND:-auto}"

JSON_DB_FILE="$RALPH_DATA_DIR/timing-db.json"
SQLITE_DB_FILE="$RALPH_DATA_DIR/timing.db"

mkdir -p "$RALPH_DATA_DIR"

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
log_db() { echo -e "${MAGENTA}[DB]${NC} $1"; }

# =============================================================================
# BACKEND DETECTION
# =============================================================================

has_sqlite() {
  command -v sqlite3 &>/dev/null
}

has_jq() {
  command -v jq &>/dev/null
}

detect_backend() {
  case "$RALPH_TIMING_BACKEND" in
    sqlite)
      if has_sqlite; then
        echo "sqlite"
      else
        log_warn "SQLite requested but not installed, falling back to JSON"
        echo "json"
      fi
      ;;
    json)
      echo "json"
      ;;
    auto|*)
      if has_sqlite; then
        echo "sqlite"
      else
        echo "json"
      fi
      ;;
  esac
}

BACKEND=$(detect_backend)

# =============================================================================
# SQLITE BACKEND
# =============================================================================

sqlite_init() {
  if [ ! -f "$SQLITE_DB_FILE" ]; then
    log_db "Initializing SQLite database..."
    sqlite3 "$SQLITE_DB_FILE" <<'SQL'
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  story_id TEXT NOT NULL,
  story_title TEXT,
  duration_min INTEGER NOT NULL,
  estimated_min INTEGER,
  complexity TEXT,
  model TEXT,
  success INTEGER DEFAULT 1,
  files_changed INTEGER,
  lines_changed INTEGER,
  subagents_used TEXT,
  error_message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT UNIQUE NOT NULL,
  avg_duration REAL,
  min_duration INTEGER,
  max_duration INTEGER,
  sample_count INTEGER DEFAULT 0,
  success_rate REAL,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  name TEXT,
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  total_stories INTEGER DEFAULT 0,
  completed_stories INTEGER DEFAULT 0,
  total_duration_min INTEGER DEFAULT 0,
  first_run DATETIME,
  last_run DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project);
CREATE INDEX IF NOT EXISTS idx_runs_story ON runs(story_id);
CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs(timestamp);
CREATE INDEX IF NOT EXISTS idx_runs_complexity ON runs(complexity);
SQL
    log_ok "SQLite database initialized at $SQLITE_DB_FILE"
  fi
}

sqlite_record() {
  local project="$1"
  local story_id="$2"
  local duration="$3"
  local estimate="${4:-0}"
  local complexity="${5:-medium}"
  local model="${6:-unknown}"
  local success="${7:-1}"
  local story_title="${8:-}"
  local files_changed="${9:-0}"
  local subagents="${10:-}"
  
  sqlite_init
  
  sqlite3 "$SQLITE_DB_FILE" <<SQL
INSERT INTO runs (project, story_id, story_title, duration_min, estimated_min, complexity, model, success, files_changed, subagents_used)
VALUES ('$project', '$story_id', '$story_title', $duration, $estimate, '$complexity', '$model', $success, $files_changed, '$subagents');

INSERT INTO projects (path, name, total_runs, successful_runs, total_duration_min, first_run, last_run)
VALUES ('$project', '$(basename "$project")', 1, $success, $duration, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(path) DO UPDATE SET
  total_runs = total_runs + 1,
  successful_runs = successful_runs + $success,
  total_duration_min = total_duration_min + $duration,
  last_run = CURRENT_TIMESTAMP;
SQL

  sqlite_update_patterns "$story_id" "$duration" "$success"
  
  log_db "Recorded: $story_id (${duration}m) → SQLite"
}

sqlite_update_patterns() {
  local story_id="$1"
  local duration="$2"
  local success="$3"
  
  local patterns=""
  
  [[ "$story_id" =~ integration ]] && patterns="$patterns integration"
  [[ "$story_id" =~ provider ]] && patterns="$patterns provider"
  [[ "$story_id" =~ complex ]] && patterns="$patterns complex"
  [[ "$story_id" =~ video ]] && patterns="$patterns video"
  [[ "$story_id" =~ platform ]] && patterns="$patterns platform"
  [[ "$story_id" =~ tool ]] && patterns="$patterns tool"
  [[ "$story_id" =~ analyze ]] && patterns="$patterns analyze"
  [[ "$story_id" =~ design ]] && patterns="$patterns design"
  [[ "$story_id" =~ util ]] && patterns="$patterns util"
  [[ "$story_id" =~ core ]] && patterns="$patterns core"
  [[ "$story_id" =~ setup ]] && patterns="$patterns setup"
  [[ "$story_id" =~ config ]] && patterns="$patterns config"
  [[ "$story_id" =~ test ]] && patterns="$patterns test"
  [[ "$story_id" =~ api ]] && patterns="$patterns api"
  [[ "$story_id" =~ ui ]] && patterns="$patterns ui"
  [[ "$story_id" =~ frontend ]] && patterns="$patterns frontend"
  [[ "$story_id" =~ backend ]] && patterns="$patterns backend"
  [[ "$story_id" =~ database ]] && patterns="$patterns database"
  [[ "$story_id" =~ auth ]] && patterns="$patterns auth"
  
  for pattern in $patterns; do
    sqlite3 "$SQLITE_DB_FILE" <<SQL
INSERT INTO patterns (pattern, avg_duration, min_duration, max_duration, sample_count, success_rate)
VALUES ('$pattern', $duration, $duration, $duration, 1, $success)
ON CONFLICT(pattern) DO UPDATE SET
  avg_duration = (avg_duration * sample_count + $duration) / (sample_count + 1),
  min_duration = MIN(min_duration, $duration),
  max_duration = MAX(max_duration, $duration),
  sample_count = sample_count + 1,
  success_rate = (success_rate * sample_count + $success) / (sample_count + 1),
  last_updated = CURRENT_TIMESTAMP;
SQL
  done
}

sqlite_predict() {
  local story_id="$1"
  
  sqlite_init
  
  local exact_match=$(sqlite3 "$SQLITE_DB_FILE" "SELECT AVG(duration_min) FROM runs WHERE story_id = '$story_id' LIMIT 1;")
  
  if [ -n "$exact_match" ] && [ "$exact_match" != "" ]; then
    echo "${exact_match%.*}"
    return
  fi
  
  local pattern_match=""
  local best_confidence=0
  
  for pattern in integration provider complex video platform tool analyze design util core setup config test api ui frontend backend database auth; do
    if echo "$story_id" | grep -qi "$pattern"; then
      local result=$(sqlite3 "$SQLITE_DB_FILE" "SELECT avg_duration, sample_count FROM patterns WHERE pattern = '$pattern';")
      if [ -n "$result" ]; then
        local avg=$(echo "$result" | cut -d'|' -f1)
        local count=$(echo "$result" | cut -d'|' -f2)
        if [ "$count" -gt "$best_confidence" ]; then
          pattern_match="${avg%.*}"
          best_confidence="$count"
        fi
      fi
    fi
  done
  
  if [ -n "$pattern_match" ]; then
    echo "$pattern_match"
    return
  fi
  
  local global_avg=$(sqlite3 "$SQLITE_DB_FILE" "SELECT AVG(duration_min) FROM runs;")
  if [ -n "$global_avg" ] && [ "$global_avg" != "" ]; then
    echo "${global_avg%.*}"
  else
    echo "30"
  fi
}

sqlite_stats() {
  sqlite_init
  
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║              Ralph Ultra Timing Database (SQLite)            ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  echo -e "${BLUE}Global Statistics:${NC}"
  sqlite3 -header -column "$SQLITE_DB_FILE" <<'SQL'
SELECT 
  COUNT(*) as total_runs,
  COUNT(DISTINCT project) as projects,
  ROUND(AVG(duration_min), 1) as avg_duration,
  MIN(duration_min) as min_duration,
  MAX(duration_min) as max_duration,
  SUM(duration_min) as total_minutes,
  ROUND(SUM(duration_min) / 60.0, 1) as total_hours,
  ROUND(AVG(success) * 100, 1) as success_rate
FROM runs;
SQL
  echo ""
  
  echo -e "${BLUE}By Complexity:${NC}"
  sqlite3 -header -column "$SQLITE_DB_FILE" <<'SQL'
SELECT 
  complexity,
  COUNT(*) as runs,
  ROUND(AVG(duration_min), 1) as avg_min,
  ROUND(AVG(success) * 100, 1) as success_pct
FROM runs
WHERE complexity IS NOT NULL
GROUP BY complexity
ORDER BY avg_min DESC;
SQL
  echo ""
  
  echo -e "${BLUE}Top Patterns (by sample count):${NC}"
  sqlite3 -header -column "$SQLITE_DB_FILE" <<'SQL'
SELECT 
  pattern,
  sample_count as samples,
  ROUND(avg_duration, 1) as avg_min,
  min_duration as min,
  max_duration as max,
  ROUND(success_rate * 100, 1) as success_pct
FROM patterns
ORDER BY sample_count DESC
LIMIT 10;
SQL
  echo ""
  
  echo -e "${BLUE}Recent Projects:${NC}"
  sqlite3 -header -column "$SQLITE_DB_FILE" <<'SQL'
SELECT 
  name,
  total_runs as runs,
  ROUND(successful_runs * 100.0 / total_runs, 1) as success_pct,
  total_duration_min as total_min,
  date(last_run) as last_run
FROM projects
ORDER BY last_run DESC
LIMIT 5;
SQL
  echo ""
  
  echo -e "${BLUE}Performance Over Time (last 7 days):${NC}"
  sqlite3 -header -column "$SQLITE_DB_FILE" <<'SQL'
SELECT 
  date(timestamp) as date,
  COUNT(*) as runs,
  ROUND(AVG(duration_min), 1) as avg_min,
  ROUND(AVG(success) * 100, 1) as success_pct
FROM runs
WHERE timestamp > datetime('now', '-7 days')
GROUP BY date(timestamp)
ORDER BY date DESC;
SQL
  echo ""
}

sqlite_query() {
  local query="$1"
  sqlite_init
  sqlite3 -header -column "$SQLITE_DB_FILE" "$query"
}

sqlite_export_json() {
  sqlite_init
  
  sqlite3 "$SQLITE_DB_FILE" <<'SQL'
SELECT json_object(
  'runs', (SELECT json_group_array(json_object(
    'project', project,
    'story_id', story_id,
    'duration_min', duration_min,
    'estimated_min', estimated_min,
    'complexity', complexity,
    'success', success,
    'timestamp', timestamp
  )) FROM runs),
  'patterns', (SELECT json_group_array(json_object(
    'pattern', pattern,
    'avg_duration', avg_duration,
    'sample_count', sample_count,
    'success_rate', success_rate
  )) FROM patterns),
  'projects', (SELECT json_group_array(json_object(
    'path', path,
    'name', name,
    'total_runs', total_runs,
    'successful_runs', successful_runs
  )) FROM projects)
);
SQL
}

# =============================================================================
# JSON BACKEND
# =============================================================================

json_init() {
  if [ ! -f "$JSON_DB_FILE" ]; then
    log_db "Initializing JSON database..."
    cat > "$JSON_DB_FILE" <<'EOF'
{
  "runs": [],
  "patterns": {},
  "projects": {},
  "meta": {
    "version": "1.0",
    "created": "",
    "last_updated": ""
  }
}
EOF
    local now=$(date -Iseconds)
    local tmp=$(mktemp)
    jq --arg now "$now" '.meta.created = $now | .meta.last_updated = $now' "$JSON_DB_FILE" > "$tmp" && mv "$tmp" "$JSON_DB_FILE"
    log_ok "JSON database initialized at $JSON_DB_FILE"
  fi
}

json_record() {
  local project="$1"
  local story_id="$2"
  local duration="$3"
  local estimate="${4:-0}"
  local complexity="${5:-medium}"
  local model="${6:-unknown}"
  local success="${7:-1}"
  local story_title="${8:-}"
  
  json_init
  
  local now=$(date -Iseconds)
  local tmp=$(mktemp)
  
  jq --arg project "$project" \
     --arg story_id "$story_id" \
     --arg story_title "$story_title" \
     --argjson duration "$duration" \
     --argjson estimate "$estimate" \
     --arg complexity "$complexity" \
     --arg model "$model" \
     --argjson success "$success" \
     --arg timestamp "$now" \
     '
     .runs += [{
       project: $project,
       story_id: $story_id,
       story_title: $story_title,
       duration_min: $duration,
       estimated_min: $estimate,
       complexity: $complexity,
       model: $model,
       success: $success,
       timestamp: $timestamp
     }] |
     .meta.last_updated = $timestamp |
     
     # Update project stats
     .projects[$project] = (
       (.projects[$project] // {total_runs: 0, successful_runs: 0, total_duration: 0}) |
       .total_runs += 1 |
       .successful_runs += $success |
       .total_duration += $duration |
       .last_run = $timestamp
     )
     ' "$JSON_DB_FILE" > "$tmp" && mv "$tmp" "$JSON_DB_FILE"
  
  json_update_patterns "$story_id" "$duration" "$success"
  
  log_db "Recorded: $story_id (${duration}m) → JSON"
}

json_update_patterns() {
  local story_id="$1"
  local duration="$2"
  local success="$3"
  
  local patterns=""
  
  [[ "$story_id" =~ integration ]] && patterns="$patterns integration"
  [[ "$story_id" =~ provider ]] && patterns="$patterns provider"
  [[ "$story_id" =~ complex ]] && patterns="$patterns complex"
  [[ "$story_id" =~ video ]] && patterns="$patterns video"
  [[ "$story_id" =~ platform ]] && patterns="$patterns platform"
  [[ "$story_id" =~ tool ]] && patterns="$patterns tool"
  [[ "$story_id" =~ analyze ]] && patterns="$patterns analyze"
  [[ "$story_id" =~ design ]] && patterns="$patterns design"
  [[ "$story_id" =~ util ]] && patterns="$patterns util"
  [[ "$story_id" =~ core ]] && patterns="$patterns core"
  [[ "$story_id" =~ setup ]] && patterns="$patterns setup"
  [[ "$story_id" =~ config ]] && patterns="$patterns config"
  [[ "$story_id" =~ test ]] && patterns="$patterns test"
  [[ "$story_id" =~ api ]] && patterns="$patterns api"
  [[ "$story_id" =~ ui ]] && patterns="$patterns ui"
  [[ "$story_id" =~ frontend ]] && patterns="$patterns frontend"
  [[ "$story_id" =~ backend ]] && patterns="$patterns backend"
  [[ "$story_id" =~ database ]] && patterns="$patterns database"
  [[ "$story_id" =~ auth ]] && patterns="$patterns auth"
  
  for pattern in $patterns; do
    local tmp=$(mktemp)
    jq --arg pattern "$pattern" \
       --argjson duration "$duration" \
       --argjson success "$success" \
       '
       .patterns[$pattern] = (
         (.patterns[$pattern] // {sum: 0, count: 0, min: 999999, max: 0, success_sum: 0}) |
         .sum += $duration |
         .count += 1 |
         .min = (if $duration < .min then $duration else .min end) |
         .max = (if $duration > .max then $duration else .max end) |
         .success_sum += $success |
         .avg = (.sum / .count) |
         .success_rate = (.success_sum / .count)
       )
       ' "$JSON_DB_FILE" > "$tmp" && mv "$tmp" "$JSON_DB_FILE"
  done
}

json_predict() {
  local story_id="$1"
  
  json_init
  
  local exact_match=$(jq -r --arg sid "$story_id" '
    [.runs[] | select(.story_id == $sid) | .duration_min] | 
    if length > 0 then add / length else empty end
  ' "$JSON_DB_FILE" 2>/dev/null)
  
  if [ -n "$exact_match" ] && [ "$exact_match" != "null" ]; then
    echo "${exact_match%.*}"
    return
  fi
  
  local best_avg=""
  local best_count=0
  
  for pattern in integration provider complex video platform tool analyze design util core setup config test api ui frontend backend database auth; do
    if echo "$story_id" | grep -qi "$pattern"; then
      local result=$(jq -r --arg p "$pattern" '.patterns[$p] | "\(.avg // 0)|\(.count // 0)"' "$JSON_DB_FILE" 2>/dev/null)
      local avg=$(echo "$result" | cut -d'|' -f1)
      local count=$(echo "$result" | cut -d'|' -f2)
      
      if [ "${count:-0}" -gt "$best_count" ]; then
        best_avg="${avg%.*}"
        best_count="$count"
      fi
    fi
  done
  
  if [ -n "$best_avg" ] && [ "$best_avg" != "0" ]; then
    echo "$best_avg"
    return
  fi
  
  local global_avg=$(jq '[.runs[].duration_min] | if length > 0 then add / length else 30 end' "$JSON_DB_FILE" 2>/dev/null)
  echo "${global_avg%.*}"
}

json_stats() {
  json_init
  
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║              Ralph Ultra Timing Database (JSON)              ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  echo -e "${BLUE}Global Statistics:${NC}"
  jq -r '
    .runs | 
    if length > 0 then
      "  Total runs:     \(length)",
      "  Avg duration:   \((([.[].duration_min] | add) / length) | floor)m",
      "  Min duration:   \([.[].duration_min] | min)m",
      "  Max duration:   \([.[].duration_min] | max)m",
      "  Total time:     \(([.[].duration_min] | add))m (\((([.[].duration_min] | add) / 60) | floor)h)",
      "  Success rate:   \((([.[].success] | add) / length * 100) | floor)%"
    else
      "  No runs recorded yet"
    end
  ' "$JSON_DB_FILE"
  echo ""
  
  echo -e "${BLUE}Projects:${NC}"
  jq -r '
    .projects | to_entries | sort_by(-.value.total_runs)[:5] |
    .[] | "  \(.key | split("/") | last): \(.value.total_runs) runs, \(.value.total_duration)m total"
  ' "$JSON_DB_FILE" 2>/dev/null || echo "  No projects yet"
  echo ""
  
  echo -e "${BLUE}Pattern Analysis:${NC}"
  jq -r '
    .patterns | to_entries | sort_by(-.value.count)[:10] |
    .[] | "  \(.key): \(.value.avg | floor)m avg (\(.value.count) samples, \((.value.success_rate * 100) | floor)% success)"
  ' "$JSON_DB_FILE" 2>/dev/null || echo "  No patterns yet"
  echo ""
}

json_export() {
  json_init
  cat "$JSON_DB_FILE"
}

# =============================================================================
# MIGRATION
# =============================================================================

migrate_project_timing() {
  local project_dir="$1"
  local timing_file="$project_dir/.ralph-timing.json"
  
  if [ ! -f "$timing_file" ]; then
    log_warn "No timing file found at $timing_file"
    return 1
  fi
  
  log_db "Migrating timing data from $project_dir..."
  
  local stories=$(jq -r '.stories | to_entries[] | "\(.key)|\(.value.actual // .value)|\(.value.estimate // 30)"' "$timing_file" 2>/dev/null)
  
  local count=0
  while IFS='|' read -r story_id duration estimate; do
    if [ -n "$story_id" ] && [ -n "$duration" ]; then
      record_run "$project_dir" "$story_id" "$duration" "$estimate" "medium" "unknown" "1"
      count=$((count + 1))
    fi
  done <<< "$stories"
  
  log_ok "Migrated $count stories from $project_dir"
}

# =============================================================================
# UNIFIED API
# =============================================================================

record_run() {
  case "$BACKEND" in
    sqlite) sqlite_record "$@" ;;
    json)   json_record "$@" ;;
  esac
}

predict_duration() {
  case "$BACKEND" in
    sqlite) sqlite_predict "$@" ;;
    json)   json_predict "$@" ;;
  esac
}

show_stats() {
  case "$BACKEND" in
    sqlite) sqlite_stats ;;
    json)   json_stats ;;
  esac
}

run_query() {
  case "$BACKEND" in
    sqlite) sqlite_query "$@" ;;
    json)   
      log_warn "Raw queries only supported with SQLite backend"
      log_info "Use: RALPH_TIMING_BACKEND=sqlite ralph-timing-db.sh --query '...'"
      ;;
  esac
}

export_data() {
  case "$BACKEND" in
    sqlite) sqlite_export_json ;;
    json)   json_export ;;
  esac
}

# =============================================================================
# STATUS
# =============================================================================

show_status() {
  echo ""
  echo -e "${CYAN}Ralph Ultra Timing Database${NC}"
  echo "============================"
  echo ""
  echo "  Backend:      $BACKEND"
  echo "  Data dir:     $RALPH_DATA_DIR"
  
  case "$BACKEND" in
    sqlite)
      echo "  Database:     $SQLITE_DB_FILE"
      if [ -f "$SQLITE_DB_FILE" ]; then
        local size=$(du -h "$SQLITE_DB_FILE" | cut -f1)
        local runs=$(sqlite3 "$SQLITE_DB_FILE" "SELECT COUNT(*) FROM runs;" 2>/dev/null || echo "0")
        echo "  Size:         $size"
        echo "  Total runs:   $runs"
      else
        echo "  Status:       Not initialized"
      fi
      ;;
    json)
      echo "  Database:     $JSON_DB_FILE"
      if [ -f "$JSON_DB_FILE" ]; then
        local size=$(du -h "$JSON_DB_FILE" | cut -f1)
        local runs=$(jq '.runs | length' "$JSON_DB_FILE" 2>/dev/null || echo "0")
        echo "  Size:         $size"
        echo "  Total runs:   $runs"
      else
        echo "  Status:       Not initialized"
      fi
      ;;
  esac
  
  echo ""
  echo "  SQLite available: $(has_sqlite && echo 'yes' || echo 'no')"
  echo "  jq available:     $(has_jq && echo 'yes' || echo 'no')"
  echo ""
}

# =============================================================================
# USAGE
# =============================================================================

show_usage() {
  cat <<'EOF'
Ralph Ultra Timing Database - Persistent learning across all projects

Usage: ralph-timing-db.sh [command] [options]

Commands:
  --record PROJECT STORY DURATION [ESTIMATE] [COMPLEXITY] [MODEL] [SUCCESS]
                      Record a completed story
  --predict STORY     Predict duration for a story based on historical data
  --stats             Show comprehensive statistics
  --status            Show database status
  --query "SQL"       Run raw SQL query (SQLite only)
  --export            Export all data as JSON
  --migrate DIR       Migrate project timing file to global DB
  --help, -h          Show this help

Environment Variables:
  RALPH_DATA_DIR          Data directory (default: ~/.ralph-ultra)
  RALPH_TIMING_BACKEND    Backend: auto|sqlite|json (default: auto)

Backends:
  sqlite    Full SQL queries, fast aggregations, recommended
  json      Zero dependencies, portable, jq-based queries
  auto      Use SQLite if available, otherwise JSON (default)

Examples:
  # Record a completed story
  ralph-timing-db.sh --record /path/to/project US-001 45 30 complex sonnet 1

  # Predict duration for a story
  ralph-timing-db.sh --predict "US-042-integration-tests"

  # View statistics
  ralph-timing-db.sh --stats

  # Run custom query (SQLite)
  ralph-timing-db.sh --query "SELECT * FROM runs WHERE duration_min > 60"

  # Migrate existing project data
  ralph-timing-db.sh --migrate /path/to/project

  # Force JSON backend
  RALPH_TIMING_BACKEND=json ralph-timing-db.sh --stats

Complexity Levels:
  simple    Setup, config, small changes (~20min)
  medium    Utilities, individual features (~30min)
  complex   Full tools, platform modules (~45min)
  heavy     Integrations, multi-file changes (~60min)

EOF
}

# =============================================================================
# MAIN
# =============================================================================

main() {
  local cmd="${1:---status}"
  
  case "$cmd" in
    --record)
      shift
      if [ $# -lt 3 ]; then
        log_error "Usage: ralph-timing-db.sh --record PROJECT STORY DURATION [ESTIMATE] [COMPLEXITY] [MODEL] [SUCCESS]"
        exit 1
      fi
      record_run "$@"
      ;;
    --predict)
      if [ -z "$2" ]; then
        log_error "Usage: ralph-timing-db.sh --predict STORY_ID"
        exit 1
      fi
      predict_duration "$2"
      ;;
    --stats)
      show_stats
      ;;
    --status|-s)
      show_status
      ;;
    --query)
      if [ -z "$2" ]; then
        log_error "Usage: ralph-timing-db.sh --query 'SQL'"
        exit 1
      fi
      run_query "$2"
      ;;
    --export)
      export_data
      ;;
    --migrate)
      if [ -z "$2" ]; then
        log_error "Usage: ralph-timing-db.sh --migrate PROJECT_DIR"
        exit 1
      fi
      migrate_project_timing "$2"
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
