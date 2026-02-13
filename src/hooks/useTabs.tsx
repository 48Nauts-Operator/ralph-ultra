import { useState, useCallback, useEffect, useRef } from 'react';
import type { Project, TabState, AgentActivity, OutputLine } from '../types';
import { RalphService, type RalphStatus } from '../utils/ralph-service';
import { parseAgentTree } from '../utils/log-parser';
import type { AgentNode } from '../components/TracingPane';
import { useNotifications } from './useNotifications';
import { addToRecentProjects, loadSettings } from '../utils/config';

/**
 * Create a new tab for a project
 */
function createNewTab(project: Project): TabState {
  const settings = loadSettings();
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    project,
    processState: 'idle',
    processError: undefined,
    logLines: [],
    selectedStory: null,
    selectedStoryId: null,
    sessionsScrollIndex: 0,
    workPaneView: 'monitor',
    workScrollOffset: 0,
    tracingNodeIndex: 0,
    availableCLI: null,
    isProjectCLIOverride: false,
    lastRunDuration: null,
    lastRunExitCode: null,
    currentStory: null,
    searchState: {
      searchQuery: '',
      searchMode: false,
      currentMatchIndex: 0,
      totalMatches: 0,
      matchingLines: [],
    },
    gotoState: {
      gotoMode: false,
      gotoInput: '',
      gotoError: null,
    },
    logFilter: {
      level: 'all',
    },
    debugMode: settings.debugMode || false,
  };
}

/**
 * Hook to manage multiple tabs with isolated state
 */
function createInitialTabs(projects: Project[]): TabState[] {
  return projects.slice(0, 5).map(p => createNewTab(p));
}

