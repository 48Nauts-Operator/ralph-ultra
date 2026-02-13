import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '@hooks/useTheme';
import type { Project } from '../types';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname, resolve } from 'path';
import { homedir } from 'os';
import { getRecentProjects, clearRecentProjects, type RecentProject } from '../utils/config';

export interface ProjectPickerProps {
  width: number;
  height: number;
  projects: Project[];
  openProjectIds: string[];
  onSelect: (project: Project) => void;
  onCancel?: () => void;
}

type Mode = 'input' | 'browse' | 'recent';

interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  hasPrd: boolean;
}

function listDirectory(dirPath: string): DirEntry[] {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const dirs: DirEntry[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory()) continue;

      const fullPath = join(dirPath, entry.name);
      const hasPrd = existsSync(join(fullPath, 'prd.json'));

      dirs.push({
        name: entry.name,
        path: fullPath,
        isDirectory: true,
        hasPrd,
      });
    }

    return dirs.sort((a, b) => {
      if (a.hasPrd && !b.hasPrd) return -1;
      if (!a.hasPrd && b.hasPrd) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

function isValidProjectPath(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return resolve(path);
}

function shortenPath(fullPath: string): string {
  const home = homedir();
  if (fullPath.startsWith(home)) {
    return '~' + fullPath.slice(home.length);
  }
  return fullPath;
}

export const ProjectPicker: React.FC<ProjectPickerProps> = ({
  width,
  height,
  openProjectIds,
  onSelect,
  onCancel,
}) => {
  const { theme } = useTheme();

  // Default to browse when no recent projects exist
  const initialRecent = getRecentProjects().filter(
    p => isValidProjectPath(p.path) && !openProjectIds.includes(p.path),
  );
  const [mode, setMode] = useState<Mode>(initialRecent.length > 0 ? 'recent' : 'browse');
  const [pathInput, setPathInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [browsePath, setBrowsePath] = useState(homedir());
  const [dirEntries, setDirEntries] = useState<DirEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(initialRecent);

  useEffect(() => {
    if (mode === 'browse') {
      setDirEntries(listDirectory(browsePath));
      setSelectedIndex(0);
    } else if (mode === 'recent') {
      const recent = getRecentProjects().filter(
        p => isValidProjectPath(p.path) && !openProjectIds.includes(p.path),
      );
      setRecentProjects(recent);
      setSelectedIndex(0);
    }
  }, [mode, browsePath, openProjectIds]);

  const handleSubmitPath = () => {
    const expanded = expandPath(pathInput.trim());

    if (!expanded) {
      setError('Please enter a path');
      return;
    }

    if (!isValidProjectPath(expanded)) {
      setError('Invalid path or directory does not exist');
      return;
    }

    const projectName = basename(expanded);
    const projectId = `proj-${Date.now()}`;

    if (openProjectIds.includes(expanded)) {
      setError('Project already open in another tab');
      return;
    }

    const project: Project = {
      id: projectId,
      name: projectName,
      path: expanded,
      color: '#7FFFD4',
    };

    onSelect(project);
  };

  const handleBrowseNavigate = () => {
    const entry = dirEntries[selectedIndex];
    if (!entry) return;

    // Navigate into directory
    setBrowsePath(entry.path);
  };

  const handleBrowseSelect = () => {
    const entry = dirEntries[selectedIndex];
    if (!entry) return;

    if (entry.hasPrd) {
      if (openProjectIds.includes(entry.path)) {
        setError('Project already open in another tab');
        return;
      }
      const project: Project = {
        id: `proj-${Date.now()}`,
        name: entry.name,
        path: entry.path,
        color: '#7FFFD4',
      };
      onSelect(project);
    } else {
      // No prd.json — navigate into it
      setBrowsePath(entry.path);
    }
  };

  const handleBrowseUp = () => {
    const parent = dirname(browsePath);
    if (parent !== browsePath) {
      setBrowsePath(parent);
    }
  };

  const handleSelectRecentProject = () => {
    const project = recentProjects[selectedIndex];
    if (!project) return;

    if (openProjectIds.includes(project.path)) {
      setError('Project already open in another tab');
      return;
    }

    const selectedProject: Project = {
      id: `proj-${Date.now()}`,
      name: project.name,
      path: project.path,
      color: project.color || '#7FFFD4',
    };
    onSelect(selectedProject);
  };

  const handleClearRecentProjects = () => {
    clearRecentProjects();
    setRecentProjects([]);
    setError('Recent projects cleared');
  };

  useInput(
    (input, key) => {
      if (key.escape) {
        if (mode === 'browse' || mode === 'recent') {
          setMode('input');
        } else if (onCancel) {
          onCancel();
        }
        return;
      }

      if (mode === 'input') {
        if (key.tab) {
          setMode('recent');
          setError(null);
        } else if (key.return) {
          handleSubmitPath();
        }
      } else if (mode === 'recent') {
        if (key.upArrow || input === 'k') {
          setSelectedIndex(prev => Math.max(0, prev - 1));
        } else if (key.downArrow || input === 'j') {
          setSelectedIndex(prev => Math.min(recentProjects.length - 1, prev + 1));
        } else if (key.return) {
          handleSelectRecentProject();
        } else if (input === 'c') {
          handleClearRecentProjects();
        } else if (key.tab) {
          setMode('browse');
          setError(null);
        }
      } else if (mode === 'browse') {
        if (key.upArrow || input === 'k') {
          setSelectedIndex(prev => Math.max(0, prev - 1));
        } else if (key.downArrow || input === 'j') {
          setSelectedIndex(prev => Math.min(dirEntries.length - 1, prev + 1));
        } else if (key.rightArrow || input === 'l') {
          handleBrowseNavigate();
        } else if (key.return) {
          handleBrowseSelect();
        } else if (key.leftArrow || key.backspace || key.delete || input === 'h') {
          handleBrowseUp();
        } else if (key.tab) {
          setMode('input');
        }
      }
    },
    { isActive: true },
  );

  const modalWidth = Math.min(76, Math.floor(width * 0.9));
  // Use up to 80% of terminal height, no arbitrary cap
  const modalHeight = Math.max(14, Math.floor(height * 0.8));
  // Header (title + tabs + border) takes ~6 lines, footer takes ~3 lines
  const listHeight = modalHeight - 9;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      alignItems="center"
      justifyContent="center"
    >
      <Box
        flexDirection="column"
        width={modalWidth}
        height={modalHeight}
        borderStyle="double"
        borderColor={theme.accent}
        paddingX={2}
        paddingY={1}
      >
        <Box marginBottom={1}>
          <Text bold color={theme.accent}>
            Open Project
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color={mode === 'recent' ? theme.accent : theme.muted} bold={mode === 'recent'}>
            [Tab] Recent
          </Text>
          <Text color={theme.muted}> | </Text>
          <Text color={mode === 'browse' ? theme.accent : theme.muted} bold={mode === 'browse'}>
            [Tab] Browse
          </Text>
          <Text color={theme.muted}> | </Text>
          <Text color={mode === 'input' ? theme.accent : theme.muted} bold={mode === 'input'}>
            [Tab] Path
          </Text>
        </Box>

        {mode === 'input' ? (
          <Box flexDirection="column" flexGrow={1}>
            <Box marginBottom={1}>
              <Text color={theme.foreground}>Path: </Text>
              <Box borderStyle="single" borderColor={theme.border} paddingX={1} flexGrow={1}>
                <TextInput
                  value={pathInput}
                  onChange={value => {
                    setPathInput(value);
                    setError(null);
                  }}
                  placeholder="~/projects/my-app or /absolute/path"
                />
              </Box>
            </Box>

            {error && (
              <Box marginBottom={1}>
                <Text color={theme.error}>{error}</Text>
              </Box>
            )}

            <Box flexGrow={1} />

            <Box>
              <Text color={theme.muted}>Enter path to a project directory</Text>
            </Box>
          </Box>
        ) : mode === 'recent' ? (
          <Box flexDirection="column" flexGrow={1}>
            {error && (
              <Box marginBottom={1}>
                <Text color={theme.error}>{error}</Text>
              </Box>
            )}

            <Box flexDirection="column" height={listHeight} overflowY="hidden">
              {recentProjects.length === 0 ? (
                <Box paddingY={1}>
                  <Text color={theme.muted}>No recent projects. Press Tab to browse.</Text>
                </Box>
              ) : (
                recentProjects.slice(0, listHeight).map((project, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <Box key={project.path}>
                      <Text
                        color={isSelected ? theme.accent : theme.foreground}
                        bold={isSelected}
                      >
                        {isSelected ? '> ' : '  '}
                        {project.name}
                      </Text>
                      <Text color={theme.muted} dimColor>
                        {' '}{shortenPath(project.path)}
                      </Text>
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column" flexGrow={1}>
            <Box marginBottom={1}>
              <Text color={theme.muted}>{shortenPath(browsePath)}/</Text>
            </Box>

            <Box flexDirection="column" height={listHeight} overflowY="hidden">
              {dirEntries.length === 0 ? (
                <Text color={theme.muted}>No subdirectories</Text>
              ) : (
                dirEntries.slice(0, listHeight).map((entry, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <Box key={entry.path}>
                      <Text
                        color={isSelected ? theme.accent : theme.foreground}
                        bold={isSelected}
                      >
                        {isSelected ? '> ' : '  '}
                        {entry.hasPrd ? '' : ''}
                        {entry.name}/
                      </Text>
                      {entry.hasPrd && <Text color={theme.success}> (prd.json)</Text>}
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>
        )}

        <Box borderStyle="single" borderColor={theme.border} paddingX={1} marginTop={1}>
          <Text color={theme.muted}>
            {mode === 'input'
              ? `Enter Open  Tab Recent${onCancel ? '  Esc Cancel' : ''}`
              : mode === 'recent'
              ? `Enter Select  j/k Navigate  c Clear  Tab Browse${onCancel ? '  Esc Back' : ''}`
              : `Enter Open  l/→ Enter dir  h/← Up  j/k Navigate  Tab Path${onCancel ? '  Esc Back' : ''}`}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
