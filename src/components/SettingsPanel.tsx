import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme.js';
import { useNotifications } from '@hooks/useNotifications.js';
import type { ThemeName } from '@themes/types.js';
import { themes } from '@themes/index.js';

interface SettingsPanelProps {
  width: number;
  height: number;
  onClose: () => void;
}

/**
 * SettingsPanel component - modal overlay for app settings
 */
export function SettingsPanel({ width, height, onClose }: SettingsPanelProps) {
  const { theme, themeName, setTheme } = useTheme();
  const { soundEnabled, toggleSound } = useNotifications();
  const themeNames = Object.keys(themes) as ThemeName[];

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (input === 'q' || key.escape) {
        onClose();
      } else if (input === '1') {
        setTheme('nano-dark');
      } else if (input === '2') {
        setTheme('nano-light');
      } else if (input === 's') {
        toggleSound();
      }
    },
    { isActive: true },
  );

  // Calculate overlay dimensions (60% of screen)
  const overlayWidth = Math.floor(width * 0.6);
  const overlayHeight = Math.floor(height * 0.6);
  const leftMargin = Math.floor((width - overlayWidth) / 2);
  const topMargin = Math.floor((height - overlayHeight) / 2);

  // Create dimmed background
  const backgroundLines = Array.from({ length: height }, () => ' '.repeat(width));

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Dimmed background */}
      <Box flexDirection="column" position="absolute">
        {backgroundLines.map((line, i) => (
          <Text key={i} dimColor>
            {line}
          </Text>
        ))}
      </Box>

      {/* Settings panel */}
      <Box
        position="absolute"
        flexDirection="column"
        borderStyle="double"
        borderColor={theme.accent}
        width={overlayWidth}
        height={overlayHeight}
        marginLeft={leftMargin}
        marginTop={topMargin}
        paddingX={2}
        paddingY={1}
      >
        {/* Header */}
        <Box marginBottom={1}>
          <Text bold color={theme.accent}>
            ⚙ Settings
          </Text>
        </Box>

        {/* Theme section */}
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.foreground}>Theme:</Text>
          <Box flexDirection="column" marginTop={1} marginLeft={2}>
            {themeNames.map((name, index) => {
              const isSelected = name === themeName;
              const displayTheme = themes[name];
              return (
                <Box key={name} marginBottom={index < themeNames.length - 1 ? 1 : 0}>
                  <Text color={isSelected ? theme.accent : theme.muted}>
                    {isSelected ? '● ' : '○ '}
                    {index + 1}. {displayTheme.name}
                  </Text>
                  {isSelected && <Text color={theme.success}> (active)</Text>}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Notification sound section */}
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.foreground}>Notifications:</Text>
          <Box marginTop={1} marginLeft={2}>
            <Text color={soundEnabled ? theme.accent : theme.muted}>
              {soundEnabled ? '● ' : '○ '}
              Sound {soundEnabled ? 'ON' : 'OFF'}
            </Text>
            <Text color={theme.muted}> (press </Text>
            <Text color={theme.accent}>s</Text>
            <Text color={theme.muted}> to toggle)</Text>
          </Box>
        </Box>

        {/* Preview section */}
        <Box flexDirection="column" marginTop={1} marginBottom={1}>
          <Text color={theme.foreground}>Preview:</Text>
          <Box marginTop={1} marginLeft={2} flexDirection="column">
            <Text color={theme.accent}>Primary Accent (Mint)</Text>
            <Text color={theme.accentSecondary}>Secondary Accent (Dirty Orange)</Text>
            <Text color={theme.success}>Success</Text>
            <Text color={theme.warning}>Warning</Text>
            <Text color={theme.error}>Error</Text>
            <Text color={theme.muted}>Muted Text</Text>
          </Box>
        </Box>

        {/* Footer instructions */}
        <Box flexGrow={1} />
        <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
          <Text color={theme.muted}>Press </Text>
          <Text color={theme.accent}>1-2</Text>
          <Text color={theme.muted}> to select theme, </Text>
          <Text color={theme.accent}>q</Text>
          <Text color={theme.muted}> or </Text>
          <Text color={theme.accent}>ESC</Text>
          <Text color={theme.muted}> to close</Text>
        </Box>
      </Box>
    </Box>
  );
}
