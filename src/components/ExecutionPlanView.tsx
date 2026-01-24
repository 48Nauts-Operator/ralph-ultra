import React, { memo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';
import { useExecutionPlan } from '@hooks/useExecutionPlan';
import type { StoryAllocation } from '../core/types';

interface ExecutionPlanViewProps {
  /** Path to the project directory */
  projectPath: string;
  /** Available height for the component */
  height: number;
  /** Whether this view has keyboard focus */
  isFocused?: boolean;
}

/**
 * ExecutionPlanView displays the execution plan with story-to-model assignments and cost projections
 *
 * Features:
 * - Shows each story with assigned model and estimated cost
 * - Displays summary section with total cost and models used
 * - Indicates quota availability status
 * - Supports scrolling through stories
 * - Shows alternative model options
 */
export const ExecutionPlanView: React.FC<ExecutionPlanViewProps> = memo(
  ({ projectPath, height, isFocused = false }) => {
    const { theme } = useTheme();
    const { plan, loading, error, refresh } = useExecutionPlan(projectPath);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [scrollOffset, setScrollOffset] = useState(0);

    // Handle keyboard navigation
    useInput(
      (input, key) => {
        if (!plan) return;

        if (key.downArrow || input === 'j') {
          setSelectedIndex(prev => Math.min(prev + 1, plan.stories.length - 1));
        }
        if (key.upArrow || input === 'k') {
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        }
        if (input === 'r' || input === 'R') {
          refresh();
        }
      },
      { isActive: isFocused },
    );

    // Auto-scroll to keep selected item visible
    React.useEffect(() => {
      if (!plan) return;

      const visibleHeight = height - 8; // Reserve space for header and summary
      if (selectedIndex < scrollOffset) {
        setScrollOffset(selectedIndex);
      } else if (selectedIndex >= scrollOffset + visibleHeight) {
        setScrollOffset(selectedIndex - visibleHeight + 1);
      }
    }, [selectedIndex, height, plan]);

    /**
     * Format cost with appropriate precision
     */
    const formatCost = (cost: number): string => {
      if (cost < 0.01) return `$${cost.toFixed(4)}`;
      if (cost < 1) return `$${cost.toFixed(3)}`;
      return `$${cost.toFixed(2)}`;
    };

    /**
     * Format duration in human-readable form
     */
    const formatDuration = (minutes: number): string => {
      if (minutes < 1) return '<1m';
      if (minutes < 60) return `${Math.round(minutes)}m`;
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    };

    /**
     * Get color for complexity
     */
    const getComplexityColor = (complexity: string): string => {
      switch (complexity) {
        case 'simple':
          return theme.success;
        case 'medium':
          return theme.warning;
        case 'complex':
          return theme.error;
        default:
          return theme.muted;
      }
    };

    /**
     * Render a single story allocation
     */
    const renderStory = (story: StoryAllocation, isSelected: boolean): React.ReactNode => {
      const prefix = isSelected ? '▶' : ' ';
      const complexityColor = getComplexityColor(story.complexity);
      const model = story.recommendedModel;

      return (
        <Box key={story.storyId} flexDirection="column" marginBottom={isSelected ? 1 : 0}>
          {/* Story header */}
          <Box>
            <Text color={isSelected ? theme.accent : theme.foreground} bold={isSelected}>
              {prefix} {story.storyId}: {story.title}
            </Text>
          </Box>

          {/* Story details */}
          <Box marginLeft={2}>
            <Text color={theme.muted}>
              Complexity: <Text color={complexityColor}>{story.complexity}</Text>
            </Text>
            <Text color={theme.muted}> • </Text>
            <Text color={theme.muted}>
              Type: <Text color={theme.foreground}>{story.taskType}</Text>
            </Text>
          </Box>

          {/* Model assignment */}
          <Box marginLeft={2}>
            <Text color={theme.muted}>Model: </Text>
            <Text color={theme.accent}>
              {model.provider}/{model.modelId}
            </Text>
            <Text color={theme.muted}> • Cost: </Text>
            <Text color={theme.success}>{formatCost(story.estimatedCost)}</Text>
            <Text color={theme.muted}> • Duration: </Text>
            <Text color={theme.foreground}>{formatDuration(story.estimatedDuration)}</Text>
          </Box>

          {/* Reason (only show when selected) */}
          {isSelected && (
            <Box marginLeft={2}>
              <Text color={theme.muted} dimColor>
                → {model.reason}
              </Text>
            </Box>
          )}

          {/* Alternative models (only show when selected and available) */}
          {isSelected && story.alternativeModels && story.alternativeModels.length > 0 && (
            <Box marginLeft={2} flexDirection="column">
              <Text color={theme.muted}>Alternatives:</Text>
              {story.alternativeModels.slice(0, 2).map(alt => (
                <Box key={`${alt.provider}-${alt.modelId}`} marginLeft={2}>
                  <Text color={theme.muted}>
                    • {alt.provider}/{alt.modelId} - {formatCost(alt.estimatedCost)}
                  </Text>
                  <Text color={theme.muted} dimColor>
                    {' '}
                    ({alt.tradeoff})
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      );
    };

    // Loading state
    if (loading) {
      return (
        <Box flexDirection="column" padding={1} height={height}>
          <Text color={theme.muted}>Loading execution plan...</Text>
        </Box>
      );
    }

    // Error state
    if (error) {
      return (
        <Box flexDirection="column" padding={1} height={height}>
          <Text color={theme.error}>Error: {error}</Text>
          <Text color={theme.muted}>Press 'r' to retry</Text>
        </Box>
      );
    }

    // No plan state
    if (!plan) {
      return (
        <Box flexDirection="column" padding={1} height={height}>
          <Text color={theme.muted}>No execution plan available</Text>
          <Text color={theme.muted}>Create a prd.json file in the project directory</Text>
        </Box>
      );
    }

    const { summary } = plan;
    const visibleHeight = height - 8;
    const visibleStories = plan.stories.slice(scrollOffset, scrollOffset + visibleHeight);

    return (
      <Box flexDirection="column" height={height} paddingX={1}>
        {/* Header */}
        <Box marginBottom={1}>
          <Text bold color={theme.accent}>
            Execution Plan: {plan.prdName}
          </Text>
        </Box>

        {/* Summary section */}
        <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor={theme.border}>
          <Box paddingX={1}>
            <Text bold color={theme.accentSecondary}>
              Summary
            </Text>
          </Box>

          <Box paddingX={1} flexDirection="row">
            <Box width="50%">
              <Text color={theme.muted}>
                Stories: <Text color={theme.foreground}>{summary.totalStories}</Text>
              </Text>
            </Box>
            <Box width="50%">
              <Text color={theme.muted}>
                Total Cost: <Text color={theme.success}>{formatCost(summary.estimatedTotalCost)}</Text>
              </Text>
            </Box>
          </Box>

          <Box paddingX={1} flexDirection="row">
            <Box width="50%">
              <Text color={theme.muted}>
                Duration: <Text color={theme.foreground}>{formatDuration(summary.estimatedTotalDuration)}</Text>
              </Text>
            </Box>
            <Box width="50%">
              <Text color={theme.muted}>
                Models: <Text color={theme.foreground}>{summary.modelsUsed.join(', ')}</Text>
              </Text>
            </Box>
          </Box>

          {/* Quota availability indicator */}
          <Box paddingX={1} marginTop={1}>
            {summary.canCompleteWithCurrentQuotas ? (
              <Text color={theme.success}>✓ Can complete with current quotas</Text>
            ) : (
              <Text color={theme.warning}>⚠ May require additional quota</Text>
            )}
          </Box>

          {/* Quota warnings */}
          {summary.quotaWarnings && summary.quotaWarnings.length > 0 && (
            <Box paddingX={1} flexDirection="column">
              {summary.quotaWarnings.map((warning, idx) => (
                <Text key={idx} color={theme.warning}>
                  ⚠ {warning}
                </Text>
              ))}
            </Box>
          )}
        </Box>

        {/* Story list */}
        <Box flexDirection="column" flexGrow={1}>
          <Text bold color={theme.accentSecondary}>
            Stories
          </Text>
          {visibleStories.map((story, idx) =>
            renderStory(story, scrollOffset + idx === selectedIndex),
          )}
        </Box>

        {/* Footer with navigation hints */}
        <Box marginTop={1}>
          <Text color={theme.muted} dimColor>
            {plan.stories.length > visibleHeight &&
              `Showing ${scrollOffset + 1}-${Math.min(scrollOffset + visibleHeight, plan.stories.length)} of ${plan.stories.length} • `}
            ↑/↓ navigate • r refresh
          </Text>
        </Box>
      </Box>
    );
  },
);
