import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';
import { getRecentProjects, clearRecentProjects, type RecentProject } from '../utils/config';
import type { Project } from '../types';

interface RecentProjectsOverlayProps {
  /** Current projects that are already open */
  openProjects: Project[];
  /** Callback when a recent project is selected */
  onSelectProject: (path: string, name: string) => void;
  /** Callback to close the overlay */
  onClose: () => void;
}

/**
 * RecentProjectsOverlay - Shows recently opened projects for quick access
 * Features:
 * - Displays last 10 projects with timestamps
 * - Filters out currently open projects
 * - Arrow key navigation
 * - Clear history option
 */
export const RecentProjectsOverlay: React.FC<RecentProjectsOverlayProps> = ({
  openProjects,
  onSelectProject,
  onClose,
}) => {
  const { theme } = useTheme();
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Load recent projects on mount
  useEffect(() => {
    const recent = getRecentProjects();
    // Filter out currently open projects
    const openPaths = new Set(openProjects.map(p => p.path));
    const filtered = recent.filter(r => !openPaths.has(r.path));
    setRecentProjects(filtered);
  }, [openProjects]);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(recentProjects.length - 1, prev + 1));
    }

    if (key.return && recentProjects[selectedIndex]) {
      const project = recentProjects[selectedIndex];
      onSelectProject(project.path, project.name);
      onClose();
    }

    // Clear history with 'c' key
    if (input === 'c') {
      clearRecentProjects();
      setRecentProjects([]);
    }
  });

  /**
   * Format timestamp for display
   */
  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={2}
      paddingY={1}
      minWidth={60}
    >
      <Box marginBottom={1}>
        <Text bold color={theme.accent}>
          Recent Projects
        </Text>
      </Box>

      {recentProjects.length === 0 ? (
        <Box paddingY={2}>
          <Text color={theme.muted}>No recent projects</Text>
        </Box>
      ) : (
        <>
          <Box flexDirection="column" marginBottom={1}>
            {recentProjects.map((project, index) => {
              const isSelected = index === selectedIndex;
              const timeAgo = formatTime(project.lastAccessed);

              return (
                <Box key={project.path} flexDirection="row" marginY={0}>
                  <Text bold={isSelected} color={isSelected ? theme.accent : undefined}>
                    {isSelected ? '→ ' : '  '}
                  </Text>
                  <Box flexGrow={1} flexDirection="row" justifyContent="space-between">
                    <Text color={isSelected ? theme.accent : theme.foreground}>
                      {project.name}
                    </Text>
                    <Text dimColor>{timeAgo}</Text>
                  </Box>
                </Box>
              );
            })}
          </Box>

          <Box borderStyle="single" borderTop borderColor={theme.border} marginY={1} />

          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor>↑↓ Navigate</Text>
            <Text dimColor>⏎ Open</Text>
            <Text dimColor>c Clear</Text>
            <Text dimColor>Esc Cancel</Text>
          </Box>
        </>
      )}
    </Box>
  );
};