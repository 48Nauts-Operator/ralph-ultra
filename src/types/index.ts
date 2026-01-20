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
