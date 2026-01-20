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
