import { useEffect, useRef, useCallback } from 'react';
import {
  saveMultiTabSession,
  markCleanShutdown,
  markSessionActive,
  type MultiTabSessionState,
} from '../utils/session';
import type { TabState, FocusPane } from '../types';

/**
 * Hook to manage multi-tab session persistence
 * Auto-saves session state every 30 seconds and marks clean shutdown
 */
export function useMultiTabSession(
  tabs: TabState[],
  activeTabId: string,
  railCollapsed: boolean,
  focusPane: FocusPane,
) {
  const lastSavedRef = useRef<string>('');
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Save session state (wrapped in useCallback to avoid dependency warning)
  const saveSession = useCallback(() => {
    const sessionState: MultiTabSessionState = {
      lastSaved: Date.now(),
      cleanShutdown: false, // Will be set to true on clean exit
      railCollapsed,
      focusPane,
      activeTabId,
      tabs: tabs.map(tab => ({
        id: tab.id,
        projectId: tab.project.id,
        selectedStoryId: tab.selectedStoryId,
        sessionsScrollIndex: tab.sessionsScrollIndex,
        workPaneView: tab.workPaneView,
        workScrollOffset: tab.workScrollOffset,
        tracingNodeIndex: tab.tracingNodeIndex,
      })),
    };

    // Only save if state has actually changed
    const stateJson = JSON.stringify(sessionState);
    if (stateJson !== lastSavedRef.current) {
      saveMultiTabSession(sessionState);
      lastSavedRef.current = stateJson;
    }
  }, [tabs, activeTabId, railCollapsed, focusPane]);

  // Auto-save session every 30 seconds
  useEffect(() => {
    // Mark session as active (for crash detection)
    markSessionActive('multi-tab');

    // Save immediately
    saveSession();

    // Setup interval for periodic saves
    saveIntervalRef.current = setInterval(() => {
      saveSession();
    }, 30000); // 30 seconds

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [saveSession]);

  // Mark clean shutdown when component unmounts
  useEffect(() => {
    return () => {
      markCleanShutdown('multi-tab');
    };
  }, []);
}
