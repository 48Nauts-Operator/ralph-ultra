import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@hooks/useTheme';
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
  /** Current work pane view (for conditional shortcuts) */
  workPaneView?: string;
}

/**
 * ShortcutsBar component - displays context-aware keyboard shortcuts
 * Single-line bar at the bottom of the screen showing available commands
 */
export const ShortcutsBar: React.FC<ShortcutsBarProps> = memo(
  ({ width, focusPane = 'sessions', workPaneView }) => {
    const { theme } = useTheme();

    const globalShortcuts: ShortcutItem[] = [
      { key: 'Tab', description: 'Focus' },
      { key: 'r', description: 'Run' },
      { key: 'R', description: 'Retry' },
      { key: 's', description: 'Stop' },
      { key: 'd', description: 'Debug' },
      { key: 'p', description: 'Recent' },
      { key: 'Ctrl+L', description: 'Clear' },
      { key: 'Ctrl+Shift+T', description: 'New Tab' },
      { key: 'e', description: 'Close' },
      { key: 't', description: 'Theme' },
      { key: '?', description: 'Help' },
      { key: 'q', description: 'Quit' },
    ];

    const contextShortcuts: Record<FocusPane, ShortcutItem[]> = {
      projects: [
        { key: '[', description: 'Toggle' },
        { key: 'r', description: 'Recent' },
      ],
      tabs: [{ key: '1-5', description: 'Switch Tab' }],
      sessions: [
        { key: 'j/k', description: 'Navigate' },
        { key: 'Enter', description: 'View' },
        { key: 'g', description: 'Go to Story' },
      ],
      work: [
        { key: '1-8', description: 'Views' },
        { key: 'j/k', description: 'Scroll' },
        { key: '/', description: 'Search' },
      ],
    };

    // Combine global and context shortcuts
    const currentContextShortcuts = contextShortcuts[focusPane] || [];

    // Add Test shortcut only when in details view
    if (focusPane === 'work' && workPaneView === 'details') {
      currentContextShortcuts.push({ key: 'T', description: 'Test' });
    }

    // Add view shortcuts when focused on work pane
    if (focusPane === 'work') {
      currentContextShortcuts.push({ key: '4', description: 'Quota' });
      currentContextShortcuts.push({ key: '5', description: 'Plan' });
    }

    const allShortcuts = [...currentContextShortcuts, ...globalShortcuts];

    // Render shortcuts with proper formatting
    const renderShortcut = (shortcut: ShortcutItem, index: number) => {
      const separator = index < allShortcuts.length - 1 ? ' | ' : '';
      return (
        <Text key={`${shortcut.key}-${index}`}>
          <Text bold color={theme.accent}>
            {shortcut.key}
          </Text>
          <Text color={theme.muted}> {shortcut.description}</Text>
          <Text color={theme.muted}>{separator}</Text>
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
  },
);
