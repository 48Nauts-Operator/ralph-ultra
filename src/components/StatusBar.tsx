import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@hooks/useTheme';
import type { TailscaleStatus } from '../remote/tailscale';
import type { AnthropicStatus, ApiStatus } from '@utils/status-check';
import type { ExecutionMode } from '../core/types';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

interface StatusBarProps {
  progress?: number;
  remoteConnections?: number;
  tailscaleStatus?: TailscaleStatus | null;
  apiStatus?: AnthropicStatus | null;
  projectPath?: string;
  executionMode?: ExecutionMode;
  currentCLI?: string | null;
  currentModel?: string | null;
  width: number;
}

const getVersion = (): string => {
  try {
    const possiblePaths = [
      join(process.cwd(), 'package.json'),
      join(dirname(fileURLToPath(import.meta.url)), '../../package.json'),
      join(dirname(fileURLToPath(import.meta.url)), '../../../package.json'),
    ];

    for (const pkgPath of possiblePaths) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) return `v${pkg.version}`;
      } catch {
        continue;
      }
    }
    return 'v3.0.0';
  } catch {
    return 'v3.0.0';
  }
};

const APP_VERSION = getVersion();

const getGitBranch = (projectPath?: string): string | null => {
  if (!projectPath) return null;
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
};

export const StatusBar: React.FC<StatusBarProps> = memo(
  ({
    progress = 0,
    remoteConnections = 0,
    tailscaleStatus = null,
    apiStatus = null,
    projectPath,
    executionMode = 'balanced',
    currentCLI = null,
    currentModel = null,
    width,
  }) => {
    const { theme } = useTheme();
    const gitBranch = getGitBranch(projectPath);

    const generateProgressBar = (percent: number, barWidth: number): string => {
      const clampedPercent = Math.max(0, Math.min(100, percent));
      const filled = Math.floor((clampedPercent / 100) * barWidth);
      const empty = barWidth - filled;
      return '█'.repeat(filled) + '░'.repeat(empty);
    };

    const progressBarWidth = 10;
    const progressText = `${generateProgressBar(progress, progressBarWidth)} ${progress}%`;

    const remoteIcon = remoteConnections > 0 ? '●' : '○';
    const remoteColor = remoteConnections > 0 ? theme.success : theme.muted;

    const getTailscaleIcon = (): string => {
      if (!tailscaleStatus) return '◌';
      if (!tailscaleStatus.isInstalled) return '○';
      if (!tailscaleStatus.isConnected) return '◐';
      return '●';
    };

    const getTailscaleColor = () => {
      if (!tailscaleStatus || !tailscaleStatus.isInstalled) return theme.muted;
      if (!tailscaleStatus.isConnected) return theme.warning;
      return theme.success;
    };

    const tailscaleIcon = getTailscaleIcon();
    const tailscaleColor = getTailscaleColor();

    const getApiStatusIcon = (): string => {
      if (!apiStatus) return '○';
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

    const getModeIcon = (): string => {
      const icons: Record<ExecutionMode, string> = {
        'super-saver': '💰',
        'balanced': '⚖',
        'fast-delivery': '🚀',
      };
      return icons[executionMode];
    };

    const getModeColor = () => {
      const colors: Record<ExecutionMode, string> = {
        'super-saver': theme.success, // Green for cost savings
        'balanced': theme.accent, // Blue for balanced approach
        'fast-delivery': theme.warning, // Yellow/orange for speed
      };
      return colors[executionMode];
    };

    const getModeLabel = (): string => {
      const labels: Record<ExecutionMode, string> = {
        'super-saver': 'saver',
        'balanced': 'balanced',
        'fast-delivery': 'fast',
      };
      return labels[executionMode];
    };

    const modeIcon = getModeIcon();
    const modeColor = getModeColor();
    const modeLabel = getModeLabel();

    const branchText = gitBranch ? `⎇ ${gitBranch}` : '';
    const agentLabel = currentCLI && currentModel ? `${currentCLI}/${currentModel}` : currentCLI || '';

    const centerContent = `${progressText} [${apiIcon} ${tailscaleIcon} ${remoteIcon}${remoteConnections}] ${modeIcon}${modeLabel}${agentLabel ? ` ${agentLabel}` : ''}${branchText ? ` ${branchText}` : ''}`;
    const rightContent = APP_VERSION;

    const totalContent = centerContent.length + rightContent.length;
    const totalPadding = Math.max(0, width - totalContent);
    const leftPad = Math.floor(totalPadding / 2);
    const rightPad = totalPadding - leftPad - rightContent.length;

    return (
      <Box width={width}>
        <Text>{' '.repeat(leftPad)}</Text>
        <Text color={theme.warning}>{progressText}</Text>
        <Text> </Text>
        <Text dimColor>[</Text>
        <Text color={apiColor}>{apiIcon}</Text>
        <Text> </Text>
        <Text color={tailscaleColor}>{tailscaleIcon}</Text>
        <Text> </Text>
        <Text color={remoteColor}>
          {remoteIcon}
          {remoteConnections}
        </Text>
        <Text dimColor>]</Text>
        <Text> </Text>
        <Text color={modeColor}>
          {modeIcon}
          {modeLabel}
        </Text>
        {agentLabel && (
          <>
            <Text> </Text>
            <Text color={theme.accent}>{agentLabel}</Text>
          </>
        )}
        {gitBranch && (
          <>
            <Text> </Text>
            <Text color={theme.accent}>⎇ {gitBranch}</Text>
          </>
        )}
        <Text>{' '.repeat(Math.max(0, rightPad))}</Text>
        <Text color={theme.muted}>{rightContent}</Text>
      </Box>
    );
  },
);
