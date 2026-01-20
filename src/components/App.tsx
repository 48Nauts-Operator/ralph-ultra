import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdout, useApp } from 'ink';
import { ProjectsRail } from './ProjectsRail';
import { SessionsPane } from './SessionsPane';
import { WorkPane } from './WorkPane';
import { StatusBar } from './StatusBar';
import { ShortcutsBar } from './ShortcutsBar';
import { WelcomeOverlay } from './WelcomeOverlay';
import { SettingsPanel } from './SettingsPanel';
import { useTheme } from '@hooks/useTheme';
import { useFocus } from '@hooks/useFocus';
import { useKeyboard, KeyMatchers, KeyPriority } from '@hooks/useKeyboard';
import { isFirstLaunch, markFirstLaunchComplete } from '../utils/config';
import { RalphService, type ProcessState } from '../utils/ralph-service';
import { RalphRemoteServer } from '../remote/server';
import { RalphHttpServer } from '../remote/http-server';
import { getTailscaleStatus, generateRemoteURL, copyToClipboard, type TailscaleStatus } from '../remote/tailscale';
import { parseAgentTree } from '../utils/log-parser';
import type { AgentNode } from './TracingPane';
import type { Project, UserStory } from '../types';

/**
 * Main application component with three-pane layout
 * - Projects rail (left): 12 chars expanded, 3 chars collapsed
 * - Sessions pane (middle): flexible width, min 30 chars
 * - Work pane (right): flexible width, min 40 chars
 */
