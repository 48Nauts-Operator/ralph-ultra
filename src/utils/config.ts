import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

/**
 * Configuration directory path (~/.config/ralph-ultra/)
 */
const CONFIG_DIR = path.join(os.homedir(), '.config', 'ralph-ultra');

/**
 * First launch flag file path
 */
const FIRST_LAUNCH_FLAG = path.join(CONFIG_DIR, '.first-launch');

/**
 * Settings file path
 */
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

/**
 * Principles file path
 */
const PRINCIPLES_FILE = path.join(CONFIG_DIR, 'principles.md');

export interface SavedProject {
  path: string;
  name: string;
  color: string;
}

export interface RecentProject {
  path: string;
  name: string;
  color?: string;
  icon?: string;
  lastAccessed: string; // ISO timestamp
}

export interface Settings {
  theme?: string;
  notificationSound?: boolean;
  debugMode?: boolean;
  openProjects?: SavedProject[];
  activeProjectPath?: string;
  recentProjects?: RecentProject[];
  preferredCli?: string;
  cliFallbackOrder?: string[];
  executionMode?: 'balanced' | 'super-saver' | 'fast-delivery';
  [key: string]: unknown;
}

/**
 * Ensure the config directory exists
 */
export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Check if this is the first launch
 * @returns true if first launch, false otherwise
 */
export function isFirstLaunch(): boolean {
  ensureConfigDir();
  return !fs.existsSync(FIRST_LAUNCH_FLAG);
}

/**
 * Mark that the first launch has completed
 */
export function markFirstLaunchComplete(): void {
  ensureConfigDir();
  try {
    fs.writeFileSync(FIRST_LAUNCH_FLAG, new Date().toISOString(), 'utf-8');
  } catch (error) {
    // Silently fail - not critical
    console.error('Failed to mark first launch complete:', error);
  }
}

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Load settings from file
 * @returns Settings object with defaults applied, or object with defaults if file doesn't exist
 */
export function loadSettings(): Settings {
  ensureConfigDir();
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const settings = JSON.parse(content);
      // Ensure executionMode has a default value
      if (!settings.executionMode) {
        settings.executionMode = 'balanced';
      }
      return settings;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return { executionMode: 'balanced' };
}

/**
 * Save settings to file
 * @param settings Settings object to save
 */
export function saveSettings(settings: Settings): void {
  ensureConfigDir();
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

/**
 * Default principles template
 */
const DEFAULT_PRINCIPLES = `# Custom Coding Principles for Ralph Ultra

These principles are injected into every AI prompt. Customize them for your project's needs.

## Project-Specific Rules
<!-- Example: All API endpoints must include rate limiting -->
<!-- Example: Use Zod for all runtime validation -->
<!-- Example: Prefer composition over inheritance -->

## Technology Preferences
<!-- Example: Use React Query for data fetching -->
<!-- Example: Prefer Tailwind over CSS-in-JS -->
<!-- Example: Use Vitest instead of Jest -->

## Code Style
<!-- Example: Prefer early returns over nested conditions -->
<!-- Example: Keep functions under 30 lines -->
<!-- Example: Use descriptive variable names (no single letters except loop counters) -->

## Domain-Specific Guidelines
<!-- Example: All financial calculations must use decimal.js -->
<!-- Example: User inputs must be sanitized for XSS -->
<!-- Example: Timestamps must be stored in UTC -->

---
Note: Remove the HTML comments and add your actual principles above.
`;

/**
 * Ensure the principles file exists with default content
 */
export function ensurePrinciplesFile(): void {
  ensureConfigDir();

  if (!fs.existsSync(PRINCIPLES_FILE)) {
    fs.writeFileSync(PRINCIPLES_FILE, DEFAULT_PRINCIPLES, 'utf-8');
    console.log(chalk.green(`✓ Created principles file: ${PRINCIPLES_FILE}`));
    console.log(chalk.gray('  Customize it to add project-specific coding principles'));
  }
}

/**
 * Load custom principles from the config file
 * @returns Principles content or null if not customized
 */
export function loadPrinciples(): string | null {
  try {
    if (fs.existsSync(PRINCIPLES_FILE)) {
      const content = fs.readFileSync(PRINCIPLES_FILE, 'utf-8');
      // Strip HTML comments and check for real content
      const stripped = content.replace(/<!--[\s\S]*?-->/g, '').trim();

      // Only return if user has added actual content
      if (stripped.length > 200 && !stripped.includes('Remove the HTML comments')) {
        return stripped;
      }
    }
  } catch (error) {
    // Silent fallback
  }
  return null;
}

/**
 * Get the principles file path
 */
export function getPrinciplesPath(): string {
  return PRINCIPLES_FILE;
}

/**
 * Maximum number of recent projects to store
 */
const MAX_RECENT_PROJECTS = 10;

/**
 * Add or update a project in recent projects list
 * @param project Project details to add/update
 */
export function addToRecentProjects(project: {
  path: string;
  name: string;
  color?: string;
  icon?: string;
}): void {
  const settings = loadSettings();
  const recent = settings.recentProjects || [];

  // Remove existing entry if present (will re-add at top)
  const filtered = recent.filter(p => p.path !== project.path);

  // Add new entry at the beginning
  const newRecent: RecentProject = {
    ...project,
    lastAccessed: new Date().toISOString(),
  };

  // Keep only MAX_RECENT_PROJECTS items
  const updated = [newRecent, ...filtered].slice(0, MAX_RECENT_PROJECTS);

  settings.recentProjects = updated;
  saveSettings(settings);
}

/**
 * Get recent projects list
 * @returns Array of recent projects sorted by last accessed (newest first)
 */
export function getRecentProjects(): RecentProject[] {
  const settings = loadSettings();
  return settings.recentProjects || [];
}

/**
 * Clear recent projects history
 */
export function clearRecentProjects(): void {
  const settings = loadSettings();
  settings.recentProjects = [];
  saveSettings(settings);
}
