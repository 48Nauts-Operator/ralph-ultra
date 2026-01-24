# US-004: CLI Health Check Flow Diagram

## Overview

This diagram shows how the health check integrates with CLI selection and fallback logic.

## CLI Selection with Health Check Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Start Story Execution                       │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    detectAICLI() Called                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │    Priority 1: Check PRD Override       │
        │    (prd.cli field in prd.json)          │
        └──────────────────┬──────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   CLI specified?      │
              └───────┬───────────────┘
                  YES │         │ NO
                      ▼         │
        ┌─────────────────────┐ │
        │  which <cli>        │ │
        │  (check installed)  │ │
        └──────┬──────────────┘ │
           YES │     │ NO       │
               ▼     │          │
        ┌──────────────────┐   │
        │ checkCLIHealth() │   │
        │                  │   │
        │ ┌──────────────┐ │   │
        │ │ Cache check? │ │   │
        │ └──────┬───────┘ │   │
        │   HIT  │  MISS   │   │
        │    │   │   │     │   │
        │    │   ▼   ▼     │   │
        │    │ ┌────────┐  │   │
        │    │ │ Run    │  │   │
        │    │ │ --ver  │  │   │
        │    │ │ 3s max │  │   │
        │    │ └───┬────┘  │   │
        │    │  OK │ FAIL  │   │
        │    └────┬─┘  │   │   │
        │         ▼    │   │   │
        │      ┌───────┴─┐ │   │
        │      │ Cached  │ │   │
        │      │ 5 min   │ │   │
        │      └─────────┘ │   │
        └─────────┬────────┘   │
            PASS  │  FAIL      │
                  │  │          │
                  │  ▼          │
                  │  ┌──────────────────────┐
                  │  │ Try prd.cliFallback  │
                  │  │ Order if configured  │
                  │  └──────────┬───────────┘
                  │             │ (recursive)
                  │             │
        ┌─────────┴─────────────┴─────────────────────┐
        │                                              │
        ▼                                              │
┌───────────────┐                                     │
│  Return CLI   │                                     │
│  ✓ Verified   │                                     │
└───────────────┘                                     │
                                                      │
                                                      ▼
        ┌─────────────────────────────────────────────┐
        │    Priority 2: Check Global Settings        │
        │    (preferredCli in ~/.config/ralph-ultra)  │
        └──────────────────┬──────────────────────────┘
                          │
                    [Same flow as Priority 1]
                          │
                          ▼
        ┌─────────────────────────────────────────────┐
        │    Priority 3: Auto-detect Available CLI    │
        │    Loop through: claude, opencode, ...      │
        └──────────────────┬──────────────────────────┘
                          │
                          ▼
            ┌─────────────────────────┐
            │  for each CLI option:   │
            │  1. Check if installed  │
            │  2. Run health check    │
            │  3. Return first pass   │
            └─────────────┬───────────┘
                      YES │    │ NO
                          ▼    ▼
                    ┌────────────────┐
                    │  CLI found     │
                    │  ✓ Verified    │
                    └────────────────┘
                                │ None found
                                ▼
                        ┌───────────────┐
                        │  Error: No    │
                        │  working CLI  │
                        └───────────────┘
```

## Fallback Chain with Health Check

```
┌────────────────────────────────────────────────────────────────┐
│                  tryFallbackChain() Called                      │
│  Input: ["claude", "opencode", "codex"]                        │
└───────────────────────┬────────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────────┐
        │  For each CLI in fallback order:  │
        └───────────┬───────────────────────┘
                    │
                    ▼
        ┌────────────────────────┐
        │  Validate CLI name     │
        │  (whitelist check)     │
        └────────┬───────────────┘
             OK  │  INVALID
                 │  │
                 │  └──▶ Skip, log warning
                 │
                 ▼
        ┌────────────────────────┐
        │  which <cli>           │
        │  (check if installed)  │
        └────────┬───────────────┘
          FOUND  │  NOT FOUND
                 │  │
                 │  └──▶ Continue to next
                 │
                 ▼
        ┌────────────────────────┐
        │  checkCLIHealth(cli)   │
        └────────┬───────────────┘
          PASS   │  FAIL
                 │  │
                 │  │  ┌───────────────────────────┐
                 │  └─▶│ Log: "found but failed   │
                 │     │  health check, trying     │
                 │     │  next option"             │
                 │     └───────────────────────────┘
                 │          │
                 │          └──▶ Continue to next
                 │
                 ▼
        ┌────────────────────────┐
        │  Return CLI            │
        │  ✓ Installed           │
        │  ✓ Health check passed │
        └────────────────────────┘
```

## Health Check Cache Flow

```
┌────────────────────────────────────────────────────────────────┐
│                  checkCLIHealth(cli) Called                     │
└───────────────────────┬────────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  Check cache                  │
        │  cliHealthCache.get(cli)      │
        └───────────┬───────────────────┘
                YES │    │ NO / EXPIRED
                    │    │
        ┌───────────┘    └──────────────┐
        │                                │
        ▼                                ▼
