# Settings & Execution Mode Management - Exploration Report

## Executive Summary

This document provides a comprehensive analysis of how settings and execution modes are currently managed in Ralph Ultra v3.0. The codebase demonstrates a well-structured architecture with multiple layers of configuration management and mode-based decision-making.

---

## 1. Settings Storage & Management

### 1.1 Configuration Directory Structure

**Location**: `~/.config/ralph-ultra/`

Settings are stored in the user's home directory with the following structure:

```
~/.config/ralph-ultra/
├── settings.json           # Main persistent settings file
├── principles.md           # Custom coding principles (user-editable)
└── .first-launch           # First launch flag file
```

**File Path Constants** (from `/src/utils/config.ts`):
```typescript
const CONFIG_DIR = path.join(os.homedir(), '.config', 'ralph-ultra');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const PRINCIPLES_FILE = path.join(CONFIG_DIR, 'principles.md');
const FIRST_LAUNCH_FLAG = path.join(CONFIG_DIR, '.first-launch');
```

### 1.2 Settings Interface

**Type Definition** (`/src/utils/config.ts`):
```typescript
export interface Settings {
  theme?: string;
  notificationSound?: boolean;
  debugMode?: boolean;
  openProjects?: SavedProject[];
  activeProjectPath?: string;
  recentProjects?: RecentProject[];
  preferredCli?: string;
  cliFallbackOrder?: string[];
  [key: string]: unknown;  // Allows extensibility
}
```

**Current Settings Properties**:
- `theme`: User's selected theme name (e.g., "dracula", "gruvbox")
- `notificationSound`: Whether notification sounds are enabled
- `debugMode`: Debug mode toggle
- `openProjects`: Array of saved projects
- `activeProjectPath`: Currently active project path
- `recentProjects`: Recently accessed projects (max 10)
- `preferredCli`: Preferred AI CLI (e.g., "claude", "openai")
- `cliFallbackOrder`: Fallback chain of CLIs to try if primary fails

### 1.3 Settings API Functions

**Core Operations** (all in `/src/utils/config.ts`):

```typescript
// Directory management
ensureConfigDir(): void              // Creates ~/.config/ralph-ultra/ if needed
getConfigDir(): string               // Returns config directory path

// Settings persistence
loadSettings(): Settings             // Load from disk, returns {} if not found
saveSettings(settings: Settings): void  // Persist to disk

// First launch tracking
isFirstLaunch(): boolean             // Check if first run
markFirstLaunchComplete(): void      // Mark first run complete

// Recent projects management
addToRecentProjects(project: {...}): void
getRecentProjects(): RecentProject[]
clearRecentProjects(): void

// Principles management
ensurePrinciplesFile(): void         // Create default principles.md
loadPrinciples(): string | null      // Load user's principles (filtered)
getPrinciplesPath(): string
```

### 1.4 Recent Projects Storage

**RecentProject Type**:
```typescript
export interface RecentProject {
  path: string;
  name: string;
  color?: string;
  icon?: string;
  lastAccessed: string;  // ISO timestamp
}
```

**Management Rules**:
- Maximum 10 recent projects stored
- Automatically sorted by last accessed (newest first)
- Duplicates removed (re-added at top when accessed)
- Persists immediately to disk

---

## 2. Execution Mode System

### 2.1 Mode Definition

**ExecutionMode Type** (`/src/core/types.ts`):
```typescript
export type ExecutionMode = 'balanced' | 'super-saver' | 'fast-delivery';
```

**Three Available Modes**:
1. **balanced**: Optimal cost-quality tradeoff (default)
2. **super-saver**: Minimize costs, use cheapest models
3. **fast-delivery**: Maximize speed and quality, use premium models

### 2.2 Mode Configuration Structure

```typescript
export interface ExecutionModeConfig {
  mode: ExecutionMode;
  description: string;
  modelStrategy: 'recommended' | 'cheapest' | 'fastest' | 'most-reliable';
}
```

---

## 3. Current Execution Mode Handling

### 3.1 Hook-Based Mode Management

**Location**: `/src/hooks/useExecutionPlan.tsx`

