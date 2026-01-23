import React, { useState, useEffect, memo } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@hooks/useTheme';
import type { TailscaleStatus } from '../remote/tailscale';
import type { AnthropicStatus, ApiStatus } from '@utils/status-check';
import { getSystemStats, type SystemStats } from '@utils/system-stats';

interface StatusBarProps {
  /** Current agent identifier (e.g., 'claude-sonnet-4-20250514') */
  agentName?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Number of remote connections */
  remoteConnections?: number;
  /** Tailscale status information */
  tailscaleStatus?: TailscaleStatus | null;
  /** Anthropic API status */
  apiStatus?: AnthropicStatus | null;
  /** Total terminal width for layout calculations */
  width: number;
}

/**
 * Top status bar component showing branding, agent status, progress, and timer
 * Exactly 1 line height, spans full terminal width
 */
export const StatusBar: React.FC<StatusBarProps> = memo(
  ({ agentName, progress = 0, remoteConnections = 0, tailscaleStatus = null, apiStatus = null, width }) => {
    const { theme } = useTheme();
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [systemStats, setSystemStats] = useState<SystemStats>({
      cpuUsage: 0,
      memUsage: 0,
      memTotal: 0,
      memUsed: 0,
      memFree: 0,
    });

    useEffect(() => {
      const TIMER_INTERVAL_MS = 5000;
      const interval = setInterval(() => {
        setElapsedSeconds(s => s + 5);
        setSystemStats(getSystemStats());
      }, TIMER_INTERVAL_MS);

      setSystemStats(getSystemStats());

      return () => clearInterval(interval);
    }, []);

    // Format elapsed time as HH:MM:SS
    const formatTime = (totalSeconds: number): string => {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Generate progress bar
    const generateProgressBar = (percent: number, barWidth: number): string => {
      const clampedPercent = Math.max(0, Math.min(100, percent));
      const filled = Math.floor((clampedPercent / 100) * barWidth);
      const empty = barWidth - filled;
      return '█'.repeat(filled) + '░'.repeat(empty);
    };

    const version = 'v2.0.0';
    const branding = `Ralph Ultra ${version}`;
    const agent = agentName || 'Idle';
    const progressBarWidth = 10;
    const progressText = `${generateProgressBar(progress, progressBarWidth)} ${progress}%`;
    const timer = formatTime(elapsedSeconds);

    const remoteIcon = remoteConnections > 0 ? '●' : '○';
    const remoteColor = remoteConnections > 0 ? theme.success : theme.muted;
    const remoteText = `${remoteIcon} ${remoteConnections}`;

    const cpuColor =
      systemStats.cpuUsage > 80
        ? theme.error
        : systemStats.cpuUsage > 50
          ? theme.warning
          : theme.success;
    const memColor =
      systemStats.memUsage > 80
        ? theme.error
        : systemStats.memUsage > 50
          ? theme.warning
          : theme.success;
    const cpuText = `CPU:${systemStats.cpuUsage}%`;
    const memText = `MEM:${systemStats.memUsed}G`;

    // Tailscale status indicator
    const getTailscaleIcon = (): string => {
      if (!tailscaleStatus) return '◌'; // Hollow circle - checking
      if (!tailscaleStatus.isInstalled) return '○'; // Empty circle - not installed
      if (!tailscaleStatus.isConnected) return '◐'; // Half-filled circle - disconnected
      return '●'; // Filled circle - connected
    };

    const getTailscaleColor = () => {
      if (!tailscaleStatus || !tailscaleStatus.isInstalled) return theme.muted;
      if (!tailscaleStatus.isConnected) return theme.warning;
      return theme.success;
    };

    const tailscaleIcon = getTailscaleIcon();
    const tailscaleColor = getTailscaleColor();

    // API status indicator
    const getApiStatusIcon = (): string => {
      if (!apiStatus) return '○'; // Not checked yet
      const icons: Record<ApiStatus, string> = {
        operational: '✓',
        degraded: '⚠',
        outage: '✗',
        unknown: '?',
      };
      return icons[apiStatus.status];
    };

    const getApiStatusColor = () => {
      if (!apiStatus) return theme.muted;
      const colors: Record<ApiStatus, string> = {
        operational: theme.success,
        degraded: theme.warning,
        outage: theme.error,
        unknown: theme.muted,
      };
      return colors[apiStatus.status];
    };

    const apiIcon = getApiStatusIcon();
    const apiColor = getApiStatusColor();

    const contentWidth =
      branding.length +
      agent.length +
      progressText.length +
      cpuText.length +
      1 +
      memText.length +
      1 +
      apiIcon.length +
      1 +
      remoteText.length +
      timer.length;
    const totalSpacing = Math.max(0, width - contentWidth);
    const numGaps = 7;
    const baseSpacing = Math.floor(totalSpacing / numGaps);
    const remainder = totalSpacing - baseSpacing * numGaps;

    return (
      <Box width={width}>
        <Text bold color={theme.accent}>
          {branding}
        </Text>
        <Text>{' '.repeat(baseSpacing)}</Text>
        <Text color={theme.muted}>{agent}</Text>
        <Text>{' '.repeat(baseSpacing)}</Text>
        <Text color={theme.warning}>{progressText}</Text>
        <Text>{' '.repeat(baseSpacing)}</Text>
        <Text color={cpuColor}>{cpuText}</Text>
        <Text> </Text>
        <Text color={memColor}>{memText}</Text>
        <Text>{' '.repeat(baseSpacing)}</Text>
        <Text color={apiColor}>{apiIcon}</Text>
        <Text>{' '.repeat(baseSpacing)}</Text>
        <Text color={tailscaleColor}>{tailscaleIcon}</Text>
        <Text>{' '.repeat(baseSpacing)}</Text>
        <Text color={remoteColor}>{remoteText}</Text>
        <Text>{' '.repeat(baseSpacing + remainder)}</Text>
        <Text color={theme.success}>{timer}</Text>
      </Box>
    );
  },
);