┌────────────────────┐     ┌─────────────────────────┐
│  Cache Hit         │     │  Cache Miss/Expired     │
│                    │     │                         │
│  Age < 5 min?      │     │  Run Health Test:       │
│  └─ YES: Return    │     │  1. execSync            │
│          cached    │     │     `${cli} --version`  │
│          result    │     │  2. timeout: 3000ms     │
│                    │     │  3. stdio: 'pipe'       │
│  Log: "cached      │     │                         │
│       result = X"  │     │  Success?               │
└────────────────────┘     │  ├─ YES: healthy=true   │
                           │  └─ NO:  healthy=false  │
                           │                         │
                           │  Update cache:          │
                           │  cliHealthCache.set()   │
                           │                         │
                           │  Log result             │
                           └────────┬────────────────┘
                                    │
                                    ▼
                        ┌────────────────────────┐
                        │  Return health status  │
                        │  (true/false)          │
                        └────────────────────────┘

Cache Entry Structure:
┌──────────────────────┐
│ CLIHealthCache       │
├──────────────────────┤
│ cli: string          │  ← CLI name ("claude")
│ healthy: boolean     │  ← Health status
│ checkedAt: number    │  ← Timestamp (ms)
└──────────────────────┘

TTL: 5 minutes (300,000ms)
```

## User Experience Timeline

```
Time  Action                                      User Sees
──────────────────────────────────────────────────────────────
T+0   Ralph starts story execution               Starting...
T+1   detectAICLI() called                       
T+2   Check PRD override: "claude"               
T+3   which claude → found                       
T+4   checkCLIHealth("claude")                   
      ├─ Cache miss                              
      └─ Run: claude --version                   
T+5   ├─ Timeout after 3s                        [WARN] CLI 'claude' is 
      └─ Health check FAILED                     installed but not working
T+6   Try PRD fallback: "opencode"               [INFO] Falling back to
T+7   checkCLIHealth("opencode")                 alternative CLI: opencode
      ├─ Cache miss                              
      └─ Run: opencode --version                 
T+8   └─ Success! Health check PASSED            
T+9   Use opencode for execution                 Using CLI: opencode
      
... 4 minutes later ...

T+4m  Another story starts                       Starting next story...
T+4m+1 checkCLIHealth("opencode")                
       ├─ Cache HIT (4m old)                     
       └─ Return cached: healthy                 Using CLI: opencode
T+4m+2 Use opencode immediately                  
       (No delay for health check!)              
```

## Integration with Existing Features

```
┌─────────────────────────────────────────────────────────────────┐
│                    Feature Integration Map                       │
└─────────────────────────────────────────────────────────────────┘

US-002: CLI Override
├─ PRD specifies CLI
└─ Health check validates → PASS/FAIL → Fallback

US-003: CLI Fallback  
├─ Fallback chain configured
├─ Each candidate health checked
└─ First healthy CLI selected

US-004: CLI Health Check (This Story)
├─ Validates CLI before use
├─ Caches results (5 min)
└─ Triggers fallback on failure

Story Execution
├─ detectAICLI() gets CLI
│  └─ Health check integrated
├─ runStoryInternal() uses CLI
└─ Tmux session with verified CLI
```

## Error Scenarios

### Scenario 1: Preferred CLI Broken
```
User has: preferredCli = "claude"
Reality: Claude installed but not working

Flow:
1. detectAICLI() tries "claude"
2. which claude → ✓ found
3. checkCLIHealth("claude") → ✗ failed
4. Log: "Preferred CLI 'claude' failed health check"
5. Try global fallback chain
6. Find working CLI or error
```

### Scenario 2: All CLIs Fail Health Check
```
Installed: claude, opencode
Health: both fail --version test

Flow:
1. Try claude → health check fails
2. Try opencode → health check fails
3. Try codex → not installed
4. ... try remaining CLIs ...
5. Error: "No AI CLI found"
```

### Scenario 3: Temporary Network Issue
```
First attempt: Health check fails (network issue)
Result: Cached as unhealthy for 5 minutes
Second attempt (3 min later): Still cached as unhealthy
Third attempt (6 min later): Cache expired, test again
Result: Network fixed, health check passes
```

## Performance Impact

```
Scenario                 Before          After       Delta
─────────────────────────────────────────────────────────────
Fresh start (cache miss) 0ms            ~50ms       +50ms
Cached result            0ms            ~0.1ms      +0.1ms
Failed CLI (no fallback) Instant fail   +3s timeout +3s
Failed CLI (w/ fallback) Instant fail   +3s + check +3s + 50ms
Multiple stories         N/A            Cached      No delay

Overall: Minimal impact with caching, prevents broken CLI usage
```

## Key Insights

1. **Cache-First Strategy**: Minimizes performance impact
2. **Fail-Fast**: 3-second timeout prevents hanging
3. **Graceful Degradation**: Automatic fallback on failure
4. **User Transparency**: Clear messages about CLI status
5. **Security**: No user input to shell, timeout protection
