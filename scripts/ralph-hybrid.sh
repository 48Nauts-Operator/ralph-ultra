#!/bin/bash
# Ralph Ultra Hybrid LLM Router - 80/20 Local/API cost optimization
# Routes tasks to local LLMs or cloud APIs based on task complexity
# Supports: Ollama, LM Studio, vLLM, OpenAI-compatible APIs
#
# Usage: ralph-hybrid.sh [--query|--route|--status|--benchmark]

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

RALPH_HYBRID_MODE="${RALPH_HYBRID_MODE:-balanced}"
RALPH_LOCAL_PROVIDER="${RALPH_LOCAL_PROVIDER:-ollama}"
RALPH_LOCAL_ENDPOINT="${RALPH_LOCAL_ENDPOINT:-http://localhost:11434}"
RALPH_LOCAL_MODEL="${RALPH_LOCAL_MODEL:-qwen2.5-coder:32b}"
RALPH_LOCAL_FAST_MODEL="${RALPH_LOCAL_FAST_MODEL:-qwen2.5-coder:7b}"
RALPH_FALLBACK_TO_API="${RALPH_FALLBACK_TO_API:-true}"
RALPH_LOCAL_TIMEOUT="${RALPH_LOCAL_TIMEOUT:-120}"

STATE_DIR="${HOME}/.ralph-ultra"
HYBRID_STATE_FILE="${STATE_DIR}/hybrid-state.json"
HYBRID_STATS_FILE="${STATE_DIR}/hybrid-stats.json"

# Cost estimates per 1K tokens (USD)
COST_OPUS_INPUT=0.015
COST_OPUS_OUTPUT=0.075
COST_SONNET_INPUT=0.003
COST_SONNET_OUTPUT=0.015
COST_HAIKU_INPUT=0.00025
COST_HAIKU_OUTPUT=0.00125
COST_LOCAL=0.0

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
log_hybrid() { echo -e "${MAGENTA}[HYBRID]${NC} $1"; }
log_local() { echo -e "${CYAN}[LOCAL]${NC} $1"; }
log_api() { echo -e "${YELLOW}[API]${NC} $1"; }

# =============================================================================
# TASK CLASSIFICATION
# =============================================================================

# Task types and their routing preferences
# Format: "pattern|task_type|preferred_llm|confidence_threshold"
TASK_PATTERNS=(
  # Planning & Architecture - Always use best model
  "architect|planning|opus|1.0"
  "design.*system|planning|opus|1.0"
  "plan.*feature|planning|opus|1.0"
  "break.*down.*task|planning|opus|0.9"
  "create.*prd|planning|opus|1.0"
  "review.*architecture|planning|opus|1.0"
  
  # Code Review - Use best model for quality
  "review.*code|review|opus|0.9"
  "review.*pr|review|opus|0.9"
  "security.*review|review|opus|1.0"
  "find.*bug|review|sonnet|0.8"
  
  # Complex Debugging - Needs reasoning
  "debug.*complex|debugging|sonnet|0.8"
  "fix.*integration|debugging|sonnet|0.8"
  "investigate.*error|debugging|sonnet|0.7"
  
  # Code Generation - Local excels here
  "implement.*function|coding|local|0.8"
  "write.*code|coding|local|0.8"
  "create.*component|coding|local|0.7"
  "add.*feature|coding|local|0.6"
  "refactor|coding|local|0.7"
  "generate.*test|coding|local|0.8"
  
  # Simple Edits - Perfect for local
  "fix.*typo|simple|local_fast|0.95"
  "rename|simple|local_fast|0.9"
  "format|simple|local_fast|0.95"
  "add.*comment|simple|local_fast|0.9"
  "update.*import|simple|local_fast|0.95"
  "remove.*unused|simple|local_fast|0.9"
  
  # Documentation - Local handles well
  "write.*doc|docs|local|0.85"
  "update.*readme|docs|local|0.85"
  "add.*jsdoc|docs|local|0.9"
  "document|docs|local|0.8"
  
  # Search & Analysis - Local is fast enough
  "find.*file|search|local_fast|0.95"
  "search.*code|search|local_fast|0.9"
  "grep|search|local_fast|0.95"
  "locate|search|local_fast|0.95"
  "analyze.*code|analysis|local|0.7"
)

