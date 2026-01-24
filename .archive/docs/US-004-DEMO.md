# US-004 Demo: CLI Health Check in Action

## Overview
This demo shows how the CLI health check feature prevents execution failures by detecting broken CLIs and automatically falling back to working alternatives.

## Scenario 1: Normal Operation (CLI Healthy)

### Setup
- Claude CLI is installed and working
- PRD specifies `"cli": "claude"`

### Execution Flow
```
1. detectAICLI() called
2. Checks PRD: cli = "claude" ✓
3. Runs: which claude ✓
4. Health check: claude --version ✓
5. Cache result: { cli: "claude", healthy: true, checkedAt: 1706035200000 }
6. Returns: "claude"
7. Story execution begins with claude
```

### Logs
```
[INFO] Using project CLI override: claude
[INFO] CLI health check: claude is healthy
[INFO] ═══ Starting US-004: CLI health check before execution ═══
[INFO] Using CLI: claude
```

### Result
✓ Story executes successfully with healthy CLI

---

## Scenario 2: CLI Installed But Broken

### Setup
- Claude CLI is installed but not authenticated/broken
- PRD specifies `"cli": "claude"`, `"cliFallbackOrder": ["opencode", "codex"]`
- Opencode CLI is installed and working

### Execution Flow
```
1. detectAICLI() called
2. Checks PRD: cli = "claude" ✓
3. Runs: which claude ✓
4. Health check: claude --version ✗ (exits with error)
5. Cache result: { cli: "claude", healthy: false, checkedAt: 1706035200000 }
6. Logs warning about broken CLI
7. Tries fallback chain from PRD
8. Checks: opencode ✓
9. Health check: opencode --version ✓
10. Cache result: { cli: "opencode", healthy: true, checkedAt: 1706035200000 }
11. Returns: "opencode"
12. Story execution begins with opencode
```

### Logs
```
[WARN] PRD specifies CLI 'claude' but it failed health check, falling back
[WARN] CLI 'claude' is installed but not working, falling back...
[INFO] CLI health check: Testing opencode...
[INFO] CLI health check: opencode is healthy
[INFO] Fallback: Using opencode from project fallback chain
[INFO] Falling back to alternative CLI: opencode (from project configuration)
[INFO] ═══ Starting US-004: CLI health check before execution ═══
[INFO] Using CLI: opencode
```

### Result
✓ Story executes successfully with fallback CLI
✓ User informed about CLI issue
✓ No manual intervention required

---

## Scenario 3: Cache Prevents Repeated Checks

### Setup
- Multiple stories to execute
- Claude CLI is healthy

### Execution Flow

**Story 1 (First execution)**
```
1. Health check runs: claude --version ✓
2. Cache stored: { cli: "claude", healthy: true, checkedAt: 1706035200000 }
3. Story 1 executes with claude
```

**Story 2 (1 minute later)**
```
1. Check cache: Found cached result (age: 60 seconds < 300 seconds TTL) ✓
2. Skip health check (uses cached result)
3. Story 2 executes with claude
[DEBUG] CLI health check: claude cached result = true
```

**Story 3 (6 minutes later)**
```
1. Check cache: Found cached result (age: 360 seconds > 300 seconds TTL) ✗
2. Run health check: claude --version ✓
3. Update cache: { cli: "claude", healthy: true, checkedAt: 1706035560000 }
4. Story 3 executes with claude
[INFO] CLI health check: claude is healthy
```

### Result
✓ Reduced overhead: Only 2 health checks for 3 stories
✓ Performance optimized with intelligent caching

---

## Scenario 4: All CLIs in Fallback Chain Fail

### Setup
- PRD specifies `"cli": "claude"`, `"cliFallbackOrder": ["opencode", "codex"]`
- Claude: installed but broken
- Opencode: installed but broken
- Codex: not installed
- Gemini: installed and working (auto-detect)

