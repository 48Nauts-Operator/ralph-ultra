import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync, watchFile, unwatchFile, existsSync } from 'fs';
import { join } from 'path';
import { useTheme } from '@hooks/useTheme';
import type { UserStory } from '@types';
import type { TailscaleStatus } from '../remote/tailscale';
import { TracingPane, type AgentNode } from './TracingPane';

/**
 * View types for the work pane
 */
export type WorkView = 'monitor' | 'status' | 'details' | 'help' | 'tracing';

interface WorkPaneProps {
  /** Whether this pane is currently focused */
  isFocused: boolean;
  /** Available height for the pane content */
  height: number;
  /** Available width for the pane content */
  width: number;
  /** Project directory path */
  projectPath: string;
  /** Currently selected user story (for Details view) */
  selectedStory: UserStory | null;
  /** Real-time log lines from Ralph process */
  logLines?: string[];
  /** Process state for status view */
  processState?: string;
  /** Process error message if any */
  processError?: string;
  /** Tailscale status information */
  tailscaleStatus?: TailscaleStatus | null;
  /** Generated remote URL with token */
  remoteURL?: string | null;
  /** Agent execution tree for tracing view */
  agentTree?: AgentNode[];
  /** Initial/restored work pane view for session restoration */
  initialView?: WorkView;
  /** Initial/restored scroll offset for session restoration */
  initialScrollOffset?: number;
}

/**
 * Work pane - displays different content based on current view mode
 * Views: Monitor (logs), Status (system info), Details (story details), Help (commands), Tracing (agent tree)
 */