classify_task() {
  local task_description="$1"
  local task_lower=$(echo "$task_description" | tr '[:upper:]' '[:lower:]')
  
  for pattern_entry in "${TASK_PATTERNS[@]}"; do
    IFS='|' read -r pattern task_type preferred confidence <<< "$pattern_entry"
    
    if echo "$task_lower" | grep -qE "$pattern"; then
      echo "{\"type\":\"$task_type\",\"preferred\":\"$preferred\",\"confidence\":$confidence,\"pattern\":\"$pattern\"}"
      return 0
    fi
  done
  
  # Default: balanced approach
  echo '{"type":"general","preferred":"hybrid","confidence":0.5,"pattern":"default"}'
}

# =============================================================================
# HYBRID MODE CONFIGURATION
# =============================================================================

get_mode_config() {
  local mode="$1"
  
  case "$mode" in
    aggressive)
      # 90% local - maximum savings
      echo '{
        "local_threshold": 0.3,
        "force_api_types": ["planning"],
        "prefer_local_types": ["coding", "simple", "docs", "search", "analysis", "debugging", "review"],
        "description": "Maximum cost savings, 90% local routing"
      }'
      ;;
    balanced)
      # 70% local - best tradeoff
      echo '{
        "local_threshold": 0.5,
        "force_api_types": ["planning", "review"],
        "prefer_local_types": ["coding", "simple", "docs", "search", "analysis"],
        "description": "Balanced cost/quality, 70% local routing"
      }'
      ;;
    conservative)
      # 40% local - quality focused
      echo '{
        "local_threshold": 0.7,
        "force_api_types": ["planning", "review", "debugging"],
        "prefer_local_types": ["simple", "docs", "search"],
        "description": "Quality focused, 40% local routing"
      }'
      ;;
    api-only)
      # 0% local - current behavior
      echo '{
        "local_threshold": 1.0,
        "force_api_types": ["planning", "review", "debugging", "coding", "simple", "docs", "search", "analysis", "general"],
        "prefer_local_types": [],
        "description": "API only, no local routing"
      }'
      ;;
    local-only)
      # 100% local - for testing
      echo '{
        "local_threshold": 0.0,
        "force_api_types": [],
        "prefer_local_types": ["planning", "review", "debugging", "coding", "simple", "docs", "search", "analysis", "general"],
        "description": "Local only, no API calls"
      }'
      ;;
    *)
      log_warn "Unknown mode: $mode, using balanced"
      get_mode_config "balanced"
      ;;
  esac
}

# =============================================================================
# LOCAL LLM PROVIDERS
# =============================================================================

check_ollama() {
  curl -s --max-time 2 "${RALPH_LOCAL_ENDPOINT}/api/tags" >/dev/null 2>&1
}

check_lmstudio() {
  curl -s --max-time 2 "${RALPH_LOCAL_ENDPOINT}/v1/models" >/dev/null 2>&1
}

check_openai_compatible() {
  curl -s --max-time 2 "${RALPH_LOCAL_ENDPOINT}/v1/models" >/dev/null 2>&1
}

check_local_available() {
  case "$RALPH_LOCAL_PROVIDER" in
    ollama)
      check_ollama
      ;;
    lmstudio|vllm|openai)
      check_openai_compatible
      ;;
    *)
      return 1
      ;;
  esac
}

get_available_models_ollama() {
  local response
  response=$(curl -s "${RALPH_LOCAL_ENDPOINT}/api/tags" 2>/dev/null)
  
  if [ -n "$response" ]; then
    echo "$response" | jq -r '.models[].name' 2>/dev/null | head -20
  fi
}

