import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdout, useApp } from 'ink';
import { ProjectsRail } from './ProjectsRail';
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
import { isFirstLaunch, markFirstLaunchComplete } from '../utils/config';
import { RalphRemoteServer } from '../remote/server';
import { RalphHttpServer } from '../remote/http-server';
import {
  getTailscaleStatus,
  generateRemoteURL,
  copyToClipboard,
  type TailscaleStatus,
} from '../remote/tailscale';
import type { Project, PRD } from '../types';
import { readFileSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';

/**
 * Main application component with multi-tab support
 * - Projects rail (left): 12 chars expanded, 3 chars collapsed
 * - Sessions pane (middle): flexible width, min 30 chars
 * - Work pane (right): flexible width, min 40 chars
 * - Tab bar (below status bar when multiple projects open)
 */
export const App: React.FC = () => {
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
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [tabToClose, setTabToClose] = useState<string | null>(null);
  const [remoteConnections, setRemoteConnections] = useState(0);
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(null);
  const [remoteURL, setRemoteURL] = useState<string | null>(null);
  const remoteServerRef = useRef<RalphRemoteServer | null>(null);
  const httpServerRef = useRef<RalphHttpServer | null>(null);

  // Mock projects for demonstration
  const currentPath = process.cwd();
  const [projects] = useState<Project[]>([
    { id: '1', name: 'ralph-ultra', path: currentPath, color: '#7FFFD4' },
    { id: '2', name: 'my-app', path: '/path/to/my-app', color: '#CC5500' },
    { id: '3', name: 'backend-api', path: '/path/to/backend', color: '#FFD700' },
  ]);

  // Multi-tab state management
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
    getAgentTree,
  } = useTabs(projects);

  // Session persistence for multi-tab state
  useMultiTabSession(tabs, activeTabId, railCollapsed, focusPane);

  // Track previous process state for notifications
  const prevProcessStateRef = useRef<typeof activeTab.processState>(activeTab.processState);
  const prevPassCountRef = useRef<number>(0);
  const [prd, setPrd] = useState<PRD | null>(null);

  // Load and watch PRD file for story completion notifications
  useEffect(() => {
    const loadPRD = () => {
      try {
        const prdPath = join(activeTab.project.path, 'prd.json');
        const content = readFileSync(prdPath, 'utf-8');
        const data = JSON.parse(content) as PRD;
        setPrd(data);
      } catch {
        setPrd(null);
      }
    };

    loadPRD();

    const prdPath = join(activeTab.project.path, 'prd.json');
    watchFile(prdPath, { interval: 1000 }, loadPRD);

    return () => {
      unwatchFile(prdPath, loadPRD);
    };
  }, [activeTab.project.path]);

  // Trigger notification on story completion
  useEffect(() => {
    if (!prd) return;

    const passCount = prd.userStories.filter(s => s.passes).length;
    const totalCount = prd.userStories.length;

    // Story completed
    if (passCount > prevPassCountRef.current && prevPassCountRef.current > 0) {
      const completedStory = prd.userStories.find((s, i) => {
        return s.passes && i === passCount - 1;
      });
      if (completedStory) {
        notify('success', `Story completed: ${completedStory.id} - ${completedStory.title}`);
      }
    }

    // All stories completed
    if (passCount === totalCount && passCount > 0 && prevPassCountRef.current < totalCount) {
      notify('success', '🎉 All stories completed! Project complete!', 8000);
    }

    prevPassCountRef.current = passCount;
  }, [prd, notify]);

  // Check for first launch
  useEffect(() => {
    if (isFirstLaunch()) {
      setShowWelcome(true);
    }
  }, []);

  // Trigger notifications on process state changes
  useEffect(() => {
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

    // Process stopped
    if (prevState === 'running' && currentState === 'stopping') {
      notify('warning', `Stopping Ralph for ${activeTab.project.name}...`);
    }

    // Process error
    if (currentState === 'idle' && activeTab.processError) {
      notify('error', `Ralph error: ${activeTab.processError}`);
    }

    prevProcessStateRef.current = currentState;
  }, [activeTab.processState, activeTab.processError, activeTab.project.name, notify]);

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

  // Initialize RemoteServer and HttpServer
  useEffect(() => {
    remoteServerRef.current = new RalphRemoteServer(7890);

    remoteServerRef.current.onCommand(command => {
      switch (command.action) {
        case 'run':
          if (activeTab.processState === 'idle') {
            getRalphService(activeTabId)
              .run(activeTab.project.path)
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
    }, 1000);

    return () => {
      clearInterval(connectionCheckInterval);
      if (remoteServerRef.current) {
        remoteServerRef.current.stop();
      }
      if (httpServerRef.current) {
        httpServerRef.current.stop();
      }
    };
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
        if (activeTab.processState === 'idle') {
          try {
            await getRalphService(activeTabId).run(activeTab.project.path);
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
        if (activeTab.processState === 'running') {
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
      id: 'view-help',
      label: 'View: Help',
      description: 'Show help',
      shortcut: '4',
      category: 'Views',
      action: () => {
        updateTab(activeTabId, { workPaneView: 'help' });
      },
    },
    {
      id: 'view-tracing',
      label: 'View: Tracing',
      description: 'Show subagent tracing',
      shortcut: '5',
      category: 'Views',
      action: () => {
        updateTab(activeTabId, { workPaneView: 'tracing' });
      },
    },
    // Interface
    {
      id: 'toggle-rail',
      label: 'Toggle Projects Rail',
      description: 'Collapse/expand projects rail',
      shortcut: '[',
      category: 'Interface',
      action: () => setRailCollapsed(prev => !prev),
    },
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
      description: 'Close current tab',
      shortcut: 'Ctrl+Shift+W',
      category: 'Tabs',
      action: () => {
        if (tabs.length > 1) {
          if (activeTab.processState === 'running') {
            setTabToClose(activeTabId);
            setShowCloseConfirm(true);
          } else {
            closeTab(activeTabId);
          }
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
  ];

  // Register global keyboard shortcuts
  useEffect(() => {
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
          showCommandPalette,
      },
      // Global shortcuts
      {
        key: '[',
        handler: () => setRailCollapsed(prev => !prev),
        priority: KeyPriority.GLOBAL,
      },
      {
        key: 'r',
        handler: async () => {
          if (activeTab.processState !== 'idle') return;
          try {
            await getRalphService(activeTabId).run(activeTab.project.path);
          } catch {
            // Error handled by service callbacks
          }
        },
        priority: KeyPriority.GLOBAL,
      },
      {
        key: 's',
        handler: () => {
          if (activeTab.processState === 'running') {
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
        key: 't',
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
      // Tab switching (Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+1/2/3...)
      {
        key: (_input: string, key: { ctrl?: boolean; shift?: boolean; name?: string }) =>
          Boolean(key.ctrl && key.shift && key.name === 't'),
        handler: () => setShowProjectPicker(true),
        priority: KeyPriority.GLOBAL,
      },
      {
        key: (_input: string, key: { ctrl?: boolean; shift?: boolean; name?: string }) =>
          Boolean(key.ctrl && key.shift && key.name === 'w'),
        handler: () => {
          if (tabs.length > 1) {
            // Check if Ralph is running
            if (activeTab.processState === 'running') {
              setTabToClose(activeTabId);
              setShowCloseConfirm(true);
            } else {
              closeTab(activeTabId);
            }
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
      // Ctrl+1/2/3/4/5 for direct tab switching
      ...[1, 2, 3, 4, 5].map(num => ({
        key: (_input: string, key: { ctrl?: boolean; name?: string }) =>
          Boolean(key.ctrl && key.name === String(num)),
        handler: () => switchToTabNumber(num),
        priority: KeyPriority.GLOBAL,
      })),
      // Tab: cycle focus
      {
        key: KeyMatchers.tab,
        handler: cycleFocus,
        priority: KeyPriority.GLOBAL,
        isActive:
          !showWelcome &&
          !showSettings &&
          !showProjectPicker &&
          !showCloseConfirm &&
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

  // Calculate pane widths
  const railWidth = railCollapsed ? 3 : 12;
  const remainingWidth = dimensions.columns - railWidth;
  const sessionsWidth = Math.max(30, Math.floor(remainingWidth * 0.4));
  const workWidth = Math.max(40, remainingWidth - sessionsWidth);

  // Calculate height accounting for StatusBar, TabBar (if shown), and ShortcutsBar
  const tabBarHeight = tabs.length > 1 ? 1 : 0;
  const contentHeight = dimensions.rows - 2 - tabBarHeight; // StatusBar + ShortcutsBar + optional TabBar

  return (
    <Box flexDirection="column" height={dimensions.rows}>
      {/* Status Bar (Top) */}
      <StatusBar
        width={dimensions.columns}
        agentName="claude-sonnet-4-20250514"
        progress={67}
        remoteConnections={remoteConnections}
        tailscaleStatus={tailscaleStatus}
      />

      {/* Tab Bar (below status bar when multiple tabs open) */}
      {tabs.length > 1 && (
        <TabBar
          width={dimensions.columns}
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={switchTab}
        />
      )}

      {/* Main three-pane layout */}
      <Box flexGrow={1}>
        {/* Projects Rail (Left) */}
        <Box
          width={railWidth}
          flexDirection="column"
          borderStyle="single"
          borderColor={isFocused('rail') ? theme.borderFocused : theme.border}
        >
          <ProjectsRail
            collapsed={railCollapsed}
            onToggleCollapse={() => setRailCollapsed(!railCollapsed)}
            projects={projects}
            activeProjectId={activeTab.project.id}
            onSelectProject={projectId => {
              const project = projects.find(p => p.id === projectId);
              if (project) {
                openTab(project);
              }
            }}
            hasFocus={isFocused('rail')}
          />
        </Box>

        {/* Sessions/Tasks Pane (Middle) */}
        <SessionsPane
          isFocused={isFocused('sessions')}
          height={contentHeight}
          projectPath={activeTab.project.path}
          onStorySelect={story => {
            updateTab(activeTabId, {
              selectedStory: story,
              selectedStoryId: story?.id || null,
            });
          }}
          initialScrollIndex={activeTab.sessionsScrollIndex}
          initialSelectedStoryId={activeTab.selectedStoryId}
        />

        {/* Work Pane (Right) */}
        <WorkPane
          isFocused={isFocused('work')}
          height={contentHeight}
          width={workWidth}
          projectPath={activeTab.project.path}
          selectedStory={activeTab.selectedStory}
          logLines={activeTab.logLines}
          processState={activeTab.processState}
          processError={activeTab.processError}
          tailscaleStatus={tailscaleStatus}
          remoteURL={remoteURL}
          agentTree={getAgentTree(activeTabId)}
          initialView={activeTab.workPaneView}
          initialScrollOffset={activeTab.workScrollOffset}
        />
      </Box>

      {/* Shortcuts Bar (Bottom) */}
      <ShortcutsBar width={dimensions.columns} focusPane={focusPane} />

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

      {/* Project Picker (Ctrl+T) */}
      {showProjectPicker && (
        <ProjectPicker
          width={dimensions.columns}
          height={dimensions.rows}
          projects={projects}
          openProjectIds={tabs.map(t => t.project.id)}
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

      {/* Notification Toast (Top-right) */}
      <NotificationToast notifications={notifications} terminalWidth={dimensions.columns} />

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
    </Box>
  );
};