```typescript
export function useExecutionPlan(projectPath: string) {
  const [currentMode, setCurrentMode] = useState<ExecutionMode>('balanced');
  
  /**
   * Set execution mode and regenerate plan
   */
  const setMode = useCallback((mode: ExecutionMode) => {
    setCurrentMode(mode);
  }, []);
  
  // Returns: { plan, loading, error, refresh, currentMode, setMode }
}
```

**Key Characteristics**:
- Uses React hooks for state management
- Mode is stored in component state (not persisted to disk)
- Mode change triggers plan regeneration automatically
- Initial default: 'balanced'

### 3.2 Mode Display & Cycling

**Location**: `/src/components/ExecutionPlanView.tsx`

```typescript
const cycleMode = () => {
  const modes: ExecutionMode[] = ['balanced', 'super-saver', 'fast-delivery'];
  const currentIndex = modes.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  const nextMode = modes[nextIndex];
  if (nextMode) {
    setMode(nextMode);
  }
};

// Keyboard shortcut: Press 'm' or 'M' to cycle modes
```

**Mode Display Labels & Colors**:
- Balanced: "⚖ Balanced" (accent color)
- Super Saver: "💰 Super Saver" (success/green)
- Fast Delivery: "⚡ Fast Delivery" (warning/yellow)

---

## 4. Model Selection by Execution Mode

### 4.1 Model Capability Mapping

**Location**: `/src/core/capability-matrix.ts`

Three separate model mappings:

#### Standard Mapping (TASK_MODEL_MAPPING)
- Balanced quality and cost
- Primary choice: Claude Sonnet
- Fallback: Provider-specific alternatives

#### Super Saver Mapping (SUPER_SAVER_MAPPING)
- Prioritizes cheapest models
- Primary: Haiku, GPT-4o-mini, Gemini Flash
- Exception: Complex tasks still use Sonnet
- Local models where possible

#### Fast Delivery Mapping (FAST_DELIVERY_MAPPING)
- Prioritizes premium models
- Primary: Claude Opus, Sonnet, GPT-4o
- Best quality and speed
- No compromise on capability

### 4.2 Task Types

```typescript
export type TaskType =
  | 'complex-integration'    // Multi-system
  | 'mathematical'           // Algorithms
  | 'backend-api'            // REST/GraphQL
  | 'backend-logic'          // Business logic
  | 'frontend-ui'            // Visual components
  | 'frontend-logic'         // Hooks, state
  | 'database'               // Schema, queries
  | 'testing'                // Unit, E2E
  | 'documentation'          // Docs
  | 'refactoring'            // Code cleanup
  | 'bugfix'                 // Issue resolution
  | 'devops'                 // CI/CD
  | 'config'                 // Configuration
  | 'unknown';
```

### 4.3 Model Selection Logic

**Function**: `getRecommendedModel()` in `/src/core/capability-matrix.ts`

```typescript
export function getRecommendedModel(
  taskType: TaskType,
  quotas?: Record<Provider, ProviderQuota>,
  mode?: ExecutionMode
): { modelId: string; provider: Provider; reason: string }
```

**Selection Process**:
1. Select mapping based on execution mode
2. Check primary model's quota availability
3. Fall back to secondary model if primary exhausted
4. Find any available model with required capabilities
5. Return primary model even if quota exhausted (caller handles error)

---

## 5. Execution Plan Integration

### 5.1 Plan Generation with Mode

**Location**: `/src/core/execution-planner.ts`

```typescript
export function generateExecutionPlan(
  prd: PRD,
  quotas?: ProviderQuotas,
  projectPath = '',
  learningData?: ModelLearningDB,
  mode: ExecutionMode = 'balanced'  // <-- Mode parameter
): ExecutionPlan
```

**Plan Structure** includes three cost comparisons:
```typescript
comparisons: {
  optimized: { cost, duration },       // Current mode
  superSaver: { cost, duration },      // Super Saver mode
  fastDelivery: { cost, duration },    // Fast Delivery mode
}
```

### 5.2 ExecutionPlan Type