### Execution Flow
```
1. detectAICLI() called
2. Try PRD CLI: claude ✗ (health check fails)
3. Try fallback[0]: opencode ✗ (health check fails)
4. Try fallback[1]: codex ✗ (not installed)
5. Fallback chain exhausted
6. Fall back to Priority 3: Auto-detection
7. Try auto-detect: claude ✗ (cached failed result)
8. Try auto-detect: opencode ✗ (cached failed result)
9. Try auto-detect: codex ✗ (not installed)
10. Try auto-detect: gemini ✓ (health check passes)
11. Returns: "gemini"
```

### Logs
```
[WARN] PRD specifies CLI 'claude' but it failed health check, falling back
[WARN] CLI 'claude' is installed but not working, falling back...
[WARN] Fallback chain: opencode found but failed health check, trying next option
[WARN] CLI 'opencode' is installed but not working, trying next option...
[DEBUG] Fallback chain: codex not available, trying next option
[WARN] No CLI found in project fallback chain
[DEBUG] Auto-detect: claude found but failed health check, trying next
[DEBUG] Auto-detect: opencode found but failed health check, trying next
[INFO] CLI health check: gemini is healthy
[INFO] Auto-detected CLI: gemini
```

### Result
✓ Eventually finds working CLI through auto-detection
✓ User sees clear progression through fallback attempts

---

## Scenario 5: CLI Becomes Unhealthy Mid-Execution

### Setup
- Cache TTL: 5 minutes
- Claude CLI works initially, then breaks (e.g., auth expires)

### Execution Flow

**Story 1 (T=0 minutes)**
```
Health check: claude --version ✓
Cache: healthy
Story 1 executes successfully
```

**Story 2 (T=2 minutes, Claude auth expires)**
```
Cache hit (age: 2 min < 5 min TTL)
Uses cached healthy result
Story 2 executes with claude → May fail during execution
```

**Story 3 (T=7 minutes)**
```
Cache expired (age: 7 min > 5 min TTL)
Health check: claude --version ✗
Cache: unhealthy
Falls back to next CLI
Story 3 executes successfully with fallback
```

### Result
✓ Broken CLI detected within 5 minutes
✓ Automatic recovery without user intervention
⚠ Cache may allow 1-2 stories to fail before detecting issue
   (This is acceptable - 5 minute TTL balances performance vs detection speed)

---

## Testing the Feature

### Manual Test 1: Simulate Broken CLI
```bash
# Create a broken "fake-claude" that fails health check
echo '#!/bin/bash\nexit 1' > /tmp/fake-claude
chmod +x /tmp/fake-claude
export PATH="/tmp:$PATH"

# Ralph will detect fake-claude fails health check and use fallback
```

### Manual Test 2: Verify Cache TTL
```bash
# Check cache implementation
grep "CLI_HEALTH_CACHE_TTL" src/utils/ralph-service.ts
# Output: const CLI_HEALTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

### Automated Test
```bash
# Run comprehensive test suite
./test-cli-health-check.sh

# Expected output:
# ✓ Test 1: Health check function exists
# ✓ Test 2: Health check called in detectAICLI flow
# ✓ Test 3: Health check results are cached
# ✓ Test 4: Failed health check triggers fallback
# ✓ Test 5: Cache TTL is 5 minutes
# ✓ Test 6: TypeScript compilation
```

---

## Key Benefits Demonstrated

1. **Fail Fast**: Detects broken CLIs before starting work
2. **Automatic Recovery**: Falls back to working alternatives
3. **Performance**: Caching prevents repeated checks
4. **User Visibility**: Clear logs explain what's happening
5. **Defensive**: Multiple fallback layers prevent total failure

## Implementation Quality

- ✓ Follows existing codebase patterns
- ✓ Type-safe implementation
- ✓ Comprehensive error handling
- ✓ Intelligent caching strategy
- ✓ Clear user feedback
- ✓ Zero breaking changes
