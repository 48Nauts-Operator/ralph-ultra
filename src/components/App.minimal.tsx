import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';

export const App: React.FC = () => {
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState({
    columns: stdout?.columns || 80,
    rows: stdout?.rows || 24,
  });

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

  return (
    <Box flexDirection="column" height={dimensions.rows}>
      <Box height={1}>
        <Text bold color="cyan">Ralph Ultra v2.0.0 - Minimal Test</Text>
      </Box>
      
      <Box flexGrow={1} borderStyle="single" borderColor="gray">
        <Box width="30%" borderStyle="single" borderColor="gray" flexDirection="column">
          <Text>Left Pane</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
        </Box>
        <Box flexGrow={1} borderStyle="single" borderColor="gray" flexDirection="column">
          <Text>Right Pane</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
        </Box>
      </Box>
      
      <Box height={1}>
        <Text dimColor>Press q to quit</Text>
      </Box>
    </Box>
  );
};