```typescript
export interface ExecutionPlan {
  projectPath: string;
  prdName: string;
  generatedAt: string;
  selectedMode?: ExecutionMode;        // <-- Stores selected mode
  
  stories: StoryAllocation[];
  
  summary: {
    totalStories: number;
    estimatedTotalCost: number;
    estimatedTotalDuration: number;
    modelsUsed: string[];
    canCompleteWithCurrentQuotas: boolean;
    quotaWarnings: string[];
  };
  
  comparisons: {
    allClaude: { cost, duration };
    allLocal: { cost, duration };
    optimized: { cost, duration };
    superSaver: { cost, duration };
    fastDelivery: { cost, duration };
  };
}
```

### 5.3 Story Allocation with Mode

```typescript
export interface StoryAllocation {
  storyId: string;
  title: string;
  taskType: TaskType;
  complexity: 'simple' | 'medium' | 'complex';
  
  recommendedModel: {
    provider: Provider;
    modelId: string;
    reason: string;
    confidence: number;
  };
  
  alternativeModels: {
    modelId: string;
    provider: Provider;
    estimatedCost: number;
    tradeoff: string;
  }[];
  
  estimatedTokens: number;
  estimatedCost: number;
  estimatedDuration: number;
}
```

---

## 6. Settings Usage in Components

### 6.1 SettingsPanel Component

**Location**: `/src/components/SettingsPanel.tsx`

Displays and manages:
- Theme selection (1-9, 0, -, = keys for 12 themes)
- Sound toggle (s key)
- Preferred CLI selection (c key to cycle)
- CLI fallback chain display

**Settings Lifecycle in SettingsPanel**:
```typescript
// Load on mount
useEffect(() => {
  const clis = RalphService.detectAvailableCLIs();
  setAvailableCLIs(clis);
  
  const settings = loadSettings();
  setPreferredCli(settings['preferredCli'] as string | undefined);
  setCliFallbackOrder((settings['cliFallbackOrder'] as string[] | undefined) || []);
}, []);

// Save on change
const handleCliSelection = (cliName: string) => {
  const settings = loadSettings();
  settings['preferredCli'] = cliName;
  saveSettings(settings);
  setPreferredCli(cliName);
};
```

### 6.2 CLI Detection Hierarchy

**Location**: `/src/utils/ralph-service.ts`

```typescript
private detectAICLI(): string | null {
  const cliOptions = ['claude', 'opencode', 'codex', 'gemini', 'aider', 'cody'];
  
  // Priority 1: PRD-specific CLI override
  if (prd?.cli && cliOptions.includes(prd.cli)) { ... }
  
  // Priority 2: Global preferred CLI from settings
  const settings = loadSettings();
  const preferredCli = settings['preferredCli'];
  if (preferredCli && cliOptions.includes(preferredCli)) { ... }
  
  // Priority 3: Try fallback chain from settings or PRD
  if (prd.cliFallbackOrder || settings['cliFallbackOrder']) { ... }
  
  // Priority 4: Auto-detect first available
  for (const cli of cliOptions) { ... }
}
```

---

## 7. Current Data Flow Architecture

### 7.1 Settings Data Flow

```
┌─────────────────────────────────────┐
│   ~/.config/ralph-ultra/settings.json
│   (Persistent File Storage)
└────────────┬────────────────────────┘
             │
             ├─ loadSettings() ──────┐
             │                       │
             └─ saveSettings() ──────┤
                                     │
             ┌───────────────────────┘
             │
    ┌────────▼─────────┐
    │ SettingsPanel    │
    │ Component        │
    │ (TUI Modal)      │
    └────────┬─────────┘
             │
    ┌────────▼─────────────────────────────┐
    │ settings['preferredCli']
    │ settings['cliFallbackOrder']
    │ settings['theme']
    │ settings['notificationSound']
    │ etc.
    └────────┬─────────────────────────────┘
             │
    ┌────────▼────────┐
    │ RalphService    │
    │ CLI Detection   │
    └─────────────────┘
```

### 7.2 Execution Mode Data Flow

```
┌──────────────────────────┐
│ ExecutionPlanView        │ (Display & User Interaction)
│ - Displays current mode  │
│ - Press 'M' to cycle     │
└────────┬─────────────────┘
         │ setMode(nextMode)
         │
    ┌────▼──────────────────┐
    │ useExecutionPlan Hook  │
    │ - currentMode state    │
    │ - setMode callback     │
    └────┬──────────────────┘
         │ currentMode
         │
    ┌────▼────────────────────────┐
    │ generateExecutionPlan()      │
    │ - Select mapping by mode    │
    │ - Calculate plan & costs    │
    │ - Create comparisons        │
    └────┬─────────────────────────┘
         │
    ┌────▼────────────────────┐
    │ ExecutionPlan object     │
    │ - selectedMode           │
    │ - stories[]              │
    │ - comparisons{}          │
    └─────────────────────────┘
```

