# Per-Project CLI Override Feature

## Overview
Ralph Ultra now supports per-project CLI overrides through the `prd.json` file. This allows different projects to use different AI assistants based on their specific needs.

## Usage

### Setting a Project CLI Override
Add a `cli` field to your project's `prd.json`:

```json
{
  "project": "My Anthropic Project",
  "description": "A project that requires Claude",
  "branchName": "feature/my-feature",
  "cli": "claude",
  "userStories": [...]
}
```

### Supported CLI Values
- `claude` - Anthropic's Claude CLI
- `codex` - OpenAI's Codex CLI
- `opencode` - OpenCode CLI
- `gemini` - Google's Gemini CLI
- `aider` - Aider CLI
- `cody` - Sourcegraph Cody CLI

## Priority System

Ralph Ultra uses a 3-tier priority system for CLI selection:

1. **Priority 1: Project Override** (prd.json `cli` field)
   - Highest priority
   - Useful when specific projects require specific AI capabilities

2. **Priority 2: Global Settings** (user preferences)
   - Set via settings panel or config file
   - Your default preferred CLI

3. **Priority 3: Auto-detection**
   - Falls back to first available CLI
   - Checks in order: claude, opencode, codex, gemini, aider, cody

## Visual Indicators

### StatusBar
When a project CLI override is active, the StatusBar shows:
```
CLI:claude*
```
The asterisk (*) indicates this is a project-specific override.

### WorkPane Status View
The status view shows:
```
AI CLI: claude (project override)
```

## Example Use Cases

### Case 1: OpenAI Project
A project using OpenAI's APIs might prefer Codex:
```json
{
  "project": "OpenAI Integration",
  "cli": "codex",
  ...
}
```

### Case 2: Anthropic Project
A project using Claude APIs might prefer Claude CLI:
```json
{
  "project": "Claude Integration",
  "cli": "claude",
  ...
}
```

### Case 3: Multi-Model Project
Use different CLIs for different features by creating separate PRDs with different CLI settings.

## Implementation Details

### Code Location: src/utils/ralph-service.ts
```typescript
private detectAICLI(): string | null {
  const cliOptions = ['claude', 'opencode', 'codex', 'gemini', 'aider', 'cody'];

  // Priority 1: Check PRD for project-specific CLI override
  const prd = this.loadPRD();
  if (prd?.cli && cliOptions.includes(prd.cli)) {
    try {
      execSync(`which ${prd.cli}`, { stdio: 'pipe' });
      this.log('INFO', `Using project CLI override: ${prd.cli}`);
      return prd.cli;
    } catch {
      this.log('WARN', `PRD specifies CLI '${prd.cli}' but it's not installed, falling back`);
    }
  }

  // Priority 2: Check global settings for preferred CLI
  // ... (fallback to global settings)

  // Priority 3: Auto-detect first available CLI
  // ... (fallback to auto-detection)
}
```

## Fallback Behavior

If the specified CLI is not installed, Ralph Ultra:
1. Logs a warning: "PRD specifies CLI 'X' but it's not installed, falling back"
2. Falls back to Priority 2 (global settings)
3. If that fails, falls back to Priority 3 (auto-detection)

This ensures the system always finds a working CLI if one is available.

## Benefits

- **Flexibility**: Different projects can use different AI assistants
- **Consistency**: Project teams can standardize on specific CLIs
- **Convenience**: No need to manually switch CLIs between projects
- **Transparency**: Clear visual indicators show which CLI is active and why

## Testing

All acceptance criteria pass:
- ✓ PRD type includes optional cli field
- ✓ RalphService reads cli from PRD when present
- ✓ Project CLI override takes precedence over global setting
- ✓ Current effective CLI displayed in StatusBar and WorkPane