export const App: React.FC = () => {
  const { theme } = useTheme();
  const { stdout } = useStdout();
  const { exit } = useApp();
  const { focusPane, cycleFocus, isFocused } = useFocus();
  const { registerHandler, unregisterHandler } = useKeyboard({
    globalDebounce: 50, // 50ms debounce for all keys
  });

  const [dimensions, setDimensions] = useState({
    columns: stdout?.columns || 80,
    rows: stdout?.rows || 24,
  });
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [processState, setProcessState] = useState<ProcessState>('idle');
  const [processError, setProcessError] = useState<string | undefined>();
  const [logLines, setLogLines] = useState<string[]>([]);
  const [selectedStory, setSelectedStory] = useState<UserStory | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [remoteConnections, setRemoteConnections] = useState(0);
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(null);
  const [remoteURL, setRemoteURL] = useState<string | null>(null);
  const [agentTree, setAgentTree] = useState<AgentNode[]>([]);
  const ralphServiceRef = useRef<RalphService | null>(null);
  const remoteServerRef = useRef<RalphRemoteServer | null>(null);
  const httpServerRef = useRef<RalphHttpServer | null>(null);

  // Mock projects for demonstration (will be loaded from filesystem in later stories)
  // For now, use current working directory as the active project
  const currentPath = process.cwd();
  const [projects] = useState<Project[]>([
    { id: '1', name: 'ralph-ultra', path: currentPath, color: '#7FFFD4' },
    { id: '2', name: 'my-app', path: '/path/to/my-app', color: '#CC5500' },
    { id: '3', name: 'backend-api', path: '/path/to/backend', color: '#FFD700' },
  ]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>('1');

  // Initialize RalphService
  useEffect(() => {
    const projectPath = projects.find(p => p.id === activeProjectId)?.path || currentPath;
    ralphServiceRef.current = new RalphService(projectPath);

    // Clear logs when switching projects
    setLogLines([]);

    // Register callbacks
    ralphServiceRef.current.onStatusChange(status => {
      setProcessState(status.state);
      setProcessError(status.error);

      // Broadcast state to remote clients
      if (remoteServerRef.current) {
        remoteServerRef.current.broadcastState({
          processState: status.state,
          selectedStory: selectedStory?.id,
          progress: 67, // TODO: calculate from actual progress
          elapsedSeconds: 0, // TODO: use actual elapsed time
        });
      }
    });

    ralphServiceRef.current.onOutput((line, type) => {
      const formattedLine = `${type === 'stderr' ? '[ERR] ' : ''}${line}`;
      setLogLines(prev => {
        const newLines = [...prev, formattedLine];
        // Parse agent tree from updated log lines
        setAgentTree(parseAgentTree(newLines));
        return newLines;
      });

      // Broadcast log to remote clients
      if (remoteServerRef.current) {
        remoteServerRef.current.broadcastLog(formattedLine);
      }
    });

    return () => {
      // Cleanup: stop process if running
      if (ralphServiceRef.current) {
        ralphServiceRef.current.stop();
      }
    };
  }, [activeProjectId, projects, currentPath, selectedStory]);

  // Initialize RemoteServer and HttpServer
  useEffect(() => {
    // Start WebSocket server
    remoteServerRef.current = new RalphRemoteServer(7890);

    // Register command handler
    remoteServerRef.current.onCommand(command => {
      switch (command.action) {
        case 'run':
          if (processState === 'idle') {
            const projectPath = projects.find(p => p.id === activeProjectId)?.path || currentPath;
            ralphServiceRef.current?.run(projectPath).catch(() => {
              // Error is already handled by RalphService callbacks
            });
          }
          break;
        case 'stop':
          if (processState === 'running') {
            ralphServiceRef.current?.stop();
          }
          break;
        // TODO: Implement focus and navigate commands
        case 'focus':
        case 'navigate':
          break;
      }
    });

    // Start WebSocket server
    try {
      remoteServerRef.current.start();
    } catch (error) {
      console.error('Failed to start remote server:', error);
    }

    // Start HTTP server for remote client
    httpServerRef.current = new RalphHttpServer(7891);
    try {
      httpServerRef.current.start();
    } catch (error) {
      console.error('Failed to start HTTP server:', error);
    }

    // Update connection count periodically
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
  }, [activeProjectId, projects, currentPath, processState]);

  // Detect Tailscale status and generate remote URL
  useEffect(() => {
    const updateTailscaleStatus = async () => {
      const status = await getTailscaleStatus();
      setTailscaleStatus(status);

      // Generate remote URL if Tailscale is connected
      if (status.isConnected && remoteServerRef.current) {
        const token = remoteServerRef.current.getToken();
        const url = await generateRemoteURL(token);
        setRemoteURL(url);
      } else {
        setRemoteURL(null);
      }
    };

    // Initial check
    updateTailscaleStatus();

    // Refresh status every 30 seconds
    const statusCheckInterval = setInterval(updateTailscaleStatus, 30000);

    return () => {
      clearInterval(statusCheckInterval);
    };
  }, []);

  // Check for first launch
  useEffect(() => {
    if (isFirstLaunch()) {
      setShowWelcome(true);
    }
  }, []);

  // Handle welcome overlay dismissal
  const handleWelcomeDismiss = () => {
    setShowWelcome(false);
    markFirstLaunchComplete();
  };

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

  // Register global keyboard shortcuts
  useEffect(() => {
    const handlers = [
      // Overlays (highest priority - they consume keys when active)
      {
        key: KeyMatchers.escape,
        handler: () => {
          if (showWelcome) {
            setShowWelcome(false);
            markFirstLaunchComplete();
          } else if (showSettings) {
            setShowSettings(false);
          }
        },
        priority: KeyPriority.CRITICAL,
        isActive: showWelcome || showSettings,
      },
      {
        key: (input: string) => input !== '' && !input.match(/^[a-zA-Z0-9]$/),
        handler: () => {
          if (showWelcome) {
            setShowWelcome(false);
            markFirstLaunchComplete();
          }
        },
        priority: KeyPriority.CRITICAL,
        isActive: showWelcome,
      },
      // Global shortcuts (work anywhere)
      {
        key: '[',
        handler: () => setRailCollapsed(prev => !prev),
        priority: KeyPriority.GLOBAL,
      },
      {
        key: 'r',
        handler: async () => {
          if (processState !== 'idle') {
            return; // Already running or stopping
          }
          const projectPath = projects.find(p => p.id === activeProjectId)?.path || currentPath;
          try {
            await ralphServiceRef.current?.run(projectPath);
          } catch {
            // Error is already handled by RalphService callbacks
          }
        },
        priority: KeyPriority.GLOBAL,
      },
      {
        key: 's',
        handler: () => {
          if (processState === 'running') {
            ralphServiceRef.current?.stop();
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
            const success = await copyToClipboard(remoteURL);
            // TODO: Show notification toast when implemented (US-018)
            if (!success) {
              console.error('Failed to copy URL to clipboard');
            }
          }
        },
        priority: KeyPriority.GLOBAL,
      },
      {
        key: (input: string) => input === 'q' || input === 'Q',
        handler: () => exit(),
        priority: KeyPriority.GLOBAL,
      },
      // Tab: cycle focus between panes
      {
        key: KeyMatchers.tab,
        handler: cycleFocus,
        priority: KeyPriority.GLOBAL,
        isActive: !showWelcome && !showSettings, // Don't cycle focus when overlay is open
      },
    ];

    // Register all handlers
    handlers.forEach(handler => registerHandler(handler));

    // Cleanup on unmount
    return () => {
      handlers.forEach(handler => unregisterHandler(handler));
    };
  }, [
    showWelcome,
    showSettings,
    processState,
    cycleFocus,
    exit,
    registerHandler,
    unregisterHandler,
    activeProjectId,
    projects,
    currentPath,
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
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProjectId}
            hasFocus={isFocused('rail')}
          />
        </Box>

        {/* Sessions/Tasks Pane (Middle) */}
        <SessionsPane
          isFocused={isFocused('sessions')}
          height={dimensions.rows - 2} // Subtract StatusBar and ShortcutsBar
          projectPath={projects.find(p => p.id === activeProjectId)?.path || currentPath}
          onStorySelect={setSelectedStory}
        />

        {/* Work Pane (Right) */}
        <WorkPane
          isFocused={isFocused('work')}
          height={dimensions.rows - 2}
          width={workWidth}
          projectPath={projects.find(p => p.id === activeProjectId)?.path || currentPath}
          selectedStory={selectedStory}
          logLines={logLines}
          processState={processState}
          processError={processError}
          tailscaleStatus={tailscaleStatus}
          remoteURL={remoteURL}
          agentTree={agentTree}
        />
      </Box>

      {/* Shortcuts Bar (Bottom) */}
      <ShortcutsBar width={dimensions.columns} focusPane={focusPane} />

      {/* Welcome/Help Overlay */}
      <WelcomeOverlay
        visible={showWelcome}
        onDismiss={handleWelcomeDismiss}
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
    </Box>
  );
};
