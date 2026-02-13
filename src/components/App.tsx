import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Text, useStdout, useApp } from 'ink';

import { SessionsPane } from './SessionsPane';
import { WorkPane } from './WorkPane';
import { StatusBar } from './StatusBar';
import { ShortcutsBar } from './ShortcutsBar';
import { TabBar } from './TabBar';
import { WelcomeOverlay } from './WelcomeOverlay';
import { SettingsPanel } from './SettingsPanel';
import { ProjectPicker } from './ProjectPicker';
import { ConfirmDialog } from './ConfirmDialog';
import { NotificationToast } from './NotificationToast';
import { CommandPalette } from './CommandPalette';

import { useTheme } from '@hooks/useTheme';
import { useFocus } from '@hooks/useFocus';
import { useKeyboard, KeyMatchers, KeyPriority } from '@hooks/useKeyboard';
import { useTabs } from '@hooks/useTabs';
import { useMultiTabSession } from '@hooks/useMultiTabSession';
import { useNotifications } from '@hooks/useNotifications';
import {
  isFirstLaunch,
  markFirstLaunchComplete,
  loadSettings,
  saveSettings,
  ensurePrinciplesFile,
  type SavedProject,
} from '../utils/config';
import { RalphRemoteServer } from '../remote/server';
import { RalphHttpServer } from '../remote/http-server';
import {
  getTailscaleStatus,
  generateRemoteURL,
  copyToClipboard,
  type TailscaleStatus,
} from '../remote/tailscale';
import {
  checkApiStatus,
  formatStatusMessage,
  shouldWarnAboutStatus,
  type AnthropicStatus,
} from '../utils/status-check';
import { getSessionInfo, type SessionInfo } from '../utils/session-tracker';
import type { Project, PRD, AgentActivity, OutputLine } from '../types';
import { PRD_WATCH_INTERVAL_MS } from '../types';
import type { ExecutionMode } from '../core/types';
import { readFileSync, watchFile, unwatchFile } from 'fs';
import { join, basename } from 'path';

/**
 * Main application component with multi-tab support
 * - Projects rail (left): 12 chars expanded, 3 chars collapsed
 * - Sessions pane (middle): flexible width, min 30 chars
 * - Work pane (right): flexible width, min 40 chars
 * - Tab bar (below status bar when multiple projects open)
 */
interface AppProps {
  initialProjectPath?: string;
}

