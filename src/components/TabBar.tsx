import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@hooks/useTheme';
import type { TabState } from '../types';

export interface TabBarProps {
  /** Terminal width for layout calculations */
  width: number;
  /** All open tabs */
  tabs: TabState[];
  /** Currently active tab ID */
  activeTabId: string;
  /** Callback when a tab is selected */
  onSelectTab: (tabId: string) => void;
}

/**
 * TabBar component - displays tabs below StatusBar when multiple projects are open
 * Only shown when 2+ projects are open
 */
export const TabBar: React.FC<TabBarProps> = ({ width, tabs, activeTabId }) => {
  const { theme } = useTheme();

  // Don't show tab bar if only one tab is open
  if (tabs.length <= 1) {
    return null;
  }

  // Calculate available space for tabs
  const maxTabWidth = 20; // Maximum width per tab
  const minTabWidth = 12; // Minimum width per tab
  const availableWidth = width - 2; // Account for border padding
  const tabCount = Math.min(tabs.length, 5); // Maximum 5 tabs shown
  const tabWidth = Math.max(minTabWidth, Math.min(maxTabWidth, Math.floor(availableWidth / tabCount)));

  return (
    <Box
      width={width}
      borderStyle="single"
      borderColor={theme.border}
      paddingLeft={1}
      paddingRight={1}
    >
      <Box>
        {tabs.slice(0, 5).map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const truncatedName =
            tab.project.name.length > tabWidth - 4
              ? tab.project.name.substring(0, tabWidth - 7) + '...'
              : tab.project.name;

          // Status indicator based on process state
          let statusIndicator = ' ';
          let statusColor = theme.muted;
          if (tab.processState === 'running') {
            statusIndicator = '▶';
            statusColor = theme.success;
          } else if (tab.processState === 'stopping') {
            statusIndicator = '■';
            statusColor = theme.warning;
          } else if (tab.processError) {
            statusIndicator = '✗';
            statusColor = theme.error;
          }

          return (
            <Box key={tab.id} width={tabWidth} marginRight={1}>
              <Text
                bold={isActive}
                color={isActive ? theme.accent : theme.foreground}
                backgroundColor={isActive ? theme.border : undefined}
              >
                {' '}
                <Text color={statusColor}>{statusIndicator}</Text> {truncatedName} {index + 1}{' '}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Show indicator if more than 5 tabs */}
      {tabs.length > 5 && (
        <Box marginLeft={1}>
          <Text color={theme.muted}>+{tabs.length - 5} more</Text>
        </Box>
      )}
    </Box>
  );
};