get_available_models_openai() {
  local response
  response=$(curl -s "${RALPH_LOCAL_ENDPOINT}/v1/models" 2>/dev/null)
  
  if [ -n "$response" ]; then
    echo "$response" | jq -r '.data[].id' 2>/dev/null | head -20
  fi
}

# =============================================================================
# LOCAL LLM EXECUTION
# =============================================================================

query_ollama() {
  local model="$1"
  local prompt="$2"
  local system_prompt="${3:-You are a helpful coding assistant.}"
  
  local payload=$(jq -n \
    --arg model "$model" \
    --arg prompt "$prompt" \
    --arg system "$system_prompt" \
    '{
      model: $model,
      prompt: $prompt,
      system: $system,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 4096
      }
    }')
  
  local start_time=$(date +%s%3N)
  
  local response
  response=$(curl -s --max-time "$RALPH_LOCAL_TIMEOUT" \
    -X POST "${RALPH_LOCAL_ENDPOINT}/api/generate" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null)
  
  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))
  
  if [ -z "$response" ]; then
    echo '{"error": "No response from Ollama", "duration_ms": '$duration'}'
    return 1
  fi
  
  local output=$(echo "$response" | jq -r '.response // empty')
  local eval_count=$(echo "$response" | jq -r '.eval_count // 0')
  local prompt_eval_count=$(echo "$response" | jq -r '.prompt_eval_count // 0')
  
  jq -n \
    --arg output "$output" \
    --argjson input_tokens "$prompt_eval_count" \
    --argjson output_tokens "$eval_count" \
    --argjson duration "$duration" \
    '{
      output: $output,
      tokens: {input: $input_tokens, output: $output_tokens},
      duration_ms: $duration,
      provider: "ollama"
    }'
}

query_openai_compatible() {
  local model="$1"
  local prompt="$2"
  local system_prompt="${3:-You are a helpful coding assistant.}"
  
  local payload=$(jq -n \
    --arg model "$model" \
    --arg prompt "$prompt" \
    --arg system "$system_prompt" \
    '{
      model: $model,
      messages: [
        {role: "system", content: $system},
        {role: "user", content: $prompt}
      ],
      temperature: 0.7,
      max_tokens: 4096
    }')
  
  local start_time=$(date +%s%3N)
  
  local response
  response=$(curl -s --max-time "$RALPH_LOCAL_TIMEOUT" \
    -X POST "${RALPH_LOCAL_ENDPOINT}/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null)
  
  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))
  
  if [ -z "$response" ]; then
    echo '{"error": "No response from API", "duration_ms": '$duration'}'
    return 1
  fi
  
  local output=$(echo "$response" | jq -r '.choices[0].message.content // empty')
  local input_tokens=$(echo "$response" | jq -r '.usage.prompt_tokens // 0')
  local output_tokens=$(echo "$response" | jq -r '.usage.completion_tokens // 0')
  
  jq -n \
    --arg output "$output" \
    --argjson input_tokens "$input_tokens" \
    --argjson output_tokens "$output_tokens" \
    --argjson duration "$duration" \
    --arg provider "$RALPH_LOCAL_PROVIDER" \
    '{
      output: $output,
      tokens: {input: $input_tokens, output: $output_tokens},
      duration_ms: $duration,
      provider: $provider
    }'
}

query_local() {
  local model="$1"
  local prompt="$2"
  local system_prompt="$3"
  
  case "$RALPH_LOCAL_PROVIDER" in
    ollama)
      query_ollama "$model" "$prompt" "$system_prompt"
      ;;
    lmstudio|vllm|openai)
      query_openai_compatible "$model" "$prompt" "$system_prompt"
      ;;
    *)
      log_error "Unknown provider: $RALPH_LOCAL_PROVIDER"
      return 1
      ;;
  esac
}

