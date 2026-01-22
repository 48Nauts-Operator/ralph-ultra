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

export interface Settings {
  theme?: string;
  notificationSound?: boolean;
  openProjects?: SavedProject[];
  activeProjectPath?: string;
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
 * @returns Settings object, or empty object if file doesn't exist
 */
export function loadSettings(): Settings {
  ensureConfigDir();
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return {};
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
