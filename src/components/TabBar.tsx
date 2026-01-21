import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';
import type { TabState } from '../types';

export interface TabBarProps {
  width: number;
  tabs: TabState[];
  activeTabId: string;
  isFocused: boolean;
  onSelectTab: (tabId: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  width,
  tabs,
  activeTabId,
  isFocused,
  onSelectTab,
}) => {
  const { theme } = useTheme();

  useInput(
    (input, key) => {
      const num = parseInt(input, 10);
      if (num >= 1 && num <= Math.min(tabs.length, 9)) {
        const tab = tabs[num - 1];
        if (tab) {
          onSelectTab(tab.id);
        }
      }

      const currentIndex = tabs.findIndex(t => t.id === activeTabId);

      if ((key.leftArrow || input === 'h') && currentIndex > 0) {
        const prevTab = tabs[currentIndex - 1];
        if (prevTab) {
          onSelectTab(prevTab.id);
        }
      }

      if ((key.rightArrow || input === 'l') && currentIndex < tabs.length - 1) {
        const nextTab = tabs[currentIndex + 1];
        if (nextTab) {
          onSelectTab(nextTab.id);
        }
      }
    },
    { isActive: isFocused },
  );

  const maxTabWidth = 25;
  const minTabWidth = 15;
  const availableWidth = width - 4;
  const tabCount = Math.min(tabs.length, 5);
  const tabWidth = Math.max(
    minTabWidth,
    Math.min(maxTabWidth, Math.floor(availableWidth / tabCount)),
  );

  return (
    <Box width={width} height={1} paddingLeft={1}>
      {isFocused && (
        <Text color={theme.accent} bold>
          ▶{' '}
        </Text>
      )}
      {tabs.slice(0, 5).map((tab, index) => {
        const isActive = tab.id === activeTabId;
        const truncatedName =
          tab.project.name.length > tabWidth - 6
            ? tab.project.name.substring(0, tabWidth - 9) + '...'
            : tab.project.name;

        let statusIndicator = '○';
        let statusColor = theme.muted;
        if (tab.processState === 'running' || tab.processState === 'external') {
          statusIndicator = '●';
          statusColor = theme.success;
        } else if (tab.processState === 'stopping') {
          statusIndicator = '◐';
          statusColor = theme.warning;
        } else if (tab.processError) {
          statusIndicator = '✗';
          statusColor = theme.error;
        }

        return (
          <Box key={tab.id} marginRight={1}>
            {isFocused && (
              <Text color={theme.accent} bold>
                [{index + 1}]
              </Text>
            )}
            <Text color={statusColor}>{statusIndicator} </Text>
            <Text
              bold={isActive}
              color={isActive ? theme.accent : theme.foreground}
              underline={isActive}
            >
              {truncatedName}
            </Text>
            {isActive && !isFocused && <Text color={theme.accent}> ◀</Text>}
            <Text> </Text>
          </Box>
        );
      })}

      {tabs.length > 5 && (
        <Box marginLeft={1}>
          <Text color={theme.muted}>+{tabs.length - 5} more</Text>
        </Box>
      )}
    </Box>
  );
};