# =============================================================================
# ROUTING DECISION
# =============================================================================

route_task() {
  local task_description="$1"
  local force_route="${2:-}"
  
  # Force routing if specified
  if [ -n "$force_route" ]; then
    echo "{\"route\":\"$force_route\",\"reason\":\"forced\"}"
    return 0
  fi
  
  # Classify the task
  local classification=$(classify_task "$task_description")
  local task_type=$(echo "$classification" | jq -r '.type')
  local preferred=$(echo "$classification" | jq -r '.preferred')
  local confidence=$(echo "$classification" | jq -r '.confidence')
  
  # Get mode configuration
  local mode_config=$(get_mode_config "$RALPH_HYBRID_MODE")
  local threshold=$(echo "$mode_config" | jq -r '.local_threshold')
  local force_api=$(echo "$mode_config" | jq -r '.force_api_types | contains(["'"$task_type"'"])')
  local prefer_local=$(echo "$mode_config" | jq -r '.prefer_local_types | contains(["'"$task_type"'"])')
  
  local route="api"
  local reason=""
  local model=""
  
  # Decision logic
  if [ "$force_api" = "true" ]; then
    route="api"
    reason="task_type_requires_api"
    case "$preferred" in
      opus) model="opus" ;;
      sonnet) model="sonnet" ;;
      *) model="sonnet" ;;
    esac
  elif [ "$prefer_local" = "true" ]; then
    # Check if local is available
    if check_local_available; then
      route="local"
      reason="task_type_prefers_local"
      case "$preferred" in
        local_fast) model="$RALPH_LOCAL_FAST_MODEL" ;;
        *) model="$RALPH_LOCAL_MODEL" ;;
      esac
    elif [ "$RALPH_FALLBACK_TO_API" = "true" ]; then
      route="api"
      reason="local_unavailable_fallback"
      model="haiku"
    else
      route="error"
      reason="local_unavailable_no_fallback"
    fi
  else
    # Hybrid decision based on confidence
    if [ "$(echo "$confidence < $threshold" | bc -l)" = "1" ]; then
      if check_local_available; then
        route="local"
        reason="confidence_below_threshold"
        model="$RALPH_LOCAL_MODEL"
      else
        route="api"
        reason="local_unavailable"
        model="sonnet"
      fi
    else
      route="api"
      reason="confidence_above_threshold"
      model="sonnet"
    fi
  fi
  
  jq -n \
    --arg route "$route" \
    --arg reason "$reason" \
    --arg model "$model" \
    --arg task_type "$task_type" \
    --argjson confidence "$confidence" \
    --arg mode "$RALPH_HYBRID_MODE" \
    '{
      route: $route,
      reason: $reason,
      model: $model,
      task_type: $task_type,
      confidence: $confidence,
      mode: $mode
    }'
}

# =============================================================================
# STATISTICS TRACKING
# =============================================================================

init_stats() {
  mkdir -p "$STATE_DIR"
  
  if [ ! -f "$HYBRID_STATS_FILE" ]; then
    cat > "$HYBRID_STATS_FILE" << 'EOF'
{
  "total_requests": 0,
  "local_requests": 0,
  "api_requests": 0,
  "local_tokens": {"input": 0, "output": 0},
  "api_tokens": {"input": 0, "output": 0},
  "estimated_savings": 0.0,
  "total_local_time_ms": 0,
  "total_api_time_ms": 0,
  "by_task_type": {},
  "by_model": {},
  "started": ""
}
EOF
  fi
}

