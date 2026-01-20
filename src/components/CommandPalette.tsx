import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';

interface Command {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  /** Whether the palette is currently visible */
  visible: boolean;
  /** Callback when the palette should be closed */
  onClose: () => void;
  /** Terminal dimensions */
  width: number;
  height: number;
  /** Available commands */
  commands: Command[];
  /** Recent commands (shown when input is empty) */
  recentCommands?: string[];
  /** Callback to track command usage */
  onCommandExecuted?: (commandId: string) => void;
}

/**
 * CommandPalette component - VS Code-style command palette
 * Fuzzy search all available commands, accessible via Ctrl+P or ':'
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  visible,
  onClose,
  width,
  height,
  commands,
  recentCommands = [],
  onCommandExecuted,
}) => {
  const { theme } = useTheme();
  const [searchInput, setSearchInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Simple fuzzy search function
  const fuzzyMatch = (text: string, search: string): boolean => {
    const searchLower = search.toLowerCase();
    const textLower = text.toLowerCase();

    // If search is empty, match everything
    if (searchLower === '') return true;

    // Simple substring match for now
    if (textLower.includes(searchLower)) return true;

    // Fuzzy match: all search chars appear in order
    let searchIndex = 0;
    for (let i = 0; i < textLower.length && searchIndex < searchLower.length; i++) {
      if (textLower[i] === searchLower[searchIndex]) {
        searchIndex++;
      }
    }
    return searchIndex === searchLower.length;
  };

  // Filter and sort commands based on search input
  const filteredCommands = useMemo(() => {
    if (searchInput === '') {
      // Show recent commands first when input is empty
      const recentCmds = commands.filter(cmd => recentCommands.includes(cmd.id));
      const otherCmds = commands.filter(cmd => !recentCommands.includes(cmd.id));
      return [...recentCmds, ...otherCmds];
    }

    // Filter by fuzzy match on label or description
    return commands.filter(
      cmd => fuzzyMatch(cmd.label, searchInput) || fuzzyMatch(cmd.description, searchInput),
    );
  }, [commands, searchInput, recentCommands]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach(cmd => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category]!.push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Flatten grouped commands for selection
  const flatCommands = useMemo(() => {
    const flat: Array<{ type: 'header' | 'command'; data: string | Command }> = [];
    Object.entries(groupedCommands).forEach(([category, cmds]) => {
      flat.push({ type: 'header', data: category });
      cmds.forEach(cmd => flat.push({ type: 'command', data: cmd }));
    });
    return flat;
  }, [groupedCommands]);

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!visible) return;

      if (key.escape) {
        // Close palette
        onClose();
        setSearchInput('');
        setSelectedIndex(0);
      } else if (key.return) {
        // Execute selected command
        const selected = flatCommands[selectedIndex];
        if (selected?.type === 'command') {
          const cmd = selected.data as Command;
          cmd.action();
          onCommandExecuted?.(cmd.id);
          onClose();
          setSearchInput('');
          setSelectedIndex(0);
        }
      } else if (key.upArrow) {
        // Move selection up, skip headers
        let newIndex = selectedIndex - 1;
        while (newIndex >= 0 && flatCommands[newIndex]?.type === 'header') {
          newIndex--;
        }
        setSelectedIndex(Math.max(0, newIndex));
      } else if (key.downArrow) {
        // Move selection down, skip headers
        let newIndex = selectedIndex + 1;
        while (newIndex < flatCommands.length && flatCommands[newIndex]?.type === 'header') {
          newIndex++;
        }
        setSelectedIndex(Math.min(flatCommands.length - 1, newIndex));
      } else if (key.backspace || key.delete) {
        // Delete last character
        setSearchInput(prev => prev.slice(0, -1));
        setSelectedIndex(0);
      } else if (input && !key.ctrl && !key.meta) {
        // Add character to search
        setSearchInput(prev => prev + input);
        setSelectedIndex(0);
      }
    },
    { isActive: visible },
  );

  if (!visible) {
    return null;
  }

  // Calculate overlay dimensions (60% of screen, centered)
  const overlayWidth = Math.floor(width * 0.6);
  const overlayHeight = Math.floor(height * 0.7);
  const leftMargin = Math.floor((width - overlayWidth) / 2);
  const topMargin = Math.floor((height - overlayHeight) / 2);

  // Visible range for scrolling
  const maxVisibleCommands = overlayHeight - 5; // Account for header and borders
  const scrollOffset = Math.max(0, selectedIndex - Math.floor(maxVisibleCommands / 2));
  const visibleCommands = flatCommands.slice(scrollOffset, scrollOffset + maxVisibleCommands);

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Dimmed background */}
      <Box flexDirection="column" position="absolute">
        {Array.from({ length: height }, () => ' '.repeat(width)).map((line, i) => (
          <Text key={i} dimColor>
            {line}
          </Text>
        ))}
      </Box>

      {/* Command palette */}
      <Box
        position="absolute"
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.accent}
        width={overlayWidth}
        height={overlayHeight}
        marginLeft={leftMargin}
        marginTop={topMargin}
      >
        {/* Header with search input */}
        <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
          <Text color={theme.accent}>› </Text>
          <Text color={theme.foreground}>{searchInput}</Text>
          <Text color={theme.muted}>▌</Text>
        </Box>

        {/* Command list */}
        <Box flexDirection="column" paddingX={1} paddingY={1} flexGrow={1}>
          {visibleCommands.length === 0 && (
            <Text color={theme.muted} italic>
              No commands found
            </Text>
          )}

          {visibleCommands.map((item, index) => {
            const actualIndex = scrollOffset + index;

            if (item.type === 'header') {
              return (
                <Box key={`header-${item.data}`} marginTop={index > 0 ? 1 : 0}>
                  <Text bold color={theme.accentSecondary}>
                    {item.data as string}
                  </Text>
                </Box>
              );
            }

            const cmd = item.data as Command;
            const isSelected = actualIndex === selectedIndex;

            return (
              <Box key={cmd.id} marginLeft={2}>
                <Text
                  color={isSelected ? theme.accent : theme.foreground}
                  bold={isSelected}
                  inverse={isSelected}
                >
                  {isSelected ? '▶ ' : '  '}
                  {cmd.label}
                </Text>
                <Text color={theme.muted}> {cmd.description}</Text>
                {cmd.shortcut && (
                  <Text color={theme.muted} italic>
                    {' '}
                    [{cmd.shortcut}]
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Footer with instructions */}
        <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
          <Text color={theme.muted}>
            {searchInput === '' && recentCommands.length > 0 && 'Recent commands shown first • '}
            ↑↓ navigate • Enter execute • ESC close
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
