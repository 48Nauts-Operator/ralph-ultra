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
export type FocusPane = 'rail' | 'sessions' | 'work';

/**
 * Complexity level for a user story
 */
export type Complexity = 'simple' | 'medium' | 'complex';

/**
 * A single user story from the PRD
 */
export interface UserStory {
  /** Unique identifier (e.g., "US-001") */
  id: string;
  /** Short title of the story */
  title: string;
  /** Detailed description */
  description: string;
  /** List of acceptance criteria */
  acceptanceCriteria: string[];
  /** Complexity level */
  complexity: Complexity;
  /** Priority number (lower = higher priority) */
  priority: number;
  /** Whether the story has passed all checks */
  passes: boolean;
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
export type ProcessState = 'idle' | 'running' | 'stopping';

/**
 * Work pane view types
 */
export type WorkView = 'monitor' | 'status' | 'details' | 'help' | 'tracing';

/**
 * Complete state for a single tab/project
 */
export interface TabState {
  /** Unique identifier for this tab */
  id: string;
  /** Project being monitored */
  project: Project;
  /** Process state */
  processState: ProcessState;
  /** Process error message (if any) */
  processError?: string;
  /** Log lines from process output */
  logLines: string[];
  /** Currently selected story */
  selectedStory: UserStory | null;
  /** Selected story ID for persistence */
  selectedStoryId: string | null;
  /** Sessions pane scroll index */
  sessionsScrollIndex: number;
  /** Current work pane view */
  workPaneView: WorkView;
  /** Work pane scroll offset */
  workScrollOffset: number;
  /** Tracing pane selected node index */
  tracingNodeIndex: number;
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