record_request() {
  local route="$1"
  local task_type="$2"
  local model="$3"
  local input_tokens="$4"
  local output_tokens="$5"
  local duration_ms="$6"
  
  init_stats
  
  local savings=0
  if [ "$route" = "local" ]; then
    # Calculate what it would have cost on API
    savings=$(echo "scale=6; ($input_tokens * $COST_SONNET_INPUT / 1000) + ($output_tokens * $COST_SONNET_OUTPUT / 1000)" | bc)
  fi
  
  local tmp=$(mktemp)
  jq --arg route "$route" \
     --arg task_type "$task_type" \
     --arg model "$model" \
     --argjson input "$input_tokens" \
     --argjson output "$output_tokens" \
     --argjson duration "$duration_ms" \
     --argjson savings "$savings" \
     '
     .total_requests += 1 |
     if $route == "local" then
       .local_requests += 1 |
       .local_tokens.input += $input |
       .local_tokens.output += $output |
       .total_local_time_ms += $duration
     else
       .api_requests += 1 |
       .api_tokens.input += $input |
       .api_tokens.output += $output |
       .total_api_time_ms += $duration
     end |
     .estimated_savings += $savings |
     .by_task_type[$task_type] = ((.by_task_type[$task_type] // 0) + 1) |
     .by_model[$model] = ((.by_model[$model] // 0) + 1)
     ' "$HYBRID_STATS_FILE" > "$tmp" && mv "$tmp" "$HYBRID_STATS_FILE"
}

get_stats() {
  init_stats
  cat "$HYBRID_STATS_FILE"
}

# =============================================================================
# STATUS DISPLAY
# =============================================================================

show_status() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║          Ralph Ultra Hybrid LLM Router           ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  
  echo -e "${BLUE}Configuration:${NC}"
  echo "  Mode:           $RALPH_HYBRID_MODE"
  echo "  Provider:       $RALPH_LOCAL_PROVIDER"
  echo "  Endpoint:       $RALPH_LOCAL_ENDPOINT"
  echo "  Primary Model:  $RALPH_LOCAL_MODEL"
  echo "  Fast Model:     $RALPH_LOCAL_FAST_MODEL"
  echo "  Fallback:       $RALPH_FALLBACK_TO_API"
  echo ""
  
  # Check local availability
  echo -e "${BLUE}Local LLM Status:${NC}"
  if check_local_available; then
    log_ok "Local LLM is available"
    
    echo "  Available models:"
    case "$RALPH_LOCAL_PROVIDER" in
      ollama)
        get_available_models_ollama | while read -r model; do
          echo "    - $model"
        done
        ;;
      *)
        get_available_models_openai | while read -r model; do
          echo "    - $model"
        done
        ;;
    esac
  else
    log_warn "Local LLM is not available"
    echo "  Start your local LLM server:"
    case "$RALPH_LOCAL_PROVIDER" in
      ollama)
        echo "    ollama serve"
        echo "    ollama pull $RALPH_LOCAL_MODEL"
        ;;
      lmstudio)
        echo "    Open LM Studio and start the server"
        ;;
      *)
        echo "    Start your OpenAI-compatible server at $RALPH_LOCAL_ENDPOINT"
        ;;
    esac
  fi
  echo ""
  
  # Show mode configuration
  echo -e "${BLUE}Mode Configuration ($RALPH_HYBRID_MODE):${NC}"
  local mode_config=$(get_mode_config "$RALPH_HYBRID_MODE")
  echo "  $(echo "$mode_config" | jq -r '.description')"
  echo "  Force API for:   $(echo "$mode_config" | jq -r '.force_api_types | join(", ")')"
  echo "  Prefer Local for: $(echo "$mode_config" | jq -r '.prefer_local_types | join(", ")')"
  echo ""
  
  # Show statistics
  if [ -f "$HYBRID_STATS_FILE" ]; then
    local stats=$(get_stats)
    local total=$(echo "$stats" | jq -r '.total_requests')
    
    if [ "$total" -gt 0 ]; then
      local local_req=$(echo "$stats" | jq -r '.local_requests')
      local api_req=$(echo "$stats" | jq -r '.api_requests')
      local savings=$(echo "$stats" | jq -r '.estimated_savings')
      local local_pct=$((local_req * 100 / total))
      
      echo -e "${BLUE}Statistics:${NC}"
      echo "  Total Requests:   $total"
      echo "  Local:            $local_req ($local_pct%)"
      echo "  API:              $api_req ($((100 - local_pct))%)"
      echo -e "  Estimated Savings: ${GREEN}\$$(printf '%.2f' "$savings")${NC}"
      echo ""
      
      echo "  By Task Type:"
      echo "$stats" | jq -r '.by_task_type | to_entries[] | "    \(.key): \(.value)"'
      echo ""
    fi
  fi
}

