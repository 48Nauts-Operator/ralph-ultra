import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';

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
  const [railCollapsed] = useState(false); // Will be controlled via keyboard in US-003

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
          borderColor="gray"
        >
          <Box padding={1}>
            <Text dimColor>{railCollapsed ? '▶' : 'Projects'}</Text>
          </Box>
        </Box>

        {/* Sessions/Tasks Pane (Middle) */}
        <Box
          width={sessionsWidth}
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
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
          borderColor="gray"
        >
          <Box padding={1}>
            <Text dimColor>Work</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
