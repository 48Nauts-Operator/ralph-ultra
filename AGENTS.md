# Ralph Ultra - Agent Guidelines

## Project Overview

Ralph Ultra 2.0 is a **TypeScript-based Terminal UI** for monitoring and controlling autonomous coding agents.
Built with Bun, TypeScript, and Ink (React for terminals), it provides a premium developer experience
with PRD-based workflows, multi-tab support, themes, and remote control via Tailscale.

**Status:** Beta
**Repository:** https://github.com/48Nauts-Operator/ralph-ultra

**Documentation:** `/Users/jarvis/Knowledge/Obsidian/Business/NautCoder/Development/Tools/Ralph-Ultra/`

### Documentation Structure

```
/Users/jarvis/Knowledge/Obsidian/Business/NautCoder/Development/Tools/Ralph-Ultra/
├── 00-Ideation/           # Product goals and vision
├── 01-Research/           # Research findings and competitor analysis
│   └── 2026-01-21_Autonomous-Coding-Agents-Research.md  # 30+ agent repos analyzed
├── 02-Planning/           # Project planning details
├── 03-Blueprint/          # Architecture and sequence diagrams
├── 04-Implementation/     # Code implementation details and progress
└── 05-User-Docs/          # User documentation
```

## PRD Format (CRITICAL)

When creating a PRD for Ralph Ultra, **you MUST use this exact format** with **testable acceptance criteria**:

```json
{
  "project": "project-name",
  "description": "Brief project description",
  "branchName": "ralph/project-name",
  "userStories": [
    {
      "id": "US-001",
      "title": "Short title for the story",
      "description": "Detailed description of what needs to be done",
      "acceptanceCriteria": [
        {
          "id": "AC-001-1",
          "text": "Description of what should be true",
          "testCommand": "shell command that exits 0 if passing",
          "passes": false,
          "lastRun": null
        },
        {
          "id": "AC-001-2",
          "text": "Another criterion",
          "testCommand": "grep -q 'pattern' src/file.ts",
          "passes": false,
          "lastRun": null
        }
      ],
      "complexity": "simple|medium|complex",
      "passes": false
    }
  ]
}
```

### Testable Acceptance Criteria (RECOMMENDED)

Each acceptance criterion should have a `testCommand` that Ralph can execute to verify the work:

| Field         | Type         | Description                                    |
| ------------- | ------------ | ---------------------------------------------- |
| `id`          | string       | Unique ID (e.g., "AC-001-1")                   |
| `text`        | string       | Human-readable description                     |
| `testCommand` | string       | Shell command that exits 0 if criterion is met |
| `passes`      | boolean      | Set by Ralph after test runs                   |
| `lastRun`     | string\|null | ISO timestamp of last test execution           |

**Good testCommand examples:**

```bash
# Check file exists
"test -f src/utils/helper.ts"

# Check code contains pattern
"grep -q 'export function myFunc' src/index.ts"

# Check type compiles
"bun run typecheck"

# Check test passes
"bun test src/utils/helper.test.ts"

# Multiple conditions
"grep -q 'pattern1' file.ts && grep -q 'pattern2' file.ts"
```

### Simple Acceptance Criteria (Legacy)

For simpler PRDs, you can still use string arrays (but no auto-verification):

```json
"acceptanceCriteria": [
  "User can log in with email",
  "Error message shown for invalid credentials"
]
```

### Required Fields

| Field                              | Type    | Description                                                        |
| ---------------------------------- | ------- | ------------------------------------------------------------------ |
| `project`                          | string  | Project name                                                       |
| `userStories`                      | array   | List of user stories                                               |
| `userStories[].id`                 | string  | Unique ID (e.g., "US-001")                                         |
| `userStories[].title`              | string  | Short descriptive title                                            |
| `userStories[].description`        | string  | What needs to be implemented                                       |
| `userStories[].acceptanceCriteria` | array   | List of acceptance criteria (testable or simple)                   |
| `userStories[].passes`             | boolean | **MUST be `false` initially** - Ralph sets to `true` when verified |

### Optional Fields

| Field                      | Type   | Default         | Description                     |
| -------------------------- | ------ | --------------- | ------------------------------- |
| `description`              | string | -               | Project description             |
| `branchName`               | string | ralph/{project} | Git branch name                 |
| `userStories[].complexity` | string | "medium"        | simple/medium/complex (for ETA) |
| `userStories[].priority`   | number | -               | Execution order (lower = first) |

### How Ralph Uses PRD (Verification Workflow)

