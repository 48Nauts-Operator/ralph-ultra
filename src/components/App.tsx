import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout, useInput, useApp } from 'ink';
import { ProjectsRail } from './ProjectsRail';
import { StatusBar } from './StatusBar';
import { ShortcutsBar } from './ShortcutsBar';
import type { Project, FocusPane } from '../types';

/**
 * Main application component with three-pane layout
 * - Projects rail (left): 12 chars expanded, 3 chars collapsed
 * - Sessions pane (middle): flexible width, min 30 chars
 * - Work pane (right): flexible width, min 40 chars
 */
export const App: React.FC = () => {
  const { stdout } = useStdout();
  const { exit } = useApp();
  const [dimensions, setDimensions] = useState({
    columns: stdout?.columns || 80,
    rows: stdout?.rows || 24,
  });
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [focusPane, setFocusPane] = useState<FocusPane>('rail');
  const [isRunning, setIsRunning] = useState(false);

  // Mock projects for demonstration (will be loaded from filesystem in later stories)
  const [projects] = useState<Project[]>([
    { id: '1', name: 'ralph-ultra', path: '/path/to/ralph-ultra', color: '#7FFFD4' },
    { id: '2', name: 'my-app', path: '/path/to/my-app', color: '#CC5500' },
    { id: '3', name: 'backend-api', path: '/path/to/backend', color: '#FFD700' },
  ]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>('1');

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

  // Handle keyboard shortcuts
  useInput((input, key) => {
    // Global shortcuts (work regardless of focus)
    if (input === '[') {
      setRailCollapsed(prev => !prev);
      return;
    }

    if (input === 'r') {
      // Run Ralph (will be implemented in US-011)
      setIsRunning(true);
      // Placeholder: actual execution comes later
      setTimeout(() => setIsRunning(false), 2000);
      return;
    }

    if (input === 's') {
      // Stop Ralph (will be implemented in US-011)
      if (isRunning) {
        setIsRunning(false);
      }
      return;
    }

    if (input === '?') {
      // Toggle help overlay (will be fully implemented in US-008)
      // Placeholder: just acknowledge the keypress for now
      return;
    }

    if (input === 'q' || input === 'Q') {
      // Quit application
      exit();
      return;
    }

    // Tab: cycle focus between panes
    if (key.tab) {
      setFocusPane(prev => {
        if (prev === 'rail') return 'sessions';
        if (prev === 'sessions') return 'work';
        return 'rail';
      });
      return;
    }

    // Context-specific shortcuts based on focus
    // (Detailed navigation will be handled by individual pane components)
  });

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
        <Text bold color="red">
          Terminal Too Small
        </Text>
        <Text>
          Current: {dimensions.columns}x{dimensions.rows}
        </Text>
        <Text>
          Minimum: {minColumns}x{minRows}
        </Text>
        <Text dimColor>Please resize your terminal window</Text>
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
      <StatusBar width={dimensions.columns} agentName="claude-sonnet-4-20250514" progress={67} />

      {/* Main three-pane layout */}
      <Box flexGrow={1}>
        {/* Projects Rail (Left) */}
        <Box
          width={railWidth}
          flexDirection="column"
          borderStyle="single"
          borderColor={focusPane === 'rail' ? 'cyan' : 'gray'}
        >
          <ProjectsRail
            collapsed={railCollapsed}
            onToggleCollapse={() => setRailCollapsed(!railCollapsed)}
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProjectId}
            hasFocus={focusPane === 'rail'}
          />
        </Box>

        {/* Sessions/Tasks Pane (Middle) */}
        <Box
          width={sessionsWidth}
          flexDirection="column"
          borderStyle="single"
          borderColor={focusPane === 'sessions' ? 'cyan' : 'gray'}
        >
          <Box padding={1}>
            <Text dimColor>Sessions</Text>
          </Box>
        </Box>

        {/* Work Pane (Right) */}
        <Box
          width={workWidth}
          flexDirection="column"
          borderStyle="single"
          borderColor={focusPane === 'work' ? 'cyan' : 'gray'}
        >
          <Box padding={1}>
            <Text dimColor>Work</Text>
          </Box>
        </Box>
      </Box>

      {/* Shortcuts Bar (Bottom) */}
      <ShortcutsBar width={dimensions.columns} focusPane={focusPane} />
    </Box>
  );
};
