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
import { useTheme } from '@hooks/useTheme';
import { useFocus } from '@hooks/useFocus';
import { useKeyboard, KeyMatchers, KeyPriority } from '@hooks/useKeyboard';
import { useTabs } from '@hooks/useTabs';
import { useMultiTabSession } from '@hooks/useMultiTabSession';
import { isFirstLaunch, markFirstLaunchComplete } from '../utils/config';
import { RalphRemoteServer } from '../remote/server';
import { RalphHttpServer } from '../remote/http-server';
import { getTailscaleStatus, generateRemoteURL, copyToClipboard, type TailscaleStatus } from '../remote/tailscale';
import type { Project } from '../types';

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

  const [dimensions, setDimensions] = useState({
    columns: stdout?.columns || 80,
    rows: stdout?.rows || 24,
  });
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
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

  // Check for first launch
  useEffect(() => {
    if (isFirstLaunch()) {
      setShowWelcome(true);
    }
  }, []);

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
            getRalphService(activeTabId).run(activeTab.project.path).catch(() => {});
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
          }
        },
        priority: KeyPriority.CRITICAL,
        isActive: showWelcome || showSettings || showProjectPicker || showCloseConfirm,
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
        isActive: !showWelcome && !showSettings && !showProjectPicker && !showCloseConfirm,
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
    </Box>
  );
};
