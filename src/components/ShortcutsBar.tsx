import React from 'react';
import { Box, Text } from 'ink';
import type { FocusPane } from '../types';

interface ShortcutItem {
  key: string;
  description: string;
}

interface ShortcutsBarProps {
  /** Current width of the terminal */
  width: number;
  /** Currently focused pane (affects which shortcuts are shown) */
  focusPane?: FocusPane;
}

/**
 * ShortcutsBar component - displays context-aware keyboard shortcuts
 * Single-line bar at the bottom of the screen showing available commands
 */
export const ShortcutsBar: React.FC<ShortcutsBarProps> = ({ width, focusPane = 'rail' }) => {
  // Base shortcuts that are always available (global)
  const globalShortcuts: ShortcutItem[] = [
    { key: '[', description: 'Rail' },
    { key: 'r', description: 'Run' },
    { key: 's', description: 'Stop' },
    { key: '?', description: 'Help' },
    { key: 'q', description: 'Quit' },
  ];

  // Context-specific shortcuts based on focused pane
  const contextShortcuts: Record<FocusPane, ShortcutItem[]> = {
    rail: [
      { key: '↑↓', description: 'Navigate' },
      { key: 'Enter', description: 'Select' },
    ],
    sessions: [
      { key: 'j/k', description: 'Navigate' },
      { key: 'Enter', description: 'View' },
    ],
    work: [
      { key: 'Tab', description: 'Switch View' },
      { key: '1-4', description: 'Jump' },
    ],
  };

  // Combine global and context shortcuts
  const currentContextShortcuts = contextShortcuts[focusPane] || [];
  const allShortcuts = [...currentContextShortcuts, ...globalShortcuts];

  // Render shortcuts with proper formatting
  const renderShortcut = (shortcut: ShortcutItem, index: number) => {
    const separator = index < allShortcuts.length - 1 ? ' | ' : '';
    return (
      <Text key={`${shortcut.key}-${index}`}>
        <Text bold color="cyan">
          {shortcut.key}
        </Text>
        <Text dimColor> {shortcut.description}</Text>
        <Text dimColor>{separator}</Text>
      </Text>
    );
  };

  // Build the shortcuts text
  const shortcutsText = allShortcuts.map((shortcut, index) => renderShortcut(shortcut, index));

  // Calculate padding to center or left-align based on available width
  const estimatedTextWidth = allShortcuts.reduce(
    (acc, s) => acc + s.key.length + s.description.length + 3,
    0,
  );
  const shouldCenter = estimatedTextWidth < width - 10;

  return (
    <Box
      width={width}
      height={1}
      justifyContent={shouldCenter ? 'center' : 'flex-start'}
      paddingLeft={shouldCenter ? 0 : 1}
    >
      {shortcutsText}
    </Box>
  );
};
