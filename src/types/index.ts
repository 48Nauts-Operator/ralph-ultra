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
}

/**
 * Process state for a Ralph instance
 */
export type ProcessState = 'idle' | 'running' | 'stopping' | 'external';

/**
 * Work pane view types
 */
export type WorkView = 'monitor' | 'status' | 'details' | 'help' | 'tracing';

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
  lastRunDuration?: number | null;
  lastRunExitCode?: number | null;
  currentStory?: string | null;
  searchState?: SearchState;
  logFilter?: LogFilter;
  retryCount?: number;
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
