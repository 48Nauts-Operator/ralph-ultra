import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync, watchFile, unwatchFile, existsSync } from 'fs';
import { join } from 'path';
import type { UserStory } from '@types';

/**
 * View types for the work pane
 */
export type WorkView = 'monitor' | 'status' | 'details' | 'help';

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
}

/**
 * Work pane - displays different content based on current view mode
 * Views: Monitor (logs), Status (system info), Details (story details), Help (commands)
 */
export const WorkPane: React.FC<WorkPaneProps> = ({
  isFocused,
  height,
  width,
  projectPath,
  selectedStory,
}) => {
  const [currentView, setCurrentView] = useState<WorkView>('monitor');
  const [logContent, setLogContent] = useState<string[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Load log file for Monitor view
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

  const borderColor = isFocused ? 'cyan' : 'gray';

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
    // TODO: These will be real values in later stories (US-011, US-012, US-013)
    const statusInfo = {
      quota: '245k / 1M tokens',
      model: 'claude-sonnet-4-20250514',
      hybridConfig: 'oracle + explorer',
      avgIterationTime: '42s',
      lastRun: 'Not started',
      tailscaleStatus: 'Disconnected',
      tailscaleIP: 'N/A',
      remoteConnections: 0,
    };

    return (
      <Box flexDirection="column" paddingX={1} gap={0}>
        <Text bold color="cyan">
          System Status
        </Text>
        <Text>
          <Text dimColor>Model: </Text>
          <Text color="yellow">{statusInfo.model}</Text>
        </Text>
        <Text>
          <Text dimColor>Quota: </Text>
          <Text color="green">{statusInfo.quota}</Text>
        </Text>
        <Text>
          <Text dimColor>Hybrid Config: </Text>
          <Text>{statusInfo.hybridConfig}</Text>
        </Text>
        <Text>
          <Text dimColor>Avg Iteration: </Text>
          <Text>{statusInfo.avgIterationTime}</Text>
        </Text>
        <Text>
          <Text dimColor>Last Run: </Text>
          <Text>{statusInfo.lastRun}</Text>
        </Text>
        <Text> </Text>
        <Text bold color="cyan">
          Remote Access
        </Text>
        <Text>
          <Text dimColor>Tailscale: </Text>
          <Text color="gray">{statusInfo.tailscaleStatus}</Text>
        </Text>
        <Text>
          <Text dimColor>IP: </Text>
          <Text>{statusInfo.tailscaleIP}</Text>
        </Text>
        <Text>
          <Text dimColor>Connections: </Text>
          <Text>{statusInfo.remoteConnections}</Text>
        </Text>
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
      <Text key="title" bold color="cyan">
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
          <Text color="green">✓ </Text>
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
        ],
      },
      {
        title: 'Future Features',
        items: [
          { key: '?', desc: 'Welcome overlay (US-008)' },
          { key: 't', desc: 'Theme settings (US-009)' },
          { key: 'c', desc: 'Copy remote URL (US-013)' },
          { key: '5', desc: 'Tracing view (US-015)' },
        ],
      },
    ];

    const allLines: React.ReactNode[] = [];
    helpSections.forEach((section, sectionIdx) => {
      allLines.push(
        <Text key={`section-${sectionIdx}`} bold color="cyan">
          {section.title}
        </Text>,
      );
      section.items.forEach((item, itemIdx) => {
        allLines.push(
          <Text key={`${sectionIdx}-${itemIdx}`}>
            <Text color="yellow">{item.key.padEnd(12)}</Text>
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
    }
  };

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
        <Text bold color="cyan">
          Work: {currentView.charAt(0).toUpperCase() + currentView.slice(1)}
        </Text>
        <Text dimColor> [1-4 to switch]</Text>
      </Box>

      {/* View content */}
      <Box flexDirection="column" flexGrow={1}>
        {renderCurrentView()}
      </Box>
    </Box>
  );
};
