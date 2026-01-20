import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { ProjectsRail } from './ProjectsRail';
import type { Project, FocusPane } from '../types';

/**
 * Main application component with three-pane layout
 * - Projects rail (left): 12 chars expanded, 3 chars collapsed
 * - Sessions pane (middle): flexible width, min 30 chars
 * - Work pane (right): flexible width, min 40 chars
 */
export const App: React.FC = () => {
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState({
    columns: stdout?.columns || 80,
    rows: stdout?.rows || 24,
  });
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [focusPane] = useState<FocusPane>('rail'); // Will be managed by keyboard handler in US-010

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
        <Box width={sessionsWidth} flexDirection="column" borderStyle="single" borderColor="gray">
          <Box padding={1}>
            <Text dimColor>Sessions</Text>
          </Box>
        </Box>

        {/* Work Pane (Right) */}
        <Box width={workWidth} flexDirection="column" borderStyle="single" borderColor="gray">
          <Box padding={1}>
            <Text dimColor>Work</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
