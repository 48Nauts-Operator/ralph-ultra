import { useEffect, useRef } from 'react';
import {
  loadSession,
  saveSession,
  markSessionActive,
  markCleanShutdown,
  cleanupOldSessions,
  type SessionState,
} from '../utils/session';

/**
 * Auto-save interval (30 seconds)
 */
const AUTO_SAVE_INTERVAL = 30 * 1000;

/**
 * Hook for managing session persistence with auto-save
 * @param projectPath Path to the current project
 * @param state Current session state to persist
 */
export function useSession(projectPath: string, state: SessionState): void {
  const lastSavedStateRef = useRef<string>('');

  // Mark session as active on mount, clean on unmount
  useEffect(() => {
    // Mark session as active (for crash detection)
    markSessionActive(projectPath);

    // Cleanup old sessions on startup
    cleanupOldSessions();

    // Mark clean shutdown when component unmounts
    return () => {
      markCleanShutdown(projectPath);
    };
  }, [projectPath]);

  // Auto-save session state every 30 seconds if changed
  useEffect(() => {
    const saveCurrentState = () => {
      const currentStateJson = JSON.stringify(state);

      // Only save if state has changed since last save
      if (currentStateJson !== lastSavedStateRef.current) {
        saveSession(projectPath, state);
        lastSavedStateRef.current = currentStateJson;
      }
    };

    // Save immediately on state change (debounced by interval)
    saveCurrentState();

    // Set up interval for periodic auto-save
    const intervalId = setInterval(saveCurrentState, AUTO_SAVE_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, [projectPath, state]);
}

/**
 * Load saved session for a project
 * @param projectPath Path to the project
 * @returns Saved session state, or null if none exists
 */
export function useLoadSession(projectPath: string): SessionState | null {
  return loadSession(projectPath);
}