**Important Note**: Execution mode is **NOT currently persisted** to disk. It exists only in component state and resets on application restart.

---

## 8. Model Learning & Performance Data

### 8.1 Learning Database Structure

**Location**: `/src/core/learning-recorder.ts`

```typescript
export interface ModelLearningDB {
  version: '1.0';
  lastUpdated: string;
  
  // Individual run records
  runs: ModelPerformanceRecord[];
  
  // Aggregated learnings by model + taskType
  learnings: Record<string, Record<TaskType, ModelLearning>>;
  
  // Cached recommendations by taskType
  recommendations: Record<TaskType, ModelRecommendation>;
}
```

### 8.2 Performance Tracking

```typescript
export interface ModelPerformanceRecord {
  id: string;
  timestamp: string;
  
  // Context
  project: string;
  storyId: string;
  taskType: TaskType;
  complexity: 'simple' | 'medium' | 'complex';
  
  // Model used
  provider: Provider;
  modelId: string;
  
  // Performance
  durationMinutes: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  
  // Results
  success: boolean;
  acPassed: number;
  acTotal: number;
  acPassRate: number;
  
  // Calculated scores
  efficiencyScore: number;
  speedScore: number;
  reliabilityScore: number;
}
```

---

## 9. Cost Tracking System

### 9.1 CostTracker Integration

**Location**: `/src/core/cost-tracker.ts`

Tracks costs per story:
- Model used
- Provider
- Token usage (input/output)
- Actual cost in USD
- Retry count
- Success/failure

### 9.2 Cost Calculations

**Token Estimates by Complexity**:
```typescript
TOKEN_ESTIMATES: {
  simple: { input: 5_000, output: 2_000, durationMinutes: 15 },
  medium: { input: 15_000, output: 6_000, durationMinutes: 30 },
  complex: { input: 40_000, output: 15_000, durationMinutes: 60 }
}
```

**Provider Pricing** (per 1M tokens):
```typescript
const pricing: Record<Provider, { input, output }> = {
  anthropic: { input: 3.0, output: 15.0 },      // Claude
  openai: { input: 10.0, output: 30.0 },        // GPT-4
  openrouter: { input: 5.0, output: 15.0 },     // Average
  gemini: { input: 0.5, output: 1.5 },          // Gemini Pro
  local: { input: 0, output: 0 }                // Free
}
```

---

## 10. Project-Level Configuration

### 10.1 PRD-Level Settings

The `prd.json` file can override global settings:

```typescript
// From PRD (if present)
if (prd?.cli && cliOptions.includes(prd.cli)) {
  // Use project-specific CLI
}

if (prd.cliFallbackOrder && Array.isArray(prd.cliFallbackOrder)) {
  // Use project-specific fallback chain
}
```

**Project Settings Override Hierarchy**:
1. PRD.cli (project-specific)
2. Global preferredCli setting
3. PRD.cliFallbackOrder (project fallback)
4. Global cliFallbackOrder (global fallback)
5. Auto-detect remaining CLIs

---

## 11. Storage Patterns & Persistence

### 11.1 Current Persistence

**What IS Persisted**:
- Theme selection
- Preferred CLI
- CLI fallback order
- Notification sound setting
- Debug mode
- Recent projects (with timestamps)
- Custom coding principles

**What IS NOT Persisted**:
- ❌ Current execution mode (resets to 'balanced' on restart)
- ❌ Active project
- ❌ Execution history
- ❌ Cost tracking data (optional)

### 11.2 File Format

Settings stored as plain JSON:

```json
{
  "theme": "dracula",
  "notificationSound": true,
  "debugMode": false,
  "preferredCli": "claude",
  "cliFallbackOrder": ["opencode", "codex"],
  "recentProjects": [
    {
      "path": "/Users/user/projects/proj1",
      "name": "Project 1",
      "color": "#ff0000",
      "lastAccessed": "2026-01-24T15:30:00Z"
    }
  ]
}
```

