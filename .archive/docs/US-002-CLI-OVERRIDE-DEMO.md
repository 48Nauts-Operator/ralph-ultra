# US-002: Per-Project CLI Override - Feature Demo

## Overview
This feature allows projects to specify their preferred AI CLI in the `prd.json` file using a `cli` field. This overrides the global setting for that specific project.

## Use Case
Different projects may require different AI capabilities:
- OpenAI projects → use `codex` CLI
- Anthropic projects → use `claude` CLI
- General projects → use `aider` CLI

## Usage Example

### Add CLI field to prd.json
```json
{
  "project": "my-anthropic-project",
  "description": "A project using Claude AI",
  "branchName": "feature/new-feature",
  "cli": "claude",
  "userStories": [...]
}
```

### What Happens
The TUI will automatically:
1. ✅ Read the `cli` field from prd.json
2. ✅ Verify `claude` is installed
3. ✅ Use `claude` instead of global setting
4. ✅ Display "CLI:claude*" in StatusBar (asterisk indicates override)
5. ✅ Show "(project override)" in Status view

### Visual Indicators
- **StatusBar**: `CLI:claude*` (accent color + asterisk)
- **Status View**: `AI CLI: claude (project override)`
- **Monitor View**: `CLI:claude*`

## Implementation Summary

### Type System (src/types/index.ts)
- Added `cli?: string` to PRD interface
- Added `isProjectCLIOverride?: boolean` to TabState interface

### Service Layer (src/utils/ralph-service.ts)
3-tier priority system:
1. **Priority 1**: PRD CLI override (if specified and installed)
2. **Priority 2**: Global preferred CLI setting
3. **Priority 3**: Auto-detect first available CLI

Method `isProjectCLIOverride()` detects if active CLI is from PRD.

### UI Integration
- **StatusBar**: Shows `CLI:name*` with accent color when override active
- **WorkPane Status**: Shows "(project override)" text
- **WorkPane Monitor**: Shows asterisk next to CLI name
- **useTabs Hook**: Propagates override flag from service to tab state

## Supported CLIs
- `claude` - Anthropic Claude CLI
- `opencode` - OpenAI Code CLI
- `codex` - OpenAI Codex CLI
- `gemini` - Google Gemini CLI
- `aider` - Aider AI CLI
- `cody` - Sourcegraph Cody CLI

## Fallback Behavior
If specified CLI is not installed:
1. ⚠️ Warning logged to ralph-ultra.log
2. 🔄 Falls back to global preferred CLI
3. 🔄 If global not set, auto-detects first available
4. ❌ If no CLI found, shows error

## Benefits
✅ **Project-specific optimization**: Use the best CLI for each project
✅ **Team consistency**: Everyone uses same CLI for a project
✅ **Clear visibility**: Visual indicators show when override is active
✅ **Safe fallback**: Graceful degradation if CLI not installed
✅ **No breaking changes**: Existing projects work as before

## Testing
Run comprehensive test suite:
```bash
./test-cli-override-comprehensive.sh
```

All 15 tests pass, covering:
- Type system correctness ✅
- Service layer priority logic ✅
- Override detection accuracy ✅
- UI integration and display ✅
- Hook integration ✅
- TypeScript compilation ✅
- End-to-end data flow ✅