export const WorkPane: React.FC<WorkPaneProps> = ({
  isFocused,
  height,
  width,
  projectPath,
  selectedStory,
  logLines = [],
  processState = 'idle',
  processError,
  tailscaleStatus = null,
  remoteURL = null,
  agentTree = [],
  initialView = 'monitor',
  initialScrollOffset = 0,
}) => {
  const { theme } = useTheme();
  const [currentView, setCurrentView] = useState<WorkView>(initialView);
  const [logContent, setLogContent] = useState<string[]>([]);
  const [scrollOffset, setScrollOffset] = useState(initialScrollOffset);

  // Update log content when logLines prop changes
  useEffect(() => {
    if (logLines.length > 0) {
      setLogContent(logLines);
      // Auto-scroll to bottom on new content
      const contentHeight = logLines.length;
      const visibleHeight = height - 3; // Subtract header and borders
      if (contentHeight > visibleHeight) {
        setScrollOffset(Math.max(0, contentHeight - visibleHeight));
      }
    }
  }, [logLines, height]);

  // Load log file for Monitor view (fallback to file if no live stream)
  const loadLog = () => {
    try {
      const logPath = join(projectPath, 'ralph-monitor.log');
      if (existsSync(logPath)) {
        const content = readFileSync(logPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        setLogContent(lines);
        // Auto-scroll to bottom on new content
        setScrollOffset(Math.max(0, lines.length - (height - 3)));
      }
    } catch {
      // Silently fail if log doesn't exist yet
      setLogContent(['No log file found. Run Ralph to generate logs.']);
    }
  };

  // Watch log file for changes
  useEffect(() => {
    loadLog();

    const logPath = join(projectPath, 'ralph-monitor.log');
    if (existsSync(logPath)) {
      watchFile(logPath, { interval: 1000 }, loadLog);
    }

    return () => {
      unwatchFile(logPath, loadLog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  // Handle keyboard input for view switching and scrolling
  useInput(
    (input, key) => {
      // Number keys: jump to specific views
      if (input === '1') {
        setCurrentView('monitor');
        return;
      }
      if (input === '2') {
        setCurrentView('status');
        return;
      }
      if (input === '3') {
        setCurrentView('details');
        return;
      }
      if (input === '4') {
        setCurrentView('help');
        return;
      }
      if (input === '5') {
        setCurrentView('tracing');
        return;
      }

      // Scrolling within current view (j/k or arrow keys)
      if (input === 'j' || key.downArrow) {
        setScrollOffset(prev => {
          const maxScroll = Math.max(0, getMaxScrollForView() - (height - 3));
          return Math.min(prev + 1, maxScroll);
        });
      }
      if (input === 'k' || key.upArrow) {
        setScrollOffset(prev => Math.max(0, prev - 1));
      }
    },
    { isActive: isFocused },
  );

  // Get max scroll value for current view
  const getMaxScrollForView = (): number => {
    if (currentView === 'monitor') return logContent.length;
    if (currentView === 'status') return 10; // Status view is short
    if (currentView === 'details' && selectedStory) {
      return 3 + selectedStory.acceptanceCriteria.length;
    }
    if (currentView === 'help') return 20; // Help view has ~20 lines
    return 0;
  };

  const borderColor = isFocused ? theme.borderFocused : theme.border;

  // Render Monitor view
  const renderMonitor = () => {
    const visibleLines = logContent.slice(scrollOffset, scrollOffset + (height - 3));

    return (
      <Box flexDirection="column" paddingX={1}>
        {visibleLines.length > 0 ? (
          visibleLines.map((line, idx) => (
            <Text key={idx} dimColor>
              {line}
            </Text>
          ))
        ) : (
          <Text dimColor>No logs available. Run Ralph to see output.</Text>
        )}
      </Box>
    );
  };

  // Render Status view
  const renderStatus = () => {
    const stateColor =
      processState === 'running'
        ? theme.success
        : processState === 'stopping'
          ? theme.warning
          : theme.muted;

    // Determine Tailscale status display
    const getTailscaleStatusDisplay = () => {
      if (!tailscaleStatus) {
        return { text: 'Checking...', color: theme.muted };
      }
      if (!tailscaleStatus.isInstalled) {
        return { text: 'Not Installed', color: theme.error };
      }
      if (!tailscaleStatus.isConnected) {
        return { text: 'Disconnected', color: theme.warning };
      }
      return { text: 'Connected', color: theme.success };
    };

    const tailscaleDisplay = getTailscaleStatusDisplay();

    return (
      <Box flexDirection="column" paddingX={1} gap={0}>
        <Text bold color={theme.accent}>
          System Status
        </Text>
        <Text>
          <Text dimColor>Process State: </Text>
          <Text color={stateColor}>{processState}</Text>
        </Text>
        {processError && (
          <Text>
            <Text dimColor>Error: </Text>
            <Text color={theme.error}>{processError}</Text>
          </Text>
        )}
        <Text>
          <Text dimColor>Model: </Text>
          <Text color={theme.warning}>claude-sonnet-4-20250514</Text>
        </Text>
        <Text>
          <Text dimColor>Quota: </Text>
          <Text color={theme.success}>245k / 1M tokens</Text>
        </Text>
        <Text>
          <Text dimColor>Hybrid Config: </Text>
          <Text>oracle + explorer</Text>
        </Text>
        <Text>
          <Text dimColor>Avg Iteration: </Text>
          <Text>42s</Text>
        </Text>
        <Text>
          <Text dimColor>Last Run: </Text>
          <Text>Not started</Text>
        </Text>
        <Text> </Text>
        <Text bold color={theme.accent}>
          Remote Access
        </Text>
        <Text>
          <Text dimColor>Local Client: </Text>
          <Text color={theme.success}>http://127.0.0.1:7891/remote</Text>
        </Text>
        <Text dimColor wrap="wrap">
          (Open in browser on this machine)
        </Text>
        <Text> </Text>
        <Text>
          <Text dimColor>Tailscale: </Text>
          <Text color={tailscaleDisplay.color}>{tailscaleDisplay.text}</Text>
        </Text>
        {tailscaleStatus?.isConnected && (
          <>
            <Text>
              <Text dimColor>Tailscale IP: </Text>
              <Text color={theme.success}>{tailscaleStatus.tailscaleIP}</Text>
            </Text>
            <Text>
              <Text dimColor>MagicDNS: </Text>
              <Text color={theme.success}>{tailscaleStatus.magicDNS}</Text>
            </Text>
            {remoteURL && (
              <Text>
                <Text dimColor>Remote URL: </Text>
                <Text color={theme.accent}>{remoteURL}</Text>
              </Text>
            )}
            <Text dimColor>(Press &apos;c&apos; to copy URL to clipboard)</Text>
          </>
        )}
        {!tailscaleStatus?.isInstalled && (
          <Text color={theme.muted} wrap="wrap">
            Install Tailscale for secure remote access
          </Text>
        )}
        {tailscaleStatus?.isInstalled && !tailscaleStatus?.isConnected && (
          <Text color={theme.muted} wrap="wrap">
            Run &apos;tailscale up&apos; to connect
          </Text>
        )}
      </Box>
    );
  };

  // Render Details view
  const renderDetails = () => {
    if (!selectedStory) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text dimColor>No story selected</Text>
        </Box>
      );
    }

    const visibleContent: React.ReactNode[] = [
      <Text key="title" bold color={theme.accent}>
        {selectedStory.id}: {selectedStory.title}
      </Text>,
      <Text key="space1"> </Text>,
      <Text key="desc-header" bold>
        Description:
      </Text>,
      <Text key="description" dimColor>
        {selectedStory.description}
      </Text>,
      <Text key="space2"> </Text>,
      <Text key="ac-header" bold>
        Acceptance Criteria:
      </Text>,
      ...selectedStory.acceptanceCriteria.map((criteria, idx) => (
        <Text key={`ac-${idx}`}>
          <Text color={theme.success}>✓ </Text>
          <Text>{criteria}</Text>
        </Text>
      )),
    ];

    const scrolledContent = visibleContent.slice(scrollOffset, scrollOffset + (height - 3));

    return (
      <Box flexDirection="column" paddingX={1}>
        {scrolledContent}
      </Box>
    );
  };

  // Render Help view
  const renderHelp = () => {
    const helpSections = [
      {
        title: 'Navigation',
        items: [
          { key: 'Tab', desc: 'Cycle focus between panes' },
          { key: 'j/k or ↑↓', desc: 'Navigate within pane' },
          { key: '[', desc: 'Toggle projects rail' },
        ],
      },
      {
        title: 'Actions',
        items: [
          { key: 'r', desc: 'Run Ralph on current project' },
          { key: 's', desc: 'Stop running Ralph' },
          { key: 'q', desc: 'Quit application' },
        ],
      },
      {
        title: 'Views',
        items: [
          { key: '1', desc: 'Monitor (logs)' },
          { key: '2', desc: 'Status (system info)' },
          { key: '3', desc: 'Details (story)' },
          { key: '4', desc: 'Help (this view)' },
          { key: '5', desc: 'Tracing (agent tree)' },
        ],
      },
      {
        title: 'Remote',
        items: [
          { key: 'c', desc: 'Copy remote URL' },
        ],
      },
      {
        title: 'Interface',
        items: [
          { key: '?', desc: 'Welcome overlay' },
          { key: 't', desc: 'Theme settings' },
        ],
      },
    ];

    const allLines: React.ReactNode[] = [];
    helpSections.forEach((section, sectionIdx) => {
      allLines.push(
        <Text key={`section-${sectionIdx}`} bold color={theme.accent}>
          {section.title}
        </Text>,
      );
      section.items.forEach((item, itemIdx) => {
        allLines.push(
          <Text key={`${sectionIdx}-${itemIdx}`}>
            <Text color={theme.warning}>{item.key.padEnd(12)}</Text>
            <Text dimColor>{item.desc}</Text>
          </Text>,
        );
      });
      allLines.push(<Text key={`space-${sectionIdx}`}> </Text>);
    });

    const visibleLines = allLines.slice(scrollOffset, scrollOffset + (height - 3));

    return (
      <Box flexDirection="column" paddingX={1}>
        {visibleLines}
      </Box>
    );
  };

  // Render appropriate view based on currentView
  const renderCurrentView = () => {
    switch (currentView) {
      case 'monitor':
        return renderMonitor();
      case 'status':
        return renderStatus();
      case 'details':
        return renderDetails();
      case 'help':
        return renderHelp();
      case 'tracing':
        return null; // TracingPane renders itself as a full component
    }
  };

  // For tracing view, render TracingPane directly (it has its own border)
  if (currentView === 'tracing') {
    return (
      <TracingPane
        isFocused={isFocused}
        height={height}
        width={width}
        agentTree={agentTree}
      />
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      width={width}
      height={height}
    >
      {/* Header showing current view */}
      <Box paddingX={1} borderStyle="single" borderColor={borderColor}>
        <Text bold color={theme.accent}>
          Work: {currentView.charAt(0).toUpperCase() + currentView.slice(1)}
        </Text>
        <Text dimColor> [1-5 to switch]</Text>
      </Box>

      {/* View content */}
      <Box flexDirection="column" flexGrow={1}>
        {renderCurrentView()}
      </Box>
    </Box>
  );
};