# =============================================================================
# BENCHMARK
# =============================================================================

run_benchmark() {
  echo ""
  echo -e "${CYAN}Running Hybrid LLM Benchmark${NC}"
  echo "=============================="
  echo ""
  
  if ! check_local_available; then
    log_error "Local LLM not available. Start your server first."
    return 1
  fi
  
  local test_prompts=(
    "Write a function to calculate fibonacci numbers"
    "Fix the typo in this variable name: usr_nmae"
    "Design a microservices architecture for an e-commerce platform"
    "Add JSDoc comments to this function"
    "Review this code for security vulnerabilities"
  )
  
  local test_types=(
    "coding"
    "simple"
    "planning"
    "docs"
    "review"
  )
  
  echo "Testing with $RALPH_LOCAL_MODEL..."
  echo ""
  
  for i in "${!test_prompts[@]}"; do
    local prompt="${test_prompts[$i]}"
    local expected_type="${test_types[$i]}"
    
    echo -n "  [$expected_type] "
    
    local routing=$(route_task "$prompt")
    local route=$(echo "$routing" | jq -r '.route')
    local model=$(echo "$routing" | jq -r '.model')
    
    if [ "$route" = "local" ]; then
      echo -n "→ LOCAL ($model) "
      local start=$(date +%s%3N)
      local result=$(query_local "$model" "$prompt" 2>/dev/null)
      local end=$(date +%s%3N)
      local duration=$((end - start))
      
      if echo "$result" | jq -e '.output' >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} ${duration}ms"
      else
        echo -e "${RED}✗${NC} Failed"
      fi
    else
      echo -e "→ API ($model) ${YELLOW}(skipped in benchmark)${NC}"
    fi
  done
  
  echo ""
  log_ok "Benchmark complete"
}

# =============================================================================
# MAIN QUERY FUNCTION
# =============================================================================

execute_query() {
  local prompt="$1"
  local task_hint="${2:-}"
  local system_prompt="${3:-You are a helpful coding assistant. Be concise and accurate.}"
  
  # Route the task
  local routing=$(route_task "$prompt" "$task_hint")
  local route=$(echo "$routing" | jq -r '.route')
  local model=$(echo "$routing" | jq -r '.model')
  local task_type=$(echo "$routing" | jq -r '.task_type')
  local reason=$(echo "$routing" | jq -r '.reason')
  
  log_hybrid "Route: $route | Model: $model | Type: $task_type | Reason: $reason"
  
  local result=""
  
  if [ "$route" = "local" ]; then
    log_local "Executing on $RALPH_LOCAL_PROVIDER ($model)..."
    result=$(query_local "$model" "$prompt" "$system_prompt")
    
    if [ -z "$result" ] || echo "$result" | jq -e '.error' >/dev/null 2>&1; then
      if [ "$RALPH_FALLBACK_TO_API" = "true" ]; then
        log_warn "Local failed, falling back to API"
        route="api"
        model="haiku"
        # Note: API execution would go here
        result='{"error": "API fallback not implemented in standalone mode"}'
      fi
    fi
  elif [ "$route" = "api" ]; then
    log_api "Would execute on Claude API ($model)"
    result='{"note": "API execution handled by main Ralph process", "model": "'$model'"}'
  else
    result='{"error": "Unknown route: '$route'"}'
  fi
  
  # Record statistics
  local input_tokens=$(echo "$result" | jq -r '.tokens.input // 0')
  local output_tokens=$(echo "$result" | jq -r '.tokens.output // 0')
  local duration=$(echo "$result" | jq -r '.duration_ms // 0')
  
  record_request "$route" "$task_type" "$model" "$input_tokens" "$output_tokens" "$duration"
  
  # Return result with routing info
  echo "$result" | jq --argjson routing "$routing" '. + {routing: $routing}'
}

