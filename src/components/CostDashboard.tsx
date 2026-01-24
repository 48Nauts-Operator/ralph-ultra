import React, { memo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@hooks/useTheme';
import { costTracker, type StoryExecutionRecord } from '../core';

interface CostDashboardProps {
  /** Width available for the dashboard */
  width?: number;
}

/**
 * CostDashboard component displays cost tracking information for story executions
 * Shows current session costs, estimated vs actual comparison, and per-story breakdown
 */
export const CostDashboard: React.FC<CostDashboardProps> = memo(({ width = 80 }) => {
  const { theme } = useTheme();
  const [sessionStart] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second for elapsed time display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Get session costs from the cost tracker
  const sessionCosts = costTracker.getSessionCosts();
  const { totalEstimated, totalActual, storiesCompleted, storiesSuccessful, records } =
    sessionCosts;

  /**
   * Calculate variance between estimated and actual costs
   */
  const variance = totalEstimated > 0 ? totalActual - totalEstimated : 0;
  const variancePercent =
    totalEstimated > 0 ? ((variance / totalEstimated) * 100).toFixed(1) : '0.0';

  /**
   * Format elapsed time
   */
  const formatElapsedTime = (): string => {
    const diffMs = currentTime.getTime() - sessionStart.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  /**
   * Get variance color based on whether we're over or under budget
   */
  const getVarianceColor = (): string => {
    if (variance === 0) return theme.muted;
    if (variance > 0) return theme.warning; // Over budget
    return theme.success; // Under budget
  };

  /**
   * Format cost as currency
   */
  const formatCost = (cost: number): string => {
    return `$${cost.toFixed(4)}`;
  };

  /**
   * Render a single story record
   */
  const renderStoryRecord = (record: StoryExecutionRecord, index: number): React.ReactNode => {
    const isLast = index === records.length - 1;
    const prefix = isLast ? '└─ ' : '├─ ';
    const statusIcon = record.success ? '✓' : '✗';
    const statusColor = record.success ? theme.success : theme.error;

    const duration = new Date(record.endTime).getTime() - new Date(record.startTime).getTime();
    const durationSec = (duration / 1000).toFixed(1);

    return (
      <Box key={`${record.storyId}-${record.startTime}`} flexDirection="column">
        {/* Story header line */}
        <Box>
          <Text color={theme.muted}>{prefix}</Text>
          <Text color={statusColor}>{statusIcon}</Text>
          <Text color={theme.foreground}> {record.storyId}</Text>
          <Text color={theme.muted}> • {record.modelId}</Text>
          {record.retryCount > 0 && (
            <Text color={theme.warning}> (retry {record.retryCount})</Text>
          )}
        </Box>

        {/* Story details line */}
        <Box marginLeft={2}>
          <Text color={theme.muted}>Est: {formatCost(record.estimatedCost)}</Text>
          <Text color={theme.muted}> • Act: {formatCost(record.actualCost)}</Text>
          <Text color={theme.muted}>
            {' '}
            • {record.inputTokens}+{record.outputTokens} tokens
          </Text>
          <Text color={theme.muted}> • {durationSec}s</Text>
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width={width} padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={theme.accent}>
          Cost Dashboard
        </Text>
      </Box>

      {/* Current Session Summary */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color={theme.foreground}>
            Current Session
          </Text>
        </Box>
        <Box marginLeft={2}>
          <Text color={theme.muted}>Stories Completed: </Text>
          <Text color={theme.foreground}>
            {storiesCompleted} ({storiesSuccessful} successful)
          </Text>
        </Box>
        <Box marginLeft={2}>
          <Text color={theme.muted}>Total Cost: </Text>
          <Text color={theme.foreground}>{formatCost(totalActual)}</Text>
        </Box>
        <Box marginLeft={2}>
          <Text color={theme.muted}>Time Elapsed: </Text>
          <Text color={theme.foreground}>{formatElapsedTime()}</Text>
        </Box>
      </Box>

      {/* Estimated vs Actual Comparison */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color={theme.foreground}>
            Budget Analysis
          </Text>
        </Box>
        <Box marginLeft={2}>
          <Text color={theme.muted}>Estimated: </Text>
          <Text color={theme.foreground}>{formatCost(totalEstimated)}</Text>
        </Box>
        <Box marginLeft={2}>
          <Text color={theme.muted}>Actual: </Text>
          <Text color={theme.foreground}>{formatCost(totalActual)}</Text>
        </Box>
        <Box marginLeft={2}>
          <Text color={theme.muted}>Variance: </Text>
          <Text color={getVarianceColor()}>
            {variance >= 0 ? '+' : ''}
            {formatCost(variance)} ({variance >= 0 ? '+' : ''}
            {variancePercent}%)
          </Text>
        </Box>
      </Box>

      {/* Per-Story Breakdown */}
      {records.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color={theme.foreground}>
              Story Breakdown
            </Text>
          </Box>
          <Box flexDirection="column" marginTop={1}>
            {records.map((record, idx) => renderStoryRecord(record, idx))}
          </Box>
        </Box>
      )}

      {/* Empty state */}
      {records.length === 0 && (
        <Box marginLeft={2}>
          <Text color={theme.muted}>No stories executed yet in this session</Text>
        </Box>
      )}

      {/* Last updated timestamp */}
      <Box marginTop={1}>
        <Text color={theme.muted} dimColor>
          Last updated: {currentTime.toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
});
