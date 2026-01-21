import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '@hooks/useTheme';
import type { Project } from '../types';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname, resolve } from 'path';
import { homedir } from 'os';

export interface ProjectPickerProps {
  width: number;
  height: number;
  projects: Project[];
  openProjectIds: string[];
  onSelect: (project: Project) => void;
  onCancel: () => void;
}

type Mode = 'input' | 'browse';

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

export const ProjectPicker: React.FC<ProjectPickerProps> = ({
  width,
  height,
  openProjectIds,
  onSelect,
  onCancel,
}) => {
  const { theme } = useTheme();
  const [mode, setMode] = useState<Mode>('input');
  const [pathInput, setPathInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [browsePath, setBrowsePath] = useState(homedir());
  const [dirEntries, setDirEntries] = useState<DirEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (mode === 'browse') {
      setDirEntries(listDirectory(browsePath));
      setSelectedIndex(0);
    }
  }, [mode, browsePath]);

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

  const handleSelectBrowseEntry = () => {
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
      setBrowsePath(entry.path);
    }
  };

  const handleBrowseUp = () => {
    const parent = dirname(browsePath);
    if (parent !== browsePath) {
      setBrowsePath(parent);
    }
  };

  useInput(
    (input, key) => {
      if (key.escape) {
        if (mode === 'browse') {
          setMode('input');
        } else {
          onCancel();
        }
        return;
      }

      if (mode === 'input') {
        if (key.tab) {
          setMode('browse');
          setError(null);
        } else if (key.return) {
          handleSubmitPath();
        }
      } else if (mode === 'browse') {
        if (key.upArrow || input === 'k') {
          setSelectedIndex(prev => Math.max(0, prev - 1));
        } else if (key.downArrow || input === 'j') {
          setSelectedIndex(prev => Math.min(dirEntries.length - 1, prev + 1));
        } else if (key.return) {
          handleSelectBrowseEntry();
        } else if (key.backspace || key.delete || input === 'h') {
          handleBrowseUp();
        } else if (key.tab) {
          setMode('input');
        }
      }
    },
    { isActive: true },
  );

  const modalWidth = Math.min(70, Math.floor(width * 0.85));
  const modalHeight = Math.min(22, Math.floor(height * 0.7));
  const listHeight = modalHeight - 10;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      alignItems="center"
      justifyContent="center"
    >
      <Box position="absolute" width={width} height={height}>
        {Array.from({ length: height }).map((_, i) => (
          <Box key={i}>
            <Text dimColor>{' '.repeat(width)}</Text>
          </Box>
        ))}
      </Box>

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
          <Text color={mode === 'input' ? theme.accent : theme.muted} bold={mode === 'input'}>
            [Tab] Enter Path
          </Text>
          <Text color={theme.muted}> | </Text>
          <Text color={mode === 'browse' ? theme.accent : theme.muted} bold={mode === 'browse'}>
            [Tab] Browse
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
              <Text color={theme.muted}>
                Enter path to a project directory (with prd.json)
              </Text>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column" flexGrow={1}>
            <Box marginBottom={1}>
              <Text color={theme.muted}>📁 </Text>
              <Text color={theme.foreground}>{browsePath}</Text>
            </Box>

            <Box flexDirection="column" height={listHeight} overflowY="hidden">
              <Box marginBottom={1}>
                <Text
                  color={theme.muted}
                  dimColor
                >
                  {'  '}../ (parent directory)
                </Text>
              </Box>

              {dirEntries.length === 0 ? (
                <Text color={theme.muted}>No subdirectories</Text>
              ) : (
                dirEntries.slice(0, listHeight - 1).map((entry, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <Box key={entry.path}>
                      <Text color={isSelected ? theme.accent : theme.foreground} bold={isSelected}>
                        {isSelected ? '▶ ' : '  '}
                        {entry.hasPrd ? '📦 ' : '📁 '}
                        {entry.name}
                      </Text>
                      {entry.hasPrd && (
                        <Text color={theme.success}> (prd.json)</Text>
                      )}
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
              ? '⏎ Open  Tab Browse  Esc Cancel'
              : '⏎ Select  ←/h Up  ↑↓ Navigate  Tab Path  Esc Back'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
