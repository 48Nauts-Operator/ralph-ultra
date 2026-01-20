import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';
import { useTheme } from '@hooks/useTheme';
import type { PRD, UserStory, Complexity } from '@types';

interface SessionsPaneProps {
  /** Whether this pane is currently focused */
  isFocused: boolean;
  /** Available height for the pane content */
  height: number;
  /** Project directory path */
  projectPath: string;
  /** Callback when a story is selected */
  onStorySelect?: (story: UserStory | null) => void;
}

/**
 * Sessions/Tasks pane - displays user stories from prd.json
 * Shows project name, branch, and list of stories with status indicators
 */
export const SessionsPane: React.FC<SessionsPaneProps> = ({
  isFocused,
  height,
  projectPath,
  onStorySelect,
}) => {
  const { theme } = useTheme();
  const [prd, setPrd] = useState<PRD | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load PRD file
  const loadPRD = () => {
    try {
      const prdPath = join(projectPath, 'prd.json');
      const content = readFileSync(prdPath, 'utf-8');
      const data = JSON.parse(content) as PRD;
      setPrd(data);
      setError(null);

      // Bounds check selected index
      if (data.userStories.length > 0 && selectedIndex >= data.userStories.length) {
        setSelectedIndex(data.userStories.length - 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prd.json');
      setPrd(null);
    }
  };

  // Load PRD on mount and watch for changes
  useEffect(() => {
    loadPRD();

    const prdPath = join(projectPath, 'prd.json');
    watchFile(prdPath, { interval: 1000 }, loadPRD);

    return () => {
      unwatchFile(prdPath, loadPRD);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  // Bounds check when stories change
  useEffect(() => {
    if (prd && prd.userStories.length > 0) {
      if (selectedIndex >= prd.userStories.length) {
        setSelectedIndex(prd.userStories.length - 1);
      }
    }
  }, [prd, selectedIndex]);

  // Notify parent when selected story changes
  useEffect(() => {
    if (prd && prd.userStories.length > 0 && onStorySelect) {
      const story = prd.userStories[selectedIndex];
      onStorySelect(story || null);
    }
  }, [selectedIndex, prd, onStorySelect]);

  // Handle keyboard navigation (j/k and arrow keys)
  useInput(
    (input, key) => {
      if (!prd || prd.userStories.length === 0) return;

      // Navigate down: j or down arrow
      if (input === 'j' || key.downArrow) {
        setSelectedIndex(prev => Math.min(prev + 1, prd.userStories.length - 1));
      }

      // Navigate up: k or up arrow
      if (input === 'k' || key.upArrow) {
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      }
    },
    { isActive: isFocused },
  );

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.error}>Error loading PRD</Text>
        <Text dimColor>{error}</Text>
      </Box>
    );
  }

  if (!prd) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading prd.json...</Text>
      </Box>
    );
  }

  const borderColor = isFocused ? theme.borderFocused : theme.border;

  // Calculate completion stats
  const completed = prd.userStories.filter(s => s.passes).length;
  const total = prd.userStories.length;

  // Get complexity color
  const getComplexityColor = (complexity: Complexity): string => {
    switch (complexity) {
      case 'simple':
        return 'green';
      case 'medium':
        return 'yellow';
      case 'complex':
        return 'red';
    }
  };

  // Get status icon
  const getStatusIcon = (story: UserStory, index: number): string => {
    if (story.passes) return '[✓]';
    if (index === selectedIndex) return '[>]';
    return '[ ]';
  };

  // Calculate visible range for scrolling
  const maxVisible = height - 4; // Account for header and footer
  const scrollOffset = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
  const visibleStories = prd.userStories.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={borderColor} height={height}>
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderColor={borderColor}>
        <Text bold color={theme.accent}>
          {prd.project}
        </Text>
        <Text dimColor> ({prd.branchName})</Text>
      </Box>

      {/* Story list */}
      <Box flexDirection="column" paddingX={1} paddingY={0} flexGrow={1}>
        {visibleStories.map((story, idx) => {
          const actualIndex = scrollOffset + idx;
          const isSelected = actualIndex === selectedIndex;
          const statusIcon = getStatusIcon(story, actualIndex);
          const statusColor = story.passes ? 'green' : isSelected ? 'yellow' : 'white';

          return (
            <Box key={story.id} flexDirection="row" gap={1}>
              <Text color={statusColor}>{statusIcon}</Text>
              <Text
                color={isSelected ? 'cyan' : undefined}
                bold={isSelected}
                dimColor={story.passes}
              >
                {story.id}
              </Text>
              <Text
                color={isSelected ? 'cyan' : undefined}
                bold={isSelected}
                dimColor={story.passes}
              >
                {story.title}
              </Text>
              <Text color={getComplexityColor(story.complexity)}>[{story.complexity}]</Text>
            </Box>
          );
        })}
      </Box>

      {/* Footer with completion count */}
      <Box paddingX={1} borderStyle="single" borderColor={borderColor}>
        <Text>
          <Text color={theme.success}>{completed}</Text>
          <Text dimColor>/</Text>
          <Text>{total}</Text>
          <Text dimColor> stories complete</Text>
        </Text>
      </Box>
    </Box>
  );
};