export const App: React.FC<AppProps> = ({ initialProjectPath }) => {
  const { theme } = useTheme();
  const { stdout } = useStdout();
  const { exit } = useApp();
  const { focusPane, cycleFocus, isFocused } = useFocus();
  const { registerHandler, unregisterHandler } = useKeyboard({
    globalDebounce: 50,
  });
  const { notifications, notify } = useNotifications();

  const [dimensions, setDimensions] = useState({
    columns: stdout?.columns || 80,
    rows: stdout?.rows || 24,
  });

  const [showWelcome, setShowWelcome] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showComplexityWarning, setShowComplexityWarning] = useState(false);
  const [showClearSessionConfirm, setShowClearSessionConfirm] = useState(false);
  const [complexityWarningData, setComplexityWarningData] = useState<{
    storyId: string;
    reasons: string[];
  } | null>(null);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [tabToClose, setTabToClose] = useState<string | null>(null);
  const [remoteConnections, setRemoteConnections] = useState(0);
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(null);
  const [remoteURL, setRemoteURL] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<AnthropicStatus | null>(null);
  const [_sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('balanced');

  const remoteServerRef = useRef<RalphRemoteServer | null>(null);
  const httpServerRef = useRef<RalphHttpServer | null>(null);

  const getInitialProjects = (): Project[] => {
    // CLI --project flag takes highest priority
    if (initialProjectPath) {
      return [
        {
          id: 'proj-initial',
          name: basename(initialProjectPath),
          path: initialProjectPath,
          color: '#7FFFD4',
        },
      ];
    }

    const settings = loadSettings();
    const savedProjects = settings.openProjects;

    if (savedProjects && savedProjects.length > 0) {
      return savedProjects.map((sp: SavedProject, index: number) => ({
        id: `proj-${index}-${Date.now()}`,
        name: sp.name,
        path: sp.path,
        color: sp.color || '#7FFFD4',
      }));
    }

    // No project specified and no saved projects — start empty
    return [];
  };

  const {
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
    getLiveOutput,
    getAgentActivity,
  } = useTabs(getInitialProjects());

  const [liveOutput, setLiveOutput] = useState<OutputLine[]>([]);
  const [agentActivity, setAgentActivity] = useState<AgentActivity | null>(null);

  // Compute paused story IDs from tab state
  const pausedStoryIds = useMemo(() => {
    if (!activeTab) return new Set<string>();
    const ids = new Set<string>();
    if (activeTab.processState === 'paused' && activeTab.currentStory) {
      ids.add(activeTab.currentStory);
    }
    return ids;
  }, [activeTab?.processState, activeTab?.currentStory]);

  useEffect(() => {
    const projectsToSave: SavedProject[] = tabs.map(tab => ({
      path: tab.project.path,
      name: tab.project.name,
      color: tab.project.color || '#7FFFD4',
    }));

    const settings = loadSettings();
    settings.openProjects = projectsToSave;
    settings.activeProjectPath = activeTab?.project.path ?? '';
    saveSettings(settings);
  }, [tabs, activeTab]);

  useMultiTabSession(tabs, activeTabId, false, focusPane);

  const handleStorySelect = useCallback(
    (story: import('../types').UserStory | null) => {
      if (!activeTab) return;
      updateTab(activeTabId, {
        selectedStory: story,
        selectedStoryId: story?.id || null,
      });
    },
    [activeTab, activeTabId, updateTab],
  );

  const handleClearSession = useCallback(() => {
    // Reset UI state for the current tab
    updateTab(activeTabId, {
      sessionsScrollIndex: 0,
      workScrollOffset: 0,
      tracingNodeIndex: 0,
      logLines: [],
      searchState: undefined,
      gotoState: undefined,
      workPaneView: 'monitor',
    });

    setShowClearSessionConfirm(false);
    notify('success', 'Session cleared - scroll positions and logs reset');
  }, [activeTabId, updateTab, notify]);

  // Track previous process state for notifications
  const prevProcessStateRef = useRef<string>(activeTab?.processState ?? 'idle');
  const prevPassCountRef = useRef<number>(-1);
  const prevProjectPathRef = useRef<string>(activeTab?.project.path ?? '');
  const [prd, setPrd] = useState<PRD | null>(null);

  // Load and watch PRD file for story completion notifications
  useEffect(() => {
    if (!activeTab) return;

    const loadPRD = () => {
      try {
        const prdPath = join(activeTab.project.path, 'prd.json');
        const content = readFileSync(prdPath, 'utf-8');
        const data = JSON.parse(content) as PRD;
        if (!Array.isArray(data.userStories)) {
          setPrd(null);
          return;
        }
        // Only update if content actually changed (reduces flicker)
        setPrd(prev => {
          if (!prev) return data;
          const prevPasses = prev.userStories.filter(s => s.passes).length;
          const newPasses = data.userStories.filter(s => s.passes).length;
          // Only update if pass count changed or story count changed
          if (prevPasses !== newPasses || prev.userStories.length !== data.userStories.length) {
            return data;
          }
          return prev;
        });
      } catch {
        setPrd(null);
      }
    };

    loadPRD();

    const prdPath = join(activeTab.project.path, 'prd.json');
    watchFile(prdPath, { interval: PRD_WATCH_INTERVAL_MS }, loadPRD);

    return () => {
      unwatchFile(prdPath, loadPRD);
    };
  }, [activeTab]);

  // Trigger notification on story completion
  useEffect(() => {
    if (!prd || !activeTab) return;

    const passCount = prd.userStories.filter(s => s.passes).length;
    const totalCount = prd.userStories.length;

    // Reset counter when switching projects to avoid false notifications
    if (prevProjectPathRef.current !== activeTab.project.path) {
      prevPassCountRef.current = passCount;
      prevProjectPathRef.current = activeTab.project.path;
      return;
    }

    // First load - just set the baseline, don't notify
    if (prevPassCountRef.current === -1) {
      prevPassCountRef.current = passCount;
      return;
    }

    // Story completed (only when count increases from a valid baseline)
    if (passCount > prevPassCountRef.current) {
      const completedStory = prd.userStories.find((s, i) => {
        return s.passes && i === passCount - 1;
      });
      if (completedStory) {
        notify('success', `Story completed: ${completedStory.id} - ${completedStory.title}`);
      }

      // All stories completed
      if (passCount === totalCount) {
        notify('success', '🎉 All stories completed! Project complete!', 8000);
      }
    }

    prevPassCountRef.current = passCount;
  }, [prd, notify, activeTab]);

  // Check API status on startup
  useEffect(() => {
    checkApiStatus().then(status => {
      setApiStatus(status);
      if (shouldWarnAboutStatus(status)) {
        const { message } = formatStatusMessage(status);
        notify('warning', message, 10000);
      }
    });

    // Refresh status periodically (every 5 minutes)
    const interval = setInterval(
      () => {
        checkApiStatus().then(status => {
          setApiStatus(status);
        });
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [notify]);

  // Track previous context budget state for notifications
  const prevContextBudgetRef = useRef<{ exceeded: boolean; approaching: boolean }>({
    exceeded: false,
    approaching: false,
  });

  // Update session info (tokens, cost, context budget) periodically
  useEffect(() => {
    if (!activeTab) return;

    const updateSessionInfo = () => {
      if (activeTab?.project?.path) {
        const info = getSessionInfo(activeTab.project.path);
        setSessionInfo(info);

        // Context budget warning notifications
        const prevBudget = prevContextBudgetRef.current;
        const currentBudget = info.contextBudget;

        // Only notify on state transitions (not on every check)
        if (currentBudget.exceeded && !prevBudget.exceeded) {
          notify(
            'error',
            `Context limit exceeded! (${Math.round(currentBudget.fiveHourPercent)}%)`,
            10000,
          );
        } else if (
          currentBudget.approaching &&
          !prevBudget.approaching &&
          !currentBudget.exceeded
        ) {
          notify(
            'warning',
            `Approaching context limit (${Math.round(currentBudget.fiveHourPercent)}%)`,
            8000,
          );
        }

        prevContextBudgetRef.current = {
          exceeded: currentBudget.exceeded,
          approaching: currentBudget.approaching,
        };
      }
    };

    updateSessionInfo();

    const interval = setInterval(updateSessionInfo, 60000);

    return () => clearInterval(interval);
  }, [activeTab?.project?.path, activeTab?.processState, notify]);

  // Poll for live Claude output and agent activity when process is running
  useEffect(() => {
    if (!activeTab) return;
    if (activeTab.processState !== 'running' && activeTab.processState !== 'paused') {
      setLiveOutput([]);
      setAgentActivity(null);
      return;
    }

    if (activeTab.processState === 'paused') {
      return; // Keep existing data, don't poll
    }

    const POLL_INTERVAL_MS = 2000;
    const pollOutput = () => {
      // Poll agent activity (structured data from stream-json parsing)
      const activity = getAgentActivity(activeTabId);
      setAgentActivity(activity);

      // Also poll live output (structured OutputLine[])
      const output = getLiveOutput(activeTabId, 25);
      setLiveOutput(prev => {
        if (prev.length !== output.length) return output;
        const prevLast = prev[prev.length - 1]?.timestamp;
        const outLast = output[output.length - 1]?.timestamp;
        if (prevLast !== outLast) return output;
        return prev;
      });
    };

    pollOutput();
    const interval = setInterval(pollOutput, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeTab, activeTabId, getLiveOutput, getAgentActivity]);

  // Always show welcome splash on startup
  useEffect(() => {
    setShowWelcome(true);
    // Ensure principles file exists on every startup
    ensurePrinciplesFile();

    // Load execution mode from settings
    const settings = loadSettings();
    if (settings.executionMode) {
      setExecutionMode(settings.executionMode as ExecutionMode);
    }

    const SPLASH_DURATION_MS = 2000;
    const timer = setTimeout(() => {
      setShowWelcome(false);
      if (isFirstLaunch()) {
        markFirstLaunchComplete();
      }
    }, SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  // Trigger notifications on process state changes
  useEffect(() => {
    if (!activeTab) return;
    const prevState = prevProcessStateRef.current;
    const currentState = activeTab.processState;

    // Process started
    if (prevState === 'idle' && currentState === 'running') {
      notify('info', `Ralph started for ${activeTab.project.name}`);
    }

    // Process completed successfully
    if (prevState === 'running' && currentState === 'idle' && !activeTab.processError) {
      notify('success', `Ralph completed for ${activeTab.project.name}`);
    }

    // Process paused (only on actual transition, not on tab switch)
    if (prevState !== 'paused' && currentState === 'paused') {
      notify('info', `Ralph paused for ${activeTab.project.name} (press r to resume)`);
    }

    // Process stopped
    if (prevState === 'running' && currentState === 'stopping') {
      notify('warning', `Stopping Ralph for ${activeTab.project.name}...`);
    }

    // Process error
    if (currentState === 'idle' && activeTab.processError) {
      notify('error', `Ralph error: ${activeTab.processError}`);
    }

    prevProcessStateRef.current = currentState;
  }, [activeTab?.processState, activeTab?.processError, activeTab?.project.name, notify]);

  // Handle terminal resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        columns: stdout?.columns || 80,
        rows: stdout?.rows || 24,
      });
    };

    stdout?.on('resize', handleResize);
    return () => {
      stdout?.off('resize', handleResize);
    };
  }, [stdout]);

  useEffect(() => {
    remoteServerRef.current = new RalphRemoteServer(7890);

    try {
      remoteServerRef.current.start();
    } catch (error) {
      console.error('Failed to start remote server:', error);
    }

    httpServerRef.current = new RalphHttpServer(7891);
    try {
      httpServerRef.current.start();
    } catch (error) {
      console.error('Failed to start HTTP server:', error);
    }

    const connectionCheckInterval = setInterval(() => {
      if (remoteServerRef.current) {
        setRemoteConnections(remoteServerRef.current.getConnectionCount());
      }
    }, 10000);

    return () => {
      clearInterval(connectionCheckInterval);
      if (remoteServerRef.current) {
        remoteServerRef.current.stop();
      }
      if (httpServerRef.current) {
        httpServerRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (!remoteServerRef.current || !activeTab) return;

    remoteServerRef.current.onCommand(command => {
      switch (command.action) {
        case 'run':
          if (activeTab.processState === 'idle' || activeTab.processState === 'paused') {
            const ignoreApiStatus = process.env['RALPH_IGNORE_API_STATUS'] === 'true';
            const ignoreComplexity = process.env['RALPH_IGNORE_COMPLEXITY'] === 'true';
            getRalphService(activeTabId)
              .run(activeTab.project.path, { ignoreApiStatus, ignoreComplexity })
              .catch(() => {});
          }
          break;
        case 'stop':
          if (activeTab.processState === 'running') {
            getRalphService(activeTabId).stop();
          }
          break;
        case 'focus':
        case 'navigate':
          break;
      }
    });
  }, [activeTab, activeTabId, getRalphService]);

  // Detect Tailscale status
  useEffect(() => {
    const updateTailscaleStatus = async () => {
      const status = await getTailscaleStatus();
      setTailscaleStatus(status);

      if (status.isConnected && remoteServerRef.current) {
        const token = remoteServerRef.current.getToken();
        const url = await generateRemoteURL(token);
        setRemoteURL(url);
      } else {
        setRemoteURL(null);
      }
    };

    updateTailscaleStatus();
    const statusCheckInterval = setInterval(updateTailscaleStatus, 30000);

    return () => {
      clearInterval(statusCheckInterval);
    };
  }, []);

  // Track command execution for recent commands
  const trackCommandExecution = (commandId: string) => {
    setRecentCommands(prev => {
      const filtered = prev.filter(id => id !== commandId);
      return [commandId, ...filtered].slice(0, 5); // Keep last 5
    });
  };

  // Define available commands for command palette
  const commands = [
    // Actions
    {
      id: 'run',
      label: 'Run Ralph',
      description: 'Start Ralph on current project',
      shortcut: 'r',
      category: 'Actions',
      action: async () => {
        if (!activeTab) return;
        if (activeTab.processState === 'idle' || activeTab.processState === 'paused') {
          // Check for complexity warning before running
          const prdPath = join(activeTab.project.path, 'prd.json');
          try {
            const prdContent = readFileSync(prdPath, 'utf-8');
            const prd = JSON.parse(prdContent);
            const nextStory = prd.userStories.find((s: import('../types').UserStory) => !s.passes);

            if (nextStory) {
              const ralphService = getRalphService(activeTabId);
              const warning = ralphService.checkStoryComplexity(nextStory);

              if (warning.isComplex && process.env['RALPH_IGNORE_COMPLEXITY'] !== 'true') {
                setComplexityWarningData({
                  storyId: nextStory.id,
                  reasons: warning.reasons,
                });
                setShowComplexityWarning(true);
                return; // Don't run yet, wait for user confirmation
              }
            }
          } catch {
            // If we can't check complexity, just proceed
          }

          try {
            const ignoreApiStatus = process.env['RALPH_IGNORE_API_STATUS'] === 'true';
            const ignoreComplexity = process.env['RALPH_IGNORE_COMPLEXITY'] === 'true';
            await getRalphService(activeTabId).run(activeTab.project.path, {
              ignoreApiStatus,
              ignoreComplexity,
            });
          } catch {
            // Error handled by service callbacks
          }
        }
      },
    },
    {
      id: 'stop',
      label: 'Stop Ralph',
      description: 'Stop running Ralph process',
      shortcut: 's',
      category: 'Actions',
      action: () => {
        if (activeTab?.processState === 'running' || activeTab?.processState === 'external') {
          getRalphService(activeTabId).stop();
        }
      },
    },
    {
      id: 'quit',
      label: 'Quit',
      description: 'Exit Ralph Ultra',
      shortcut: 'q',
      category: 'Actions',
      action: () => exit(),
    },
    {
      id: 'clear-session',
      label: 'Clear Session',
      description: 'Reset scroll positions and clear log buffers',
      shortcut: 'Ctrl+L',
      category: 'Actions',
      action: () => setShowClearSessionConfirm(true),
    },
    // Views
    {
      id: 'view-monitor',
      label: 'View: Monitor',
      description: 'Show process logs',
      shortcut: '1',
      category: 'Views',
      action: () => {
        updateTab(activeTabId, { workPaneView: 'monitor' });
      },
    },
    {
      id: 'view-status',
      label: 'View: Status',
      description: 'Show system status',
      shortcut: '2',
      category: 'Views',
      action: () => {
        updateTab(activeTabId, { workPaneView: 'status' });
      },
    },
    {
      id: 'view-details',
      label: 'View: Details',
      description: 'Show story details',
      shortcut: '3',
      category: 'Views',
      action: () => {
        updateTab(activeTabId, { workPaneView: 'details' });
      },
    },
    {
      id: 'view-quota',
      label: 'View: Quota',
      description: 'Show API quota dashboard',
      shortcut: '4',
      category: 'Views',
      action: () => {
        updateTab(activeTabId, { workPaneView: 'quota' });
      },
    },
    {
      id: 'view-plan',
      label: 'View: Plan',
      description: 'Show execution plan',
      shortcut: '5',
      category: 'Views',
      action: () => {
        updateTab(activeTabId, { workPaneView: 'plan' });
      },
    },
    {
      id: 'view-help',
      label: 'View: Help',
      description: 'Show help',
      shortcut: '6',
      category: 'Views',
      action: () => {
        updateTab(activeTabId, { workPaneView: 'help' });
      },
    },
    {
      id: 'view-version',
      label: 'View: Version',
      description: 'Show version and system info',
      shortcut: '7',
      category: 'Views',
      action: () => {
        updateTab(activeTabId, { workPaneView: 'version' });
      },
    },
    {
      id: 'view-costs',
      label: 'View: Costs',
      description: 'Show cost tracking dashboard',
      shortcut: '8',
      category: 'Views',
      action: () => {
        updateTab(activeTabId, { workPaneView: 'costs' });
      },
    },
    // Interface
    {
      id: 'help',
      label: 'Help',
      description: 'Show welcome/help overlay',
      shortcut: '?',
      category: 'Interface',
      action: () => setShowWelcome(prev => !prev),
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Open settings panel',
      shortcut: 't',
      category: 'Interface',
      action: () => setShowSettings(prev => !prev),
    },
    {
      id: 'debug',
      label: 'Toggle Debug Mode',
      description: 'Show verbose internal state and timing',
      shortcut: 'd',
      category: 'Interface',
      action: () => {
        if (!activeTab) return;
        const currentDebugMode = activeTab.debugMode || false;
        const newDebugMode = !currentDebugMode;

        updateTab(activeTabId, {
          debugMode: newDebugMode,
        });

        const settings = loadSettings();
        settings.debugMode = newDebugMode;
        saveSettings(settings);

        notify('info', `Debug mode: ${newDebugMode ? 'ON' : 'OFF'}`);
      },
    },
    // Tabs
    {
      id: 'new-tab',
      label: 'New Tab',
      description: 'Open project in new tab',
      shortcut: 'Ctrl+Shift+T',
      category: 'Tabs',
      action: () => setShowProjectPicker(true),
    },
    {
      id: 'close-tab',
      label: 'Close Tab',
      description: 'Close current tab/project',
      shortcut: 'e',
      category: 'Tabs',
      action: () => {
        if (!activeTab) return;
        if (activeTab.processState === 'running') {
          setTabToClose(activeTabId);
          setShowCloseConfirm(true);
        } else {
          closeTab(activeTabId);
        }
      },
    },
    {
      id: 'next-tab',
      label: 'Next Tab',
      description: 'Switch to next tab',
      shortcut: 'Ctrl+Tab',
      category: 'Tabs',
      action: () => nextTab(),
    },
    // Remote
    {
      id: 'copy-url',
      label: 'Copy Remote URL',
      description: 'Copy Tailscale remote URL',
      shortcut: 'c',
      category: 'Remote',
      action: async () => {
        if (remoteURL) {
          await copyToClipboard(remoteURL);
        }
      },
    },
    // Logs
    {
      id: 'cycle-filter',
      label: 'Cycle Log Filter',
      description: 'Cycle through log filter levels (all/errors/warnings+errors)',
      shortcut: 'f',
      category: 'Logs',
      action: () => {
        if (!activeTab) return;
        const currentLevel = activeTab.logFilter?.level || 'all';
        const levels: Array<import('../types').LogFilterLevel> = [
          'all',
          'errors',
          'warnings_errors',
        ];
        const currentIndex = levels.indexOf(currentLevel as import('../types').LogFilterLevel);
        const nextIndex = (currentIndex + 1) % levels.length;
        const nextLevel = levels[nextIndex]!;

        updateTab(activeTabId, {
          logFilter: { level: nextLevel },
        });

        const filterLabels: Record<import('../types').LogFilterLevel, string> = {
          all: 'All logs',
          errors: 'Errors only',
          warnings_errors: 'Warnings & Errors',
        };
        notify('info', `Log filter: ${filterLabels[nextLevel]}`);
      },
    },
  ];

  // Register global keyboard shortcuts
  useEffect(() => {
    if (!activeTab) return;

    const handlers = [
      // Overlays (highest priority)
      {
        key: KeyMatchers.escape,
        handler: () => {
          if (showWelcome) {
            setShowWelcome(false);
            markFirstLaunchComplete();
          } else if (showSettings) {
            setShowSettings(false);
          } else if (showProjectPicker) {
            setShowProjectPicker(false);
          } else if (showCloseConfirm) {
            setShowCloseConfirm(false);
            setTabToClose(null);
          } else if (showComplexityWarning) {
            setShowComplexityWarning(false);
            setComplexityWarningData(null);
          } else if (showCommandPalette) {
            setShowCommandPalette(false);
          }
        },
        priority: KeyPriority.CRITICAL,
        isActive:
          showWelcome ||
          showSettings ||
          showProjectPicker ||
          showCloseConfirm ||
          showComplexityWarning ||
          showCommandPalette,
      },
      // Global shortcuts
      {
        key: 'r',
        handler: async () => {
          if (activeTab.processState !== 'idle' && activeTab.processState !== 'paused') return;

          // Check for complexity warning before running
          const prdPath = join(activeTab.project.path, 'prd.json');
          try {
            const prdContent = readFileSync(prdPath, 'utf-8');
            const prd = JSON.parse(prdContent);
            const nextStory = prd.userStories.find((s: import('../types').UserStory) => !s.passes);

            if (nextStory) {
              const ralphService = getRalphService(activeTabId);
              const warning = ralphService.checkStoryComplexity(nextStory);

              if (warning.isComplex && process.env['RALPH_IGNORE_COMPLEXITY'] !== 'true') {
                setComplexityWarningData({
                  storyId: nextStory.id,
                  reasons: warning.reasons,
                });
                setShowComplexityWarning(true);
                return; // Don't run yet, wait for user confirmation
              }
            }
          } catch {
            // If we can't check complexity, just proceed
          }

          try {
            const ignoreApiStatus = process.env['RALPH_IGNORE_API_STATUS'] === 'true';
            const ignoreComplexity = process.env['RALPH_IGNORE_COMPLEXITY'] === 'true';
            await getRalphService(activeTabId).run(activeTab.project.path, {
              ignoreApiStatus,
              ignoreComplexity,
            });
          } catch (err) {
            notify('error', `Failed to start Ralph: ${err instanceof Error ? err.message : String(err)}`);
          }
        },
        priority: KeyPriority.GLOBAL,
      },
      {
        key: 'R',
        handler: () => {
          if (!activeTab) return;
          if (activeTab.processState !== 'idle' && activeTab.processState !== 'paused') return;
          getRalphService(activeTabId).retryCurrentStory();
        },
        priority: KeyPriority.GLOBAL,
      },
      {
        key: 's',
        handler: () => {
          if (activeTab.processState === 'running' || activeTab.processState === 'external') {
            getRalphService(activeTabId).stop();
          }
        },
        priority: KeyPriority.GLOBAL,
      },
      {
        key: '?',
        handler: () => setShowWelcome(prev => !prev),
        priority: KeyPriority.GLOBAL,
      },
      {
        key: (input: string, key: { ctrl?: boolean; shift?: boolean; meta?: boolean }) =>
          input === 't' && !key.ctrl && !key.shift && !key.meta,
        handler: () => setShowSettings(prev => !prev),
        priority: KeyPriority.GLOBAL,
      },
      {
        key: ':',
        handler: () => setShowCommandPalette(prev => !prev),
        priority: KeyPriority.GLOBAL,
      },
      {
        key: (_input: string, key: { ctrl?: boolean; name?: string }) =>
          Boolean(key.ctrl && key.name === 'p'),
        handler: () => setShowCommandPalette(prev => !prev),
        priority: KeyPriority.GLOBAL,
      },
      {
        key: 'd',
        handler: () => {
          const currentDebugMode = activeTab.debugMode || false;
          const newDebugMode = !currentDebugMode;

          updateTab(activeTabId, {
            debugMode: newDebugMode,
          });

          // Also save to settings for persistence
          const settings = loadSettings();
          settings.debugMode = newDebugMode;
          saveSettings(settings);

          notify('info', `Debug mode: ${newDebugMode ? 'ON' : 'OFF'}`);
        },
        priority: KeyPriority.GLOBAL,
      },
      {
        key: 'f',
        handler: () => {
          // Cycle through log filter levels: all -> errors -> warnings_errors -> all
          const currentLevel = activeTab.logFilter?.level || 'all';
          const levels: Array<import('../types').LogFilterLevel> = [
            'all',
            'errors',
            'warnings_errors',
          ];
          const currentIndex = levels.indexOf(currentLevel as import('../types').LogFilterLevel);
          const nextIndex = (currentIndex + 1) % levels.length;
          const nextLevel = levels[nextIndex]!;

          updateTab(activeTabId, {
            logFilter: { level: nextLevel },
          });

          // Notify user of filter change
          const filterLabels: Record<import('../types').LogFilterLevel, string> = {
            all: 'All logs',
            errors: 'Errors only',
            warnings_errors: 'Warnings & Errors',
          };
          notify('info', `Log filter: ${filterLabels[nextLevel]}`);
        },
        priority: KeyPriority.GLOBAL,
      },
      {
        key: 'c',
        handler: async () => {
          if (remoteURL) {
            await copyToClipboard(remoteURL);
          }
        },
        priority: KeyPriority.GLOBAL,
      },
      {
        key: (input: string) => input === 'q' || input === 'Q',
        handler: () => exit(),
        priority: KeyPriority.GLOBAL,
      },
      // Clear session shortcut (Ctrl+L)
      {
        key: (input: string, key: any) => Boolean(key.ctrl && input === 'l'),
        handler: () => setShowClearSessionConfirm(true),
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showClearSessionConfirm &&
          !showComplexityWarning &&
          !showCommandPalette,
      },
      // Filter shortcut
      {
        key: 'f',
        handler: () => {
          if (activeTab.workPaneView === 'monitor') {
            // Cycle through filter levels
            const currentLevel = activeTab.logFilter?.level || 'all';
            const levels: import('../types').LogFilterLevel[] = [
              'all',
              'errors',
              'warnings_errors',
            ];
            const currentIndex = levels.indexOf(currentLevel);
            const nextIndex = (currentIndex + 1) % levels.length;
            const nextLevel = levels[nextIndex]!;

            updateTab(activeTabId, {
              logFilter: {
                level: nextLevel,
              },
            });

            // Notify user of filter change
            const filterNames: Record<import('../types').LogFilterLevel, string> = {
              all: 'All logs',
              errors: 'Errors only',
              warnings_errors: 'Warnings & Errors',
            };
            notify('info', `Filter: ${filterNames[nextLevel]}`);
          }
        },
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette,
      },
      // Search shortcuts
      {
        key: '/',
        handler: () => {
          if (activeTab.workPaneView === 'monitor') {
            updateTab(activeTabId, {
              searchState: {
                ...activeTab.searchState,
                searchMode: true,
                searchQuery: '',
                currentMatchIndex: 0,
                totalMatches: 0,
                matchingLines: [],
              },
            });
          }
        },
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette,
      },
      {
        key: 'n',
        handler: () => {
          if (activeTab.searchState?.searchMode && activeTab.searchState.totalMatches > 0) {
            const nextIndex =
              (activeTab.searchState.currentMatchIndex + 1) % activeTab.searchState.totalMatches;
            updateTab(activeTabId, {
              searchState: {
                ...activeTab.searchState,
                currentMatchIndex: nextIndex,
              },
            });
          } else {
            // Original 'n' handler - show project picker
            setShowProjectPicker(true);
          }
        },
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette,
      },
      {
        key: 'N',
        handler: () => {
          if (activeTab.searchState?.searchMode && activeTab.searchState.totalMatches > 0) {
            const prevIndex =
              activeTab.searchState.currentMatchIndex === 0
                ? activeTab.searchState.totalMatches - 1
                : activeTab.searchState.currentMatchIndex - 1;
            updateTab(activeTabId, {
              searchState: {
                ...activeTab.searchState,
                currentMatchIndex: prevIndex,
              },
            });
          }
        },
        priority: KeyPriority.GLOBAL,
        isActive: activeTab.searchState?.searchMode === true,
      },
      {
        key: KeyMatchers.escape,
        handler: () => {
          if (activeTab.searchState?.searchMode) {
            updateTab(activeTabId, {
              searchState: {
                searchQuery: '',
                searchMode: false,
                currentMatchIndex: 0,
                totalMatches: 0,
                matchingLines: [],
              },
            });
          }
        },
        priority: KeyPriority.GLOBAL,
        isActive: activeTab.searchState?.searchMode === true,
      },
      // Goto story shortcuts
      {
        key: 'g',
        handler: () => {
          if (isFocused('sessions')) {
            updateTab(activeTabId, {
              gotoState: {
                gotoMode: true,
                gotoInput: '',
                gotoError: null,
              },
            });
          }
        },
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette &&
          !activeTab.gotoState?.gotoMode,
      },
      {
        key: (_input: string, _key: import('readline').Key) => {
          return !!(activeTab.gotoState?.gotoMode && _input && /^[0-9]$/.test(_input));
        },
        handler: (input: string) => {
          if (activeTab.gotoState?.gotoMode) {
            updateTab(activeTabId, {
              gotoState: {
                ...activeTab.gotoState,
                gotoInput: activeTab.gotoState.gotoInput + input,
                gotoError: null,
              },
            });
          }
        },
        priority: KeyPriority.GLOBAL,
        isActive: activeTab.gotoState?.gotoMode === true,
      },
      {
        key: KeyMatchers.backspace,
        handler: () => {
          if (activeTab.gotoState?.gotoMode && activeTab.gotoState.gotoInput.length > 0) {
            updateTab(activeTabId, {
              gotoState: {
                ...activeTab.gotoState,
                gotoInput: activeTab.gotoState.gotoInput.slice(0, -1),
                gotoError: null,
              },
            });
          }
        },
        priority: KeyPriority.GLOBAL,
        isActive: activeTab.gotoState?.gotoMode === true,
      },
      {
        key: KeyMatchers.return,
        handler: () => {
          if (activeTab.gotoState?.gotoMode) {
            const input = activeTab.gotoState.gotoInput;
            if (!input) {
              // Empty input - just cancel
              updateTab(activeTabId, {
                gotoState: {
                  gotoMode: false,
                  gotoInput: '',
                  gotoError: null,
                },
              });
              return;
            }

            // Try to load PRD and find story
            try {
              const prdPath = join(activeTab.project.path, 'prd.json');
              const prdContent = readFileSync(prdPath, 'utf-8');
              const prd: PRD = JSON.parse(prdContent);

              // Try matching by story number (1-based) or story ID
              const storyNumber = parseInt(input, 10);
              let storyIndex = -1;

              if (
                !isNaN(storyNumber) &&
                storyNumber >= 1 &&
                storyNumber <= prd.userStories.length
              ) {
                // Valid story number (1-based)
                storyIndex = storyNumber - 1;
              } else {
                // Try to find by story ID (e.g., "US-001")
                storyIndex = prd.userStories.findIndex(s => s.id === input);
              }

              if (storyIndex !== -1) {
                // Valid story found - jump to it
                updateTab(activeTabId, {
                  sessionsScrollIndex: storyIndex,
                  selectedStoryId: prd.userStories[storyIndex]!.id,
                  gotoState: {
                    gotoMode: false,
                    gotoInput: '',
                    gotoError: null,
                  },
                });
              } else {
                // Invalid story
                updateTab(activeTabId, {
                  gotoState: {
                    ...activeTab.gotoState,
                    gotoError: 'Story not found',
                  },
                });
              }
            } catch (error) {
              updateTab(activeTabId, {
                gotoState: {
                  ...activeTab.gotoState,
                  gotoError: 'Failed to load PRD',
                },
              });
            }
          }
        },
        priority: KeyPriority.GLOBAL,
        isActive: activeTab.gotoState?.gotoMode === true,
      },
      {
        key: KeyMatchers.escape,
        handler: () => {
          if (activeTab.gotoState?.gotoMode) {
            updateTab(activeTabId, {
              gotoState: {
                gotoMode: false,
                gotoInput: '',
                gotoError: null,
              },
            });
          }
        },
        priority: KeyPriority.GLOBAL,
        isActive: activeTab.gotoState?.gotoMode === true,
      },
      // View switching (1-7)
      {
        key: '1',
        handler: () => updateTab(activeTabId, { workPaneView: 'monitor' }),
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette &&
          !activeTab.gotoState?.gotoMode,
      },
      {
        key: '2',
        handler: () => updateTab(activeTabId, { workPaneView: 'status' }),
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette &&
          !activeTab.gotoState?.gotoMode,
      },
      {
        key: '3',
        handler: () => updateTab(activeTabId, { workPaneView: 'details' }),
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette &&
          !activeTab.gotoState?.gotoMode,
      },
      {
        key: '4',
        handler: () => updateTab(activeTabId, { workPaneView: 'quota' }),
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette &&
          !activeTab.gotoState?.gotoMode,
      },
      {
        key: '5',
        handler: () => updateTab(activeTabId, { workPaneView: 'plan' }),
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette &&
          !activeTab.gotoState?.gotoMode,
      },
      {
        key: '6',
        handler: () => updateTab(activeTabId, { workPaneView: 'help' }),
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette &&
          !activeTab.gotoState?.gotoMode,
      },
      {
        key: '7',
        handler: () => updateTab(activeTabId, { workPaneView: 'version' }),
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette &&
          !activeTab.gotoState?.gotoMode,
      },
      {
        key: '8',
        handler: () => updateTab(activeTabId, { workPaneView: 'costs' }),
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette &&
          !activeTab.gotoState?.gotoMode,
      },
      // Tab switching (removed 'n' key since it's now used for search navigation)
      {
        key: (_input: string, key: { ctrl?: boolean; shift?: boolean; name?: string }) =>
          Boolean(key.ctrl && key.shift && key.name === 't'),
        handler: () => setShowProjectPicker(true),
        priority: KeyPriority.GLOBAL,
      },
      {
        key: (input: string, key: { ctrl?: boolean; shift?: boolean; name?: string }) =>
          input === 'e' ||
          Boolean(
            key.ctrl &&
            key.shift &&
            (key.name === 'w' || key.name === 'W' || input.toLowerCase() === 'w'),
          ),
        handler: () => {
          if (!activeTab) return;
          if (activeTab.processState === 'running') {
            setTabToClose(activeTabId);
            setShowCloseConfirm(true);
          } else {
            closeTab(activeTabId);
          }
        },
        priority: KeyPriority.GLOBAL,
      },
      {
        key: (_input: string, key: { ctrl?: boolean; tab?: boolean }) =>
          Boolean(key.ctrl && key.tab),
        handler: () => nextTab(),
        priority: KeyPriority.GLOBAL,
      },
      {
        key: KeyMatchers.tab,
        handler: cycleFocus,
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
          !showComplexityWarning &&
          !showCommandPalette,
      },
    ];

    handlers.forEach(handler => registerHandler(handler));
    return () => {
      handlers.forEach(handler => unregisterHandler(handler));
    };
  }, [
    showWelcome,
    showSettings,
    showProjectPicker,
    showCloseConfirm,
    showComplexityWarning,
    showCommandPalette,
    activeTab,
    activeTabId,
    tabs,
    cycleFocus,
    exit,
    registerHandler,
    unregisterHandler,
    getRalphService,
    closeTab,
    nextTab,
    switchToTabNumber,
    updateTab,
    remoteURL,
    notify,
  ]);

  // Check minimum terminal size
  const minColumns = 80;
  const minRows = 24;
  const isTooSmall = dimensions.columns < minColumns || dimensions.rows < minRows;

  if (isTooSmall) {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        height={dimensions.rows}
      >
        <Text bold color={theme.error}>
          Terminal Too Small
        </Text>
        <Text color={theme.foreground}>
          Current: {dimensions.columns}x{dimensions.rows}
        </Text>
        <Text color={theme.foreground}>
          Minimum: {minColumns}x{minRows}
        </Text>
        <Text color={theme.muted}>Please resize your terminal window</Text>
      </Box>
    );
  }

  // No projects open — show fullscreen project picker
  if (!activeTab) {
    return (
      <ProjectPicker
        width={dimensions.columns}
        height={dimensions.rows}
        projects={[]}
        openProjectIds={[]}
        onSelect={project => {
          openTab(project);
        }}
      />
    );
  }

  const sessionsWidth = Math.max(30, Math.floor(dimensions.columns * 0.4));
  const workWidth = Math.max(40, dimensions.columns - sessionsWidth);
  const contentHeight = dimensions.rows - 3;

  return (
    <Box flexDirection="column" height={dimensions.rows}>
      {/* Status Bar (Top) */}
      <StatusBar
        width={dimensions.columns}
        progress={
          prd
            ? Math.round(
                (prd.userStories.filter(s => s.passes).length / prd.userStories.length) * 100,
              )
            : 0
        }
        remoteConnections={remoteConnections}
        tailscaleStatus={tailscaleStatus}
        apiStatus={apiStatus}
        projectPath={activeTab.project.path}
        executionMode={executionMode}
        currentCLI={activeTab.availableCLI}
        currentModel={activeTab.currentModel}
      />

      <TabBar
        width={dimensions.columns}
        tabs={tabs}
        activeTabId={activeTabId}
        isFocused={isFocused('tabs')}
        onSelectTab={switchTab}
      />

      <Box flexGrow={1} flexDirection="row">
        <SessionsPane
          isFocused={isFocused('sessions')}
          height={contentHeight}
          projectPath={activeTab.project.path}
          onStorySelect={handleStorySelect}
          onStoryEnter={story => {
            handleStorySelect(story);
            updateTab(activeTabId, { workPaneView: 'details' });
          }}
          onStoryJump={async story => {
            // Jump directly to the selected story, skipping previous uncompleted ones
            if (activeTab.processState !== 'idle') {
              // Can't jump when Ralph is running
              return;
            }
            try {
              const ignoreApiStatus = process.env['RALPH_IGNORE_API_STATUS'] === 'true';
              const ignoreComplexity = process.env['RALPH_IGNORE_COMPLEXITY'] === 'true';
              await getRalphService(activeTabId).runStory(activeTab.project.path, story.id, {
                ignoreApiStatus,
                ignoreComplexity,
              });
            } catch {
              // Error will be handled by the service's output callbacks
            }
          }}
          initialScrollIndex={activeTab.sessionsScrollIndex}
          initialSelectedStoryId={activeTab.selectedStoryId}
          gotoState={activeTab.gotoState}
          pausedStoryIds={pausedStoryIds}
        />

        <WorkPane
          isFocused={isFocused('work')}
          height={contentHeight}
          width={workWidth}
          projectPath={activeTab.project.path}
          selectedStory={activeTab.selectedStory}
          logLines={activeTab.logLines}
          processState={activeTab.processState}
          processError={activeTab.processError}
          processPid={activeTab.processPid}
          tailscaleStatus={tailscaleStatus}
          remoteURL={remoteURL}
          initialView={activeTab.workPaneView}
          initialScrollOffset={activeTab.workScrollOffset}
          availableCLI={activeTab.availableCLI}
          lastRunDuration={activeTab.lastRunDuration}
          lastRunExitCode={activeTab.lastRunExitCode}
          currentStory={activeTab.currentStory}
          retryCount={activeTab.retryCount}
          logFilter={activeTab.logFilter}
          allStoriesComplete={prd ? prd.userStories.every(s => s.passes) : false}
          liveOutput={liveOutput}
          agentActivity={agentActivity}
        />
      </Box>

      {/* Shortcuts Bar (Bottom) */}
      <ShortcutsBar
        width={dimensions.columns}
        focusPane={focusPane}
        workPaneView={activeTab.workPaneView}
        isPaused={activeTab.processState === 'paused'}
      />

      {/* Welcome/Help Overlay */}
      <WelcomeOverlay
        visible={showWelcome}
        onDismiss={() => {
          setShowWelcome(false);
          markFirstLaunchComplete();
        }}
        width={dimensions.columns}
        height={dimensions.rows}
      />

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          width={dimensions.columns}
          height={dimensions.rows}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showProjectPicker && (
        <ProjectPicker
          width={dimensions.columns}
          height={dimensions.rows}
          projects={[]}
          openProjectIds={tabs.map(t => t.project.path)}
          onSelect={project => {
            openTab(project);
            setShowProjectPicker(false);
          }}
          onCancel={() => setShowProjectPicker(false)}
        />
      )}

      {/* Close Confirmation Dialog (Ctrl+W with running process) */}
      {showCloseConfirm && tabToClose && (
        <ConfirmDialog
          width={dimensions.columns}
          height={dimensions.rows}
          title="Close Running Tab?"
          message={`Ralph is currently running in "${activeTab.project.name}". Close anyway?`}
          onConfirm={() => {
            closeTab(tabToClose);
            setShowCloseConfirm(false);
            setTabToClose(null);
          }}
          onCancel={() => {
            setShowCloseConfirm(false);
            setTabToClose(null);
          }}
        />
      )}

      {/* Complexity Warning Dialog */}
      {showComplexityWarning && complexityWarningData && (
        <ConfirmDialog
          width={dimensions.columns}
          height={dimensions.rows}
          title={`Story ${complexityWarningData.storyId} May Be Too Complex`}
          message={`${complexityWarningData.reasons.join('. ')}. Consider breaking this into smaller stories. Proceed anyway?`}
          onConfirm={async () => {
            // User acknowledged warning and chose to proceed anyway
            const acknowledgeWarning = true;
            const proceedAnyway = acknowledgeWarning;
            const complexityOverride = proceedAnyway;

            setShowComplexityWarning(false);
            setComplexityWarningData(null);
            try {
              const ignoreApiStatus = process.env['RALPH_IGNORE_API_STATUS'] === 'true';
              await getRalphService(activeTabId).run(activeTab.project.path, {
                ignoreApiStatus,
                ignoreComplexity: complexityOverride, // Override complexity check
              });
            } catch {
              // Error handled by service callbacks
            }
          }}
          onCancel={() => {
            setShowComplexityWarning(false);
            setComplexityWarningData(null);
          }}
        />
      )}

      {/* Clear Session Confirmation Dialog */}
      {showClearSessionConfirm && (
        <ConfirmDialog
          width={dimensions.columns}
          height={dimensions.rows}
          title="Clear Session?"
          message="This will reset scroll positions, clear log buffers, and reset view state. Continue?"
          onConfirm={handleClearSession}
          onCancel={() => setShowClearSessionConfirm(false)}
        />
      )}

      {/* Command Palette (Ctrl+P or ':') */}
      {showCommandPalette && (
        <CommandPalette
          visible={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
          width={dimensions.columns}
          height={dimensions.rows}
          commands={commands}
          recentCommands={recentCommands}
          onCommandExecuted={trackCommandExecution}
        />
      )}

      <NotificationToast notifications={notifications} terminalWidth={dimensions.columns} />
    </Box>
  );
};
