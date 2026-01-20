#!/usr/bin/env bun
import React from 'react';
import { render, Text, Box } from 'ink';

/**
 * Main App component for Ralph Ultra 2.0
 */
const App: React.FC = () => {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Ralph Ultra 2.0
      </Text>
      <Text dimColor>The Most Secure Coding Agent</Text>
      <Text> </Text>
      <Text>Initializing...</Text>
    </Box>
  );
};

// Render the app
render(<App />);