# =============================================================================
# USAGE
# =============================================================================

show_usage() {
  cat << 'EOF'
Ralph Ultra Hybrid LLM Router - 80/20 Local/API cost optimization

Usage: ralph-hybrid.sh [command] [options]

Commands:
  --status, -s        Show status and configuration
  --route TASK        Show routing decision for a task
  --query PROMPT      Execute a query using hybrid routing
  --benchmark         Run performance benchmark
  --stats             Show usage statistics
  --reset-stats       Reset usage statistics
  --help, -h          Show this help

Environment Variables:
  RALPH_HYBRID_MODE        Routing mode: aggressive|balanced|conservative|api-only|local-only
  RALPH_LOCAL_PROVIDER     Provider: ollama|lmstudio|vllm|openai
  RALPH_LOCAL_ENDPOINT     API endpoint (default: http://localhost:11434)
  RALPH_LOCAL_MODEL        Primary model for complex tasks
  RALPH_LOCAL_FAST_MODEL   Fast model for simple tasks
  RALPH_FALLBACK_TO_API    Fallback to API if local fails (true|false)
  RALPH_LOCAL_TIMEOUT      Request timeout in seconds (default: 120)

Hybrid Modes:
  aggressive    90% local - Maximum savings, may sacrifice quality
  balanced      70% local - Best cost/quality tradeoff (default)
  conservative  40% local - Quality focused, local only for trivial tasks
  api-only       0% local - Current behavior, no local routing
  local-only   100% local - For testing, never use API

Task Classification:
  planning      → Always API (Opus) - Architecture, design, PRDs
  review        → Always API (Opus) - Code review, security
  debugging     → Usually API (Sonnet) - Complex debugging
  coding        → Usually Local - Implementation, refactoring
  simple        → Always Local (Fast) - Typos, formatting, renames
  docs          → Usually Local - Documentation, comments
  search        → Always Local (Fast) - File search, grep

Examples:
  ralph-hybrid.sh --status
  ralph-hybrid.sh --route "implement a login function"
  ralph-hybrid.sh --query "write a fibonacci function"
  RALPH_HYBRID_MODE=aggressive ralph-hybrid.sh --status

Recommended Local Models:
  Ollama:
    - qwen2.5-coder:32b    (best quality, needs 20GB+ VRAM)
    - qwen2.5-coder:14b    (good balance)
    - qwen2.5-coder:7b     (fast, for simple tasks)
    - deepseek-coder-v2    (excellent for code)
    - codellama:34b        (good alternative)
  
  LM Studio / vLLM:
    - Qwen/Qwen2.5-Coder-32B-Instruct
    - deepseek-ai/DeepSeek-Coder-V2-Instruct

EOF
}

# =============================================================================
# MAIN
# =============================================================================

main() {
  local cmd="${1:---status}"
  
  case "$cmd" in
    --status|-s)
      show_status
      ;;
    --route)
      if [ -z "$2" ]; then
        log_error "Usage: ralph-hybrid.sh --route 'task description'"
        exit 1
      fi
      route_task "$2" | jq .
      ;;
    --query)
      if [ -z "$2" ]; then
        log_error "Usage: ralph-hybrid.sh --query 'prompt'"
        exit 1
      fi
      execute_query "$2" "${3:-}" "${4:-}"
      ;;
    --benchmark)
      run_benchmark
      ;;
    --stats)
      get_stats | jq .
      ;;
    --reset-stats)
      rm -f "$HYBRID_STATS_FILE"
      init_stats
      log_ok "Statistics reset"
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
