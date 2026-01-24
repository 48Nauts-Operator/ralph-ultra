import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';
import { getRecentProjects, clearRecentProjects, type RecentProject } from '@utils/config';
import type { Project } from '../types';

interface ProjectsRailProps {
  /** Whether the rail is collapsed (3 chars) or expanded (12 chars) */
  collapsed: boolean;
  /** Callback when collapse toggle is requested */
  onToggleCollapse: () => void;
  /** List of projects to display */
  projects: Project[];
  /** Currently active project ID */
  activeProjectId: string | null;
  /** Callback when a project is selected */
  onSelectProject: (projectId: string) => void;
  /** Callback when a recent project is selected */
  onRecentSelect?: (path: string) => void;
  /** Whether this rail has focus for keyboard input */
  hasFocus: boolean;
}

/**
 * Projects Rail - Leftmost panel showing project icons/letters
 * Features:
 * - Collapsible with '[' key (3 chars collapsed, 12 chars expanded)
 * - Shows project icons with colored borders
 * - Active project highlighted with accent color
 * - Up/Down navigation, Enter to select
 */
export const ProjectsRail: React.FC<ProjectsRailProps> = ({
  collapsed,
  onToggleCollapse,
  projects,
  activeProjectId,
  onSelectProject,
  onRecentSelect,
  hasFocus,
}) => {
  const { theme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [showRecent, setShowRecent] = useState(false);

  // Load recent projects on mount and when focus changes
  useEffect(() => {
    const recent = getRecentProjects();
    // Filter out currently open projects
    const openPaths = new Set(projects.map(p => p.path));
    const filtered = recent.filter(r => !openPaths.has(r.path));
    setRecentProjects(filtered.slice(0, 5)); // Show max 5 recent projects
  }, [projects, hasFocus]);

  // Calculate total items (projects + recent)
  const totalItems = projects.length + (showRecent ? recentProjects.length : 0);

  // Handle keyboard input when focused
  useInput(
    (input, key) => {
      if (!hasFocus) return;

      // Toggle collapse with '[' key
      if (input === '[') {
        onToggleCollapse();
        return;
      }

      // Toggle recent projects with 'r' key
      if (input === 'r' && !collapsed) {
        setShowRecent(prev => !prev);
        return;
      }

      // Clear recent history with 'c' key when showing recent
      if (input === 'c' && showRecent) {
        clearRecentProjects();
        setRecentProjects([]);
        setShowRecent(false);
        return;
      }

      // Navigate with arrow keys
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(totalItems - 1, prev + 1));
      }

      // Select project with Enter
      if (key.return) {
        if (selectedIndex < projects.length && projects[selectedIndex]) {
          onSelectProject(projects[selectedIndex].id);
        } else if (showRecent && onRecentSelect) {
          const recentIndex = selectedIndex - projects.length;
          if (recentProjects[recentIndex]) {
            onRecentSelect(recentProjects[recentIndex].path);
          }
        }
      }
    },
    { isActive: hasFocus },
  );

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= totalItems) {
      setSelectedIndex(Math.max(0, totalItems - 1));
    }
  }, [totalItems, selectedIndex]);

  /**
   * Get the display icon for a project (first letter or custom icon)
   */
  const getProjectIcon = (project: Project): string => {
    if (project.icon) return project.icon;
    return project.name.charAt(0).toUpperCase();
  };

  /**
   * Get the display color for a project
   */
  const getProjectColor = (project: Project): string => {
    return project.color || '#7FFFD4'; // Default to mint accent
  };

  /**
   * Render a recent project item
   */
  const renderRecentProject = (recent: RecentProject, index: number) => {
    const globalIndex = projects.length + index;
    const isSelected = globalIndex === selectedIndex && hasFocus;
    const icon = recent.icon || recent.name.charAt(0).toUpperCase();

    if (collapsed) {
      // Don't show recent in collapsed view
      return null;
    }

    // Expanded view: icon + name
    const displayName = recent.name.length > 8 ? recent.name.substring(0, 7) + '…' : recent.name;

    return (
      <Box key={recent.path} flexDirection="row" marginBottom={0}>
        <Box
          borderStyle={isSelected ? 'round' : 'single'}
          borderColor={isSelected ? 'cyan' : 'gray'}
          borderDimColor={!isSelected}
          width={12}
          paddingX={1}
        >
          <Text dimColor={!isSelected} color={isSelected ? theme.accent : undefined}>
            {icon}
          </Text>
          <Text dimColor> {displayName}</Text>
        </Box>
      </Box>
    );
  };

  /**
   * Render a project item
   */
  const renderProject = (project: Project, index: number) => {
    const isActive = project.id === activeProjectId;
    const isSelected = index === selectedIndex && hasFocus;
    const icon = getProjectIcon(project);
    const color = getProjectColor(project);

    if (collapsed) {
      // Collapsed view: just icon
      return (
        <Box key={project.id} flexDirection="column">
          <Box
            borderStyle={isActive ? 'bold' : 'single'}
            borderColor={isActive ? color : isSelected ? theme.accent : theme.border}
            width={3}
            justifyContent="center"
          >
            <Text bold={isActive} color={isActive ? color : isSelected ? theme.accent : undefined}>
              {icon}
            </Text>
          </Box>
        </Box>
      );
    }

    // Expanded view: icon + name
    const displayName = project.name.length > 8 ? project.name.substring(0, 7) + '…' : project.name;

    return (
      <Box key={project.id} flexDirection="row" marginBottom={0}>
        <Box
          borderStyle={isActive ? 'bold' : isSelected ? 'round' : 'single'}
          borderColor={isActive ? color : isSelected ? 'cyan' : 'gray'}
          width={12}
          paddingX={1}
        >
          <Text
            bold={isActive || isSelected}
            color={isActive ? color : isSelected ? theme.accent : undefined}
          >
            {icon}
          </Text>
          <Text dimColor={!isActive && !isSelected}> {displayName}</Text>
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" paddingTop={1}>
      {/* Header */}
      <Box marginBottom={1} paddingX={1}>
        <Text bold dimColor={!hasFocus} color={hasFocus ? theme.accent : undefined}>
          {collapsed ? '▶' : 'Projects'}
        </Text>
      </Box>

      {/* Project list */}
      <Box flexDirection="column" gap={collapsed ? 0 : 0}>
        {projects.map((project, index) => renderProject(project, index))}
      </Box>

      {/* Recent projects section */}
      {!collapsed && recentProjects.length > 0 && (
        <>
          <Box marginTop={1} marginBottom={1} paddingX={1}>
            <Text dimColor={!showRecent} color={showRecent ? theme.accent : undefined}>
              Recent {showRecent ? '▼' : '▶'}
            </Text>
          </Box>

          {showRecent && (
            <Box flexDirection="column" gap={0}>
              {recentProjects.map((recent, index) => renderRecentProject(recent, index))}
            </Box>
          )}
        </>
      )}

      {/* Hints at bottom */}
      {!collapsed && (
        <Box marginTop={1} paddingX={1} flexDirection="column">
          <Text dimColor>[{' toggle'}</Text>
          {recentProjects.length > 0 && (
            <>
              <Text dimColor>r{' recent'}</Text>
              {showRecent && <Text dimColor>c{' clear'}</Text>}
            </>
          )}
        </Box>
      )}
    </Box>
  );
};