1. Ralph reads `prd.json` from project root
2. Finds first story where `passes: false`
3. Sends story to AI CLI (claude/opencode/aider)
4. **After AI completes (exit 0):**
   - Runs all `testCommand` for each acceptance criterion
   - Updates `passes` and `lastRun` for each criterion
   - If ALL criteria pass → sets `story.passes: true` → moves to next story
   - If ANY criteria fail → **retries the same story** with AI
5. When all stories pass → archives PRD to `.archive/` with timestamp
6. TUI shows: gray (pending) → yellow (in progress) → green (verified)

### Retry Behavior

When acceptance criteria tests fail after AI completes:

- Ralph logs which criteria failed
- Automatically re-runs the same story
- AI receives the same prompt and should fix the issues
- **Maximum 3 retries per story** (based on Aider's proven pattern)
- After 3 failures, story is marked failed and Ralph moves to next story
- Prevents infinite loops that waste time and money

### PRD Archival

When all stories are verified complete:

- PRD is copied to `.archive/YYYY-MM-DD_HH-MM-SS_completed_prd.json`
- Original `prd.json` remains with all `passes: true`

### DO NOT USE

- `features` array format
- `implementation_phases` format
- Any format without `userStories` and `passes` fields

These formats won't track progress correctly.

## Repository Structure

```
ralph-ultra/
├── src/
│   ├── components/        # React Ink components
│   │   ├── App.tsx        # Main application
│   │   ├── WorkPane.tsx   # Right pane (Monitor, Status, Details, Help views)
│   │   ├── SessionsPane.tsx # Middle pane (stories list)
│   │   ├── ProjectsRail.tsx # Left pane (project list)
│   │   └── ...
│   ├── hooks/             # Custom React hooks
│   │   ├── useTabs.tsx    # Multi-tab management
│   │   ├── useTheme.tsx   # Theme system
│   │   └── ...
│   ├── themes/            # Theme definitions (nano-dark, nano-light, etc.)
│   ├── utils/
│   │   ├── ralph-service.ts # PRD reading, process spawning
│   │   ├── session.ts     # Session persistence
│   │   └── ...
│   └── types/             # TypeScript types
├── package.json
├── tsconfig.json
├── bunfig.toml
└── prd.json               # PRD file for Ralph to execute
```

## Build/Lint/Test Commands

```bash
# Install dependencies
bun install

# Development mode (hot reload)
bun run dev

# Type checking
bun run typecheck

# Linting
bun run lint

# Production build
bun run build

# Run built version
./dist/ralph-ultra
```

## Code Style Guidelines

### TypeScript Standards

- Use TypeScript strict mode
- No `any` types - use proper typing
- No `@ts-ignore` or `@ts-expect-error`
- Prefer `const` over `let`
- Use async/await over raw promises

### Component Structure

```typescript
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@hooks/useTheme';

interface MyComponentProps {
  title: string;
  onAction: () => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ title, onAction }) => {
  const { theme } = useTheme();

  return (
    <Box>
      <Text color={theme.accent}>{title}</Text>
    </Box>
  );
};
```

### Hook Conventions

- Custom hooks start with `use`
- Return objects for multiple values: `{ value, setValue, isLoading }`
- Handle cleanup in useEffect return

### File Naming

- Components: PascalCase (`WorkPane.tsx`)
- Hooks: camelCase with `use` prefix (`useTheme.tsx`)
- Utils: kebab-case (`ralph-service.ts`)
- Types: `index.ts` in types folder

## Environment Variables

| Variable          | Default | Description                 |
| ----------------- | ------- | --------------------------- |
| `RALPH_NANO_PATH` | -       | Path to ralph-nano/ralph.sh |

## Key Patterns

### Adding New Views to WorkPane

1. Add view type to `WorkPaneView` in `types/index.ts`
2. Add keyboard shortcut in `App.tsx` (1-5 keys)
3. Add render case in `WorkPane.tsx`
4. Update `ShortcutsBar.tsx` if needed

### Adding New Themes

1. Create `src/themes/my-theme.ts`:

```typescript
import type { Theme } from './types';

export const myTheme: Theme = {
  name: 'My Theme',
  accent: '#color',
  accentSecondary: '#color',
  // ... other colors
};
```

2. Add to `src/themes/index.ts`

### Reading PRD Data

```typescript
import { RalphService } from '@utils/ralph-service';

const service = new RalphService('/path/to/project');
const prd = service.readPRD(); // Returns PRD object or null
const stories = prd?.userStories ?? [];
```

## Git Workflow

- Commit messages: `feat:`, `fix:`, `docs:`, `refactor:`
- Always run `bun run typecheck` before committing
- Update CHANGELOG.md for releases
