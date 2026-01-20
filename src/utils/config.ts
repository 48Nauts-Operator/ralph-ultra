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
