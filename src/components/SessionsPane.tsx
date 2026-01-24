import React, { useState, useEffect, memo, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';
import { useTheme } from '@hooks/useTheme';
import type { PRD, UserStory, Complexity, AcceptanceCriterion, GotoState } from '@types';
import { isTestableAC } from '@types';

interface SessionsPaneProps {
  isFocused: boolean;
  height: number;
  projectPath: string;
  onStorySelect?: (story: UserStory | null) => void;
  onStoryEnter?: (story: UserStory) => void;
  onStoryJump?: (story: UserStory) => void;
  initialScrollIndex?: number;
  initialSelectedStoryId?: string | null;
  gotoState?: GotoState;
}

/**
 * Sessions/Tasks pane - displays user stories from prd.json
 * Shows project name, branch, and list of stories with status indicators
 */
export const SessionsPane: React.FC<SessionsPaneProps> = memo(
  ({
    isFocused,
    height,
    projectPath,
    onStorySelect,
    onStoryEnter,
    onStoryJump: _onStoryJump,
    initialScrollIndex = 0,
    initialSelectedStoryId = null,
    gotoState,
  }) => {
    const { theme } = useTheme();
    const [prd, setPrd] = useState<PRD | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(initialScrollIndex);
    const [error, setError] = useState<string | null>(null);
    const [sessionRestored, setSessionRestored] = useState(false);

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

      const PRD_WATCH_INTERVAL_MS = 30000;
      const prdPath = join(projectPath, 'prd.json');
      watchFile(prdPath, { interval: PRD_WATCH_INTERVAL_MS }, loadPRD);

      return () => {
        unwatchFile(prdPath, loadPRD);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectPath]);

    // Restore session: find story by ID and set selected index
    useEffect(() => {
      if (prd && !sessionRestored && initialSelectedStoryId) {
        const storyIndex = prd.userStories.findIndex(s => s.id === initialSelectedStoryId);
        if (storyIndex !== -1) {
          setSelectedIndex(storyIndex);
        }
        setSessionRestored(true);
      }
    }, [prd, sessionRestored, initialSelectedStoryId]);

    // Bounds check when stories change
    useEffect(() => {
      if (prd && prd.userStories.length > 0) {
        if (selectedIndex >= prd.userStories.length) {
          setSelectedIndex(prd.userStories.length - 1);
        }
      }
    }, [prd, selectedIndex]);

    // Notify parent when selected story changes
    const onStorySelectRef = useRef(onStorySelect);
    onStorySelectRef.current = onStorySelect;

    useEffect(() => {
      if (prd && prd.userStories.length > 0 && onStorySelectRef.current) {
        const story = prd.userStories[selectedIndex];
        onStorySelectRef.current(story || null);
      }
    }, [selectedIndex, prd]);

    useInput(
      (input, key) => {
        if (!prd || prd.userStories.length === 0) return;

        if (input === 'j' || key.downArrow) {
          setSelectedIndex(prev => Math.min(prev + 1, prd.userStories.length - 1));
        }

        if (input === 'k' || key.upArrow) {
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        }

        if (key.return) {
          const story = prd.userStories[selectedIndex];
          if (story && onStoryEnter) {
            onStoryEnter(story);
          }
        }

        // Note: 'g' key to activate goto mode is handled globally in App.tsx
        // This allows entering a story number to jump directly to any story
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

    const getStatusIcon = (story: UserStory, index: number): string => {
      if (story.passes) return '[✓]';
      if (index === selectedIndex) return '[>]';
      return '[ ]';
    };

    const getACProgress = (story: UserStory): { passed: number; total: number } | null => {
      if (!isTestableAC(story.acceptanceCriteria)) return null;
      const criteria = story.acceptanceCriteria as AcceptanceCriterion[];
      const passed = criteria.filter(ac => ac.passes).length;
      return { passed, total: criteria.length };
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

            const acProgress = getACProgress(story);
            const { passed, total } = acProgress || { passed: 0, total: 0 };

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
                {acProgress && (
                  <Text dimColor>
                    {passed}/{total}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Footer with completion count or goto mode */}
        <Box paddingX={1} borderStyle="single" borderColor={borderColor}>
          {gotoState?.gotoMode ? (
            <Box flexDirection="row" gap={1}>
              <Text color="cyan">Goto story:</Text>
              <Text color="yellow">{gotoState.gotoInput || '_'}</Text>
              {gotoState.gotoError && (
                // Display error feedback: "Story not found", "Invalid story number", etc.
                <Text color={theme.error}> {gotoState.gotoError}</Text>
              )}
            </Box>
          ) : (
            <Text>
              <Text color={theme.success}>{completed}</Text>
              <Text dimColor>/</Text>
              <Text>{total}</Text>
              <Text dimColor> stories complete</Text>
            </Text>
          )}
        </Box>
      </Box>
    );
  },
);
