import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  /** Current agent identifier (e.g., 'claude-sonnet-4-20250514') */
  agentName?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Total terminal width for layout calculations */
  width: number;
}

/**
 * Top status bar component showing branding, agent status, progress, and timer
 * Exactly 1 line height, spans full terminal width
 */
export const StatusBar: React.FC<StatusBarProps> = ({ agentName, progress = 0, width }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
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

  // Calculate spacing to distribute elements across the width
  // Format: [branding] [spacing] [agent] [spacing] [progress] [spacing] [timer]
  const contentWidth = branding.length + agent.length + progressText.length + timer.length;
  const totalSpacing = Math.max(0, width - contentWidth);
  const spacing1 = Math.floor(totalSpacing * 0.3);
  const spacing2 = Math.floor(totalSpacing * 0.3);
  const spacing3 = totalSpacing - spacing1 - spacing2;

  return (
    <Box width={width}>
      <Text bold color="cyan">
        {branding}
      </Text>
      <Text>{' '.repeat(spacing1)}</Text>
      <Text dimColor>{agent}</Text>
      <Text>{' '.repeat(spacing2)}</Text>
      <Text color="yellow">{progressText}</Text>
      <Text>{' '.repeat(spacing3)}</Text>
      <Text color="green">{timer}</Text>
    </Box>
  );
};