export function useTabs(projects: Project[], initialActiveId?: string) {
  const { notify } = useNotifications();
  const [initialTabs] = useState<TabState[]>(() => createInitialTabs(projects));
  const [tabs, setTabs] = useState<TabState[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string>(
    initialActiveId || initialTabs[0]?.id || '',
  );
  const ralphServicesRef = useRef<Map<string, RalphService>>(new Map());
  const [agentTrees, setAgentTrees] = useState<Map<string, AgentNode[]>>(new Map());

  // Get the currently active tab (null when no tabs open)
  const activeTab: TabState | null = tabs.find(tab => tab.id === activeTabId) || tabs[0] || null;

  /**
   * Helper to track project access in recent projects
   */
  const trackProjectAccess = useCallback((project: Project) => {
    addToRecentProjects({
      path: project.path,
      name: project.name,
      color: project.color,
      icon: project.icon,
    });
  }, []);

  /**
   * Open a new tab for a project
   */
  const openTab = useCallback(
    (project: Project) => {
      // Track in recent projects
      trackProjectAccess(project);

      setTabs(prev => {
        // Check if already open
        const existing = prev.find(t => t.project.id === project.id);
        if (existing) {
          setActiveTabId(existing.id);
          // Still track access even when switching to existing tab
          trackProjectAccess(existing.project);
          return prev;
        }

        // Limit to 5 tabs
        if (prev.length >= 5) {
          return prev;
        }

        const newTab = createNewTab(project);
        setActiveTabId(newTab.id);
        return [...prev, newTab];
      });
    },
    [trackProjectAccess],
  );

  /**
   * Close a tab
   */
  const closeTab = useCallback(
    (tabId: string) => {
      // Stop the Ralph service for this tab
      const service = ralphServicesRef.current.get(tabId);
      if (service) {
        service.stop();
        service.dispose();
        ralphServicesRef.current.delete(tabId);
      }

      setTabs(prev => {
        const tab = prev.find(t => t.id === tabId);
        if (!tab) return prev;

        // Remove the tab
        const newTabs = prev.filter(t => t.id !== tabId);

        // If we closed the active tab, switch to the previous one
        if (tabId === activeTabId && newTabs.length > 0) {
          const closedIndex = prev.findIndex(t => t.id === tabId);
          const newActiveIndex = Math.max(0, closedIndex - 1);
          const newActiveTab = newTabs[newActiveIndex];
          if (newActiveTab) {
            setActiveTabId(newActiveTab.id);
          }
        }

        return newTabs;
      });
    },
    [activeTabId],
  );

  /**
   * Switch to a specific tab
   */
  const switchTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find(t => t.id === tabId);
      if (tab) {
        setActiveTabId(tabId);
        // Track tab switch in recent projects
        trackProjectAccess(tab.project);
      }
    },
    [tabs, trackProjectAccess],
  );

  /**
   * Switch to next tab (Ctrl+Tab)
   */
  const nextTab = useCallback(() => {
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (nextTab) {
      setActiveTabId(nextTab.id);
      // Track tab switch in recent projects
      trackProjectAccess(nextTab.project);
    }
  }, [tabs, activeTabId, trackProjectAccess]);

  /**
   * Switch to tab by number (Ctrl+1/2/3...)
   */
  const switchToTabNumber = useCallback(
    (number: number) => {
      if (number >= 1 && number <= tabs.length) {
        const tab = tabs[number - 1];
        if (tab) {
          setActiveTabId(tab.id);
          // Track tab switch in recent projects
          trackProjectAccess(tab.project);
        }
      }
    },
    [tabs, trackProjectAccess],
  );

  /**
   * Update tab state
   */
  const updateTab = useCallback((tabId: string, updates: Partial<TabState>) => {
    setTabs(prev => prev.map(tab => (tab.id === tabId ? { ...tab, ...updates } : tab)));
  }, []);

  /**
   * Get or create RalphService for a tab
   */
  const getRalphService = useCallback(
    (tabId: string): RalphService => {
      let service = ralphServicesRef.current.get(tabId);
      if (!service) {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) {
          throw new Error(`Tab not found: ${tabId}`);
        }

        service = new RalphService(tab.project.path);

        // Set initial debug mode from tab state
        if (tab.debugMode) {
          service.setDebugMode(true);
        }

        service.onStatusChange((status: RalphStatus) => {
          // Check for story completion or error
          if (status.state === 'idle' && status.currentStory) {
            if (status.storyPassed) {
              // Story completed successfully
              notify('success', `Story ${status.currentStory} completed successfully!`);
            } else if (status.exitCode !== undefined && status.exitCode !== 0) {
              // Story failed with error
              notify(
                'error',
                `Story ${status.currentStory} failed with exit code ${status.exitCode}`,
              );
            }
          } else if (status.error) {
            // Process error
            notify('error', `Process error: ${status.error}`);
          }

          updateTab(tabId, {
            processState: status.state,
            processError: status.error,
            processPid: status.pid,
            currentStory: status.currentStory ?? null,
            lastRunDuration: status.duration ?? null,
            lastRunExitCode: status.exitCode ?? null,
            retryCount: status.retryCount ?? 0,
            currentModel: service!.getCurrentModel(),
          });
        });

        updateTab(tabId, {
          availableCLI: service.getAvailableCLI(),
          isProjectCLIOverride: service.isProjectCLIOverride(),
        });

        // Sync initial service state to React — closes the window where
        // constructor detects an external tmux session but the status callback
        // hasn't been registered yet, leaving React stuck at 'idle'.
        const initialStatus = service.getStatus();
        if (initialStatus.state !== 'idle') {
          updateTab(tabId, {
            processState: initialStatus.state,
            processPid: initialStatus.pid,
            currentStory: initialStatus.currentStory ?? null,
          });
        }

        service.onOutput((line: string, type: 'stdout' | 'stderr') => {
          // Check for story completion or error messages
          if (line.includes('✓') && line.includes('VERIFIED - all acceptance criteria pass!')) {
            const storyMatch = line.match(/✓\s+(\S+)\s+VERIFIED/);
            const storyId = storyMatch ? storyMatch[1] : 'Story';
            notify('success', `${storyId} completed successfully!`);
          } else if (line.includes('✗') && line.includes('FAILED - ')) {
            const storyMatch = line.match(/✗\s+(\S+)\s+FAILED/);
            const storyId = storyMatch ? storyMatch[1] : 'Story';
            notify('error', `${storyId} failed acceptance criteria`);
          } else if (line.includes('🎉 PROJECT COMPLETE!')) {
            notify('success', '🎉 Project complete! All stories verified.');
          } else if (line.includes('[OK] Claude is running')) {
            notify('success', 'Claude session verified running');
          } else if (line.includes('[WARN] No activity detected')) {
            notify('warning', 'No Claude activity - may be stuck or quota limited');
          } else if (line.includes('[ERROR]')) {
            notify('error', line.replace('[ERROR]', '').trim());
          }

          setTabs(prev =>
            prev.map(t => {
              if (t.id !== tabId) return t;

              const formattedLine = `${type === 'stderr' ? '[ERR] ' : ''}${line}`;
              const newLogLines = [...t.logLines, formattedLine];

              // Parse agent tree from updated log lines
              const tree = parseAgentTree(newLogLines);
              setAgentTrees(prev => {
                const newMap = new Map(prev);
                newMap.set(tabId, tree);
                return newMap;
              });

              return {
                ...t,
                logLines: newLogLines,
              };
            }),
          );
        });

        ralphServicesRef.current.set(tabId, service);
      }

      return service;
    },
    [tabs, updateTab, notify],
  );

  /**
   * Sync debug mode with RalphService when it changes
   */
  useEffect(() => {
    tabs.forEach(tab => {
      const service = ralphServicesRef.current.get(tab.id);
      if (service) {
        service.setDebugMode(tab.debugMode || false);
      }
    });
  }, [tabs]);

  /**
   * Cleanup only on unmount — not on every service change.
   * The old [ralphServices] dependency caused cleanup to fire whenever the map
   * changed (e.g. when a new RalphService was created), which called stop() on
   * all services — including the one currently running a story.
   */
  useEffect(() => {
    return () => {
      ralphServicesRef.current.forEach((service: RalphService) => service.stop());
    };
  }, []);

  const getLiveOutput = useCallback((tabId: string, maxLines: number = 25): OutputLine[] => {
    const service = ralphServicesRef.current.get(tabId);
    if (!service) return [];
    return service.getLiveOutput(maxLines);
  }, []);

  const getAgentActivity = useCallback((tabId: string): AgentActivity | null => {
    const service = ralphServicesRef.current.get(tabId);
    if (!service) return null;
    return service.getAgentActivity();
  }, []);

  return {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    closeTab,
    switchTab,
    nextTab,
    switchToTabNumber,
    updateTab,
    getRalphService,
    getAgentTree: (tabId: string) => agentTrees.get(tabId) || [],
    getLiveOutput,
    getAgentActivity,
  };
}
