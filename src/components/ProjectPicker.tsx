import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';
import type { Project } from '../types';

export interface ProjectPickerProps {
  /** Terminal dimensions */
  width: number;
  height: number;
  /** Available projects */
  projects: Project[];
  /** Projects already open in tabs */
  openProjectIds: string[];
  /** Callback when a project is selected */
  onSelect: (project: Project) => void;
  /** Callback when picker is cancelled */
  onCancel: () => void;
}

/**
 * ProjectPicker component - modal overlay for selecting a project to open in a new tab
 */
export const ProjectPicker: React.FC<ProjectPickerProps> = ({
  width,
  height,
  projects,
  openProjectIds,
  onSelect,
  onCancel,
}) => {
  const { theme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter out already-open projects
  const availableProjects = projects.filter(p => !openProjectIds.includes(p.id));

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel();
      } else if (key.return) {
        if (availableProjects.length > 0) {
          const selectedProject = availableProjects[selectedIndex];
          if (selectedProject) {
            onSelect(selectedProject);
          }
        }
      } else if (key.upArrow || input === 'k') {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow || input === 'j') {
        setSelectedIndex(prev => Math.min(availableProjects.length - 1, prev + 1));
      }
    },
    { isActive: true },
  );

  const modalWidth = Math.min(60, Math.floor(width * 0.8));
  const modalHeight = Math.min(20, Math.floor(height * 0.6));

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      alignItems="center"
      justifyContent="center"
    >
      {/* Dimmed background */}
      <Box position="absolute" width={width} height={height}>
        {Array.from({ length: height }).map((_, i) => (
          <Box key={i}>
            <Text dimColor>{' '.repeat(width)}</Text>
          </Box>
        ))}
      </Box>

      {/* Modal */}
      <Box
        flexDirection="column"
        width={modalWidth}
        height={modalHeight}
        borderStyle="double"
        borderColor={theme.accent}
        paddingX={2}
        paddingY={1}
      >
        {/* Header */}
        <Box marginBottom={1}>
          <Text bold color={theme.accent}>
            Open Project in New Tab
          </Text>
        </Box>

        {/* Project list */}
        <Box flexDirection="column" flexGrow={1}>
          {availableProjects.length === 0 ? (
            <Box marginTop={1}>
              <Text color={theme.muted}>No additional projects available</Text>
              <Text color={theme.muted}>All projects are already open in tabs</Text>
            </Box>
          ) : (
            availableProjects.slice(0, modalHeight - 6).map((project, index) => {
              const isSelected = index === selectedIndex;
              return (
                <Box key={project.id} marginBottom={0}>
                  <Text bold={isSelected} color={isSelected ? theme.accent : theme.foreground}>
                    {isSelected ? '▶ ' : '  '}
                    {project.name}
                  </Text>
                  <Text color={theme.muted}> ({project.path})</Text>
                </Box>
              );
            })
          )}
        </Box>

        {/* Footer */}
        <Box borderStyle="single" borderColor={theme.border} paddingX={1} marginTop={1}>
          <Text color={theme.muted}>
            {availableProjects.length > 0 ? '↑↓ Navigate  ⏎ Select  Esc Cancel' : 'Esc Close'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