---

## 12. Key Patterns & Best Practices Observed

### 12.1 Settings Management Pattern
- Directory auto-creation via `ensureConfigDir()`
- Safe JSON parsing with fallbacks
- Silent error handling in settings operations
- Extensible settings interface with `[key: string]: unknown`

### 12.2 Mode Selection Pattern
- Hook-based state management for reactive updates
- Automatic plan regeneration on mode change
- Three cost comparisons for user visibility
- Mode cycling via keyboard shortcut

### 12.3 Model Selection Pattern
- Task-type to model mapping lookup
- Mode-aware selection (three separate mappings)
- Quota-aware fallback chain
- Health checking before CLI use

### 12.4 Configuration Priority Pattern
- Project-level overrides > Global settings > Auto-detection
- Explicit configuration > Implicit defaults
- Progressive fallback strategies

---

## 13. File Locations Summary

### Application Files
```
/src/utils/config.ts                   # Settings API
/src/core/types.ts                     # ExecutionMode type definition
/src/core/execution-planner.ts         # Plan generation with mode
/src/core/capability-matrix.ts         # Model selection by mode
/src/hooks/useExecutionPlan.tsx        # Mode hook
/src/components/ExecutionPlanView.tsx  # Mode display & cycling
/src/components/SettingsPanel.tsx      # Settings UI
/src/utils/ralph-service.ts            # CLI detection & execution
```

### User Configuration Files
```
~/.config/ralph-ultra/settings.json    # Persistent settings
~/.config/ralph-ultra/principles.md    # Custom principles
~/.config/ralph-ultra/.first-launch    # First launch flag
```

### Project Configuration Files
```
<project>/prd.json                     # PRD with optional CLI overrides
<project>/progress.txt                 # Execution progress tracking
<project>/.ralph-backups/              # PRD backup directory
<project>/logs/                        # Execution logs
```

---

## 14. Recommendations for Enhancement

### 14.1 Persistence Gap
**Current**: Execution mode only in memory, resets on restart
**Recommended**: Persist mode to settings.json with key:
```typescript
settings['executionMode']: ExecutionMode = 'balanced'
```

### 14.2 Active Project Tracking
**Current**: activeProjectPath in settings (unused)
**Recommended**: Utilize for smart reopening on startup

### 14.3 Cost Tracking Persistence
**Current**: CostTracker likely in memory
**Recommended**: Save to `~/.config/ralph-ultra/cost-history.json`

### 14.4 Mode Visibility
**Current**: Mode shown in ExecutionPlanView header
**Recommended**: Add to StatusBar for always-visible indicator

### 14.5 Settings UI Enhancement
**Current**: SettingsPanel only shows basic settings
**Recommended**: Add execution mode selector to SettingsPanel

---

## 15. Summary Table

| Feature | Storage | Persistence | Current State | Scope |
|---------|---------|-------------|----------------|--------|
| Theme | settings.json | ✅ Yes | Saved | Global |
| CLI Preference | settings.json | ✅ Yes | Saved | Global |
| CLI Fallback | settings.json | ✅ Yes | Saved | Global |
| Recent Projects | settings.json | ✅ Yes | Saved | Global |
| Notification Sound | settings.json | ✅ Yes | Saved | Global |
| **Execution Mode** | React state | ❌ **No** | **In-Memory** | **View-Level** |
| Active Project | settings.json | ✅ Partial | Unused | Global |
| Cost History | N/A | ❌ No | Optional | Global |
| Learning Data | Separate DB | ✅ Yes | Persisted | Global |

---

## Conclusion

Ralph Ultra v3.0 has a well-architected settings system with clear separation of concerns:

1. **Settings Management** (`config.ts`): File I/O and persistence
2. **Execution Planning** (`execution-planner.ts`): Mode-based model selection
3. **Component Integration** (`ExecutionPlanView.tsx`): User interaction and display

The main architectural gap is that execution mode is not persisted to disk. This is likely by design to ensure fresh analysis on each run, but creates a user experience where mode selection is lost on restart.

The learning system and cost tracking provide a foundation for long-term optimization and decision-making based on historical performance data.
