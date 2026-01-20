import fs from 'fs';
import path from 'path';
import os from 'os';

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
 * Settings structure
 */
export interface Settings {
  theme?: string;
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
