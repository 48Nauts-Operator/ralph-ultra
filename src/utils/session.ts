import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getConfigDir, ensureConfigDir } from './config';
import type { FocusPane } from '../types';

/**
 * Session state structure
 * Contains all UI state needed to restore the user's session
 */
export interface SessionState {
  /** Timestamp when session was last saved */
  lastSaved: number;
  /** Whether the session was cleanly closed */
  cleanShutdown: boolean;
  /** Currently active project ID */
  activeProjectId: string | null;
  /** Whether the projects rail is collapsed */
  railCollapsed: boolean;
  /** Currently focused pane */
  focusPane: FocusPane;
  /** Selected story ID in sessions pane */
  selectedStoryId: string | null;
  /** Scroll position in sessions pane */
  sessionsScrollIndex: number;
  /** Current work pane view (monitor, status, details, help, tracing) */
  workPaneView: string;
  /** Scroll position in work pane */
  workScrollOffset: number;
  /** Work pane view-specific state */
  workPaneState: {
    /** Selected tracing node index */
    tracingNodeIndex?: number;
  };
}

/**
 * Default session state
 */
const DEFAULT_SESSION: SessionState = {
  lastSaved: Date.now(),
  cleanShutdown: true,
  activeProjectId: null,
  railCollapsed: false,
  focusPane: 'sessions',
  selectedStoryId: null,
  sessionsScrollIndex: 0,
  workPaneView: 'monitor',
  workScrollOffset: 0,
  workPaneState: {},
};

/**
 * Session storage directory path
 */
const SESSIONS_DIR = path.join(getConfigDir(), 'sessions');

/**
 * Maximum age of session files (7 days in milliseconds)
 */
const MAX_SESSION_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Generate a hash for the project path to use as session filename
 * @param projectPath Path to the project directory
 * @returns Hash string suitable for filename
 */
function hashProjectPath(projectPath: string): string {
  return crypto.createHash('md5').update(projectPath).digest('hex');
}

/**
 * Get the session file path for a given project
 * @param projectPath Path to the project directory
 * @returns Full path to the session file
 */
function getSessionFilePath(projectPath: string): string {
  const hash = hashProjectPath(projectPath);
  return path.join(SESSIONS_DIR, `${hash}.json`);
}

/**
 * Ensure the sessions directory exists
 */
function ensureSessionsDir(): void {
  ensureConfigDir();
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Load session state from disk for a given project
 * @param projectPath Path to the project directory
 * @returns Session state, or null if no session exists
 */
export function loadSession(projectPath: string): SessionState | null {
  ensureSessionsDir();
  const sessionFile = getSessionFilePath(projectPath);

  try {
    if (fs.existsSync(sessionFile)) {
      const content = fs.readFileSync(sessionFile, 'utf-8');
      const session = JSON.parse(content) as SessionState;
      return session;
    }
  } catch (error) {
    console.error('Failed to load session:', error);
  }

  return null;
}

/**
 * Save session state to disk for a given project
 * @param projectPath Path to the project directory
 * @param state Session state to save
 */
export function saveSession(projectPath: string, state: SessionState): void {
  ensureSessionsDir();
  const sessionFile = getSessionFilePath(projectPath);

  try {
    const sessionData = {
      ...state,
      lastSaved: Date.now(),
    };
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save session:', error);
  }
}

/**
 * Mark session as cleanly shutdown
 * @param projectPath Path to the project directory
 */
export function markCleanShutdown(projectPath: string): void {
  const session = loadSession(projectPath);
  if (session) {
    saveSession(projectPath, {
      ...session,
      cleanShutdown: true,
    });
  }
}

/**
 * Mark session as active (not cleanly shutdown)
 * Called when app starts to detect crashes later
 * @param projectPath Path to the project directory
 */
export function markSessionActive(projectPath: string): void {
  const session = loadSession(projectPath) || DEFAULT_SESSION;
  saveSession(projectPath, {
    ...session,
    cleanShutdown: false,
  });
}

/**
 * Check if the last session ended in a crash (unclean shutdown)
 * @param projectPath Path to the project directory
 * @returns true if crash detected, false otherwise
 */
export function detectCrash(projectPath: string): boolean {
  const session = loadSession(projectPath);
  return session !== null && session.cleanShutdown === false;
}

/**
 * Clear session data for a given project
 * @param projectPath Path to the project directory
 */
export function clearSession(projectPath: string): void {
  const sessionFile = getSessionFilePath(projectPath);
  try {
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
    }
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
}

/**
 * Clean up old session files (older than MAX_SESSION_AGE)
 */
export function cleanupOldSessions(): void {
  ensureSessionsDir();
  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    const now = Date.now();

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(SESSIONS_DIR, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > MAX_SESSION_AGE) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (error) {
    console.error('Failed to cleanup old sessions:', error);
  }
}

/**
 * Get the default session state
 * @returns A fresh default session state
 */
export function getDefaultSession(): SessionState {
  return { ...DEFAULT_SESSION, lastSaved: Date.now() };
}
