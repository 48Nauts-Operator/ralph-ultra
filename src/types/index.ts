/**
 * Shared type definitions for Ralph Ultra
 */

/**
 * Represents a project that can be monitored by Ralph
 */
export interface Project {
  /** Unique identifier for the project */
  id: string;
  /** Display name of the project */
  name: string;
  /** Path to the project directory */
  path: string;
  /** Color for the project icon (hex color) */
  color?: string;
  /** First letter or icon character to display */
  icon?: string;
}

/**
 * Focus states for the application
 */
export type FocusPane = 'projects' | 'tabs' | 'sessions' | 'work';

export type Complexity = 'simple' | 'medium' | 'complex';

export interface AcceptanceCriterion {
  id: string;
  text: string;
  testCommand?: string;
  passes: boolean;
  lastRun: string | null;
}

export type AcceptanceCriteria = string[] | AcceptanceCriterion[];

export interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriteria;
  complexity: Complexity;
  priority: number;
  passes: boolean;
  /** Set to true when story exceeded max retries - Ralph will skip it */
  skipped?: boolean;
}

export function isTestableAC(ac: AcceptanceCriteria): ac is AcceptanceCriterion[] {
  return ac.length > 0 && typeof ac[0] === 'object';
}

/**
 * The PRD file structure
 */
export interface PRD {
  /** Project name */
  project: string;
  /** Project description */
  description: string;
  /** Git branch name for this PRD */
  branchName: string;
  /** List of user stories */
  userStories: UserStory[];
  /** Optional CLI override for this project (e.g., 'claude', 'codex', 'aider') */
  cli?: string;
  /** Optional CLI fallback order for this project */
  cliFallbackOrder?: string[];
}

/**
 * Process state for a Ralph instance
 */
export type ProcessState = 'idle' | 'running' | 'stopping' | 'external';

/**
 * Work pane view types
 */
export type WorkView =
  | 'monitor'
  | 'status'
  | 'details'
  | 'quota'
  | 'plan'
  | 'help'
  | 'version'
  | 'costs';

/**
 * Complete state for a single tab/project
 */
export interface TabState {
  id: string;
  project: Project;
  processState: ProcessState;
  processError?: string;
  processPid?: number;
  logLines: string[];
  selectedStory: UserStory | null;
  selectedStoryId: string | null;
  sessionsScrollIndex: number;
  workPaneView: WorkView;
  workScrollOffset: number;
  tracingNodeIndex: number;
  availableCLI?: string | null;
  isProjectCLIOverride?: boolean;
  lastRunDuration?: number | null;
  lastRunExitCode?: number | null;
  currentStory?: string | null;
  searchState?: SearchState;
  gotoState?: GotoState;
  logFilter?: LogFilter;
  retryCount?: number;
  debugMode?: boolean;
}

/**
 * Notification types
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * A notification message
 */
export interface Notification {
  /** Unique identifier */
  id: string;
  /** Notification type */
  type: NotificationType;
  /** Message to display */
  message: string;
  /** Timestamp when notification was created */
  timestamp: Date;
  /** Duration in ms before auto-dismiss (default 5000) */
  duration?: number;
}

/**
 * Search state for log filtering
 */
export interface SearchState {
  /** Current search query */
  searchQuery: string;
  /** Whether search mode is active */
  searchMode: boolean;
  /** Current search match index */
  currentMatchIndex: number;
  /** Total number of matches */
  totalMatches: number;
  /** Indices of matching lines */
  matchingLines: number[];
}

/**
 * Goto state for jumping to specific stories
 */
export interface GotoState {
  /** Whether goto mode is active */
  gotoMode: boolean;
  /** Current goto input (story number or ID) */
  gotoInput: string;
  /** Error message if goto fails */
  gotoError: string | null;
}

/**
 * Log filter levels for filtering displayed log lines
 */
export type LogFilterLevel = 'all' | 'errors' | 'warnings_errors';

/**
 * Log filter state
 */
export interface LogFilter {
  /** Current filter level */
  level: LogFilterLevel;
}
