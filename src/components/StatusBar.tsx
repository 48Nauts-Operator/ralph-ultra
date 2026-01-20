import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@hooks/useTheme';

interface StatusBarProps {
  /** Current agent identifier (e.g., 'claude-sonnet-4-20250514') */
  agentName?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Number of remote connections */
  remoteConnections?: number;
  /** Total terminal width for layout calculations */
  width: number;
}

/**
 * Top status bar component showing branding, agent status, progress, and timer
 * Exactly 1 line height, spans full terminal width
 */
export const StatusBar: React.FC<StatusBarProps> = ({
  agentName,
  progress = 0,
  remoteConnections = 0,
  width,
}) => {
  const { theme } = useTheme();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);

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

  // Layout calculations
  const version = 'v2.0.0';
  const branding = `Ralph Ultra ${version}`;
  const agent = agentName || 'Idle';
  const progressBarWidth = 10;
  const progressText = `${generateProgressBar(progress, progressBarWidth)} ${progress}%`;
  const timer = formatTime(elapsedSeconds);

  // Remote connection indicator
  const remoteIcon = remoteConnections > 0 ? '●' : '○';
  const remoteColor = remoteConnections > 0 ? theme.success : theme.muted;
  const remoteText = `${remoteIcon} ${remoteConnections}`;

  // Calculate spacing to distribute elements across the width
  // Format: [branding] [spacing] [agent] [spacing] [progress] [spacing] [remote] [spacing] [timer]
  const contentWidth =
    branding.length + agent.length + progressText.length + remoteText.length + timer.length;
  const totalSpacing = Math.max(0, width - contentWidth);
  const spacing1 = Math.floor(totalSpacing * 0.25);
  const spacing2 = Math.floor(totalSpacing * 0.25);
  const spacing3 = Math.floor(totalSpacing * 0.25);
  const spacing4 = totalSpacing - spacing1 - spacing2 - spacing3;

  return (
    <Box width={width}>
      <Text bold color={theme.accent}>
        {branding}
      </Text>
      <Text>{' '.repeat(spacing1)}</Text>
      <Text color={theme.muted}>{agent}</Text>
      <Text>{' '.repeat(spacing2)}</Text>
      <Text color={theme.warning}>{progressText}</Text>
      <Text>{' '.repeat(spacing3)}</Text>
      <Text color={remoteColor}>{remoteText}</Text>
      <Text>{' '.repeat(spacing4)}</Text>
      <Text color={theme.success}>{timer}</Text>
    </Box>
  );
};
