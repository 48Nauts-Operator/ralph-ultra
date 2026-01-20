import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
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
  hasFocus,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Handle keyboard input when focused
  useInput(
    (input, key) => {
      if (!hasFocus) return;

      // Toggle collapse with '[' key
      if (input === '[') {
        onToggleCollapse();
        return;
      }

      // Navigate with arrow keys
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(projects.length - 1, prev + 1));
      }

      // Select project with Enter
      if (key.return && projects[selectedIndex]) {
        onSelectProject(projects[selectedIndex].id);
      }
    },
    { isActive: hasFocus },
  );

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= projects.length) {
      setSelectedIndex(Math.max(0, projects.length - 1));
    }
  }, [projects.length, selectedIndex]);

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
            borderColor={isActive ? color : isSelected ? 'cyan' : 'gray'}
            width={3}
            justifyContent="center"
          >
            <Text bold={isActive} color={isActive ? color : isSelected ? 'cyan' : undefined}>
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
            color={isActive ? color : isSelected ? 'cyan' : undefined}
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
        <Text bold dimColor={!hasFocus} color={hasFocus ? 'cyan' : undefined}>
          {collapsed ? '▶' : 'Projects'}
        </Text>
      </Box>

      {/* Project list */}
      <Box flexDirection="column" gap={collapsed ? 0 : 0}>
        {projects.map((project, index) => renderProject(project, index))}
      </Box>

      {/* Hint at bottom */}
      {!collapsed && projects.length > 0 && (
        <Box marginTop={1} paddingX={1}>
          <Text dimColor>[{' toggle'}</Text>
        </Box>
      )}
    </Box>
  );
};
