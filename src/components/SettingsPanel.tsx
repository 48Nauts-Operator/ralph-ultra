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

  useInput(
    (input, key) => {
      if (input === 'q' || key.escape) {
        onClose();
      } else if (input === 's') {
        toggleSound();
      } else if (input === '0') {
        // 0 = theme 10
        const selectedTheme = themeNames[9];
        if (selectedTheme) setTheme(selectedTheme);
      } else if (input === '-') {
        // - = theme 11
        const selectedTheme = themeNames[10];
        if (selectedTheme) setTheme(selectedTheme);
      } else if (input === '=') {
        // = = theme 12
        const selectedTheme = themeNames[11];
        if (selectedTheme) setTheme(selectedTheme);
      } else {
        const num = parseInt(input, 10);
        if (num >= 1 && num <= 9 && num <= themeNames.length) {
          const selectedTheme = themeNames[num - 1];
          if (selectedTheme) setTheme(selectedTheme);
        }
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

        <Box flexDirection="row" marginBottom={1}>
          <Box flexDirection="column" width="50%">
            <Text color={theme.foreground} bold>Themes (1-9, 0, -, =):</Text>
            <Box flexDirection="column" marginTop={1}>
              {themeNames.slice(0, 6).map((name, index) => {
                const isSelected = name === themeName;
                const displayTheme = themes[name];
                return (
                  <Box key={name}>
                    <Text color={theme.accent} bold>{index + 1}</Text>
                    <Text color={theme.muted}>. </Text>
                    <Text color={isSelected ? theme.accent : theme.foreground} bold={isSelected}>
                      {displayTheme.name}
                    </Text>
                    {isSelected && <Text color={theme.success}> ✓</Text>}
                  </Box>
                );
              })}
            </Box>
          </Box>
          <Box flexDirection="column" width="50%">
            <Text> </Text>
            <Box flexDirection="column" marginTop={1}>
              {themeNames.slice(6, 12).map((name, index) => {
                const isSelected = name === themeName;
                const displayTheme = themes[name];
                const keyNum = index + 7;
                const keyDisplay = keyNum <= 9 ? String(keyNum) : keyNum === 10 ? '0' : keyNum === 11 ? '-' : '=';
                return (
                  <Box key={name}>
                    <Text color={theme.accent} bold>{keyDisplay}</Text>
                    <Text color={theme.muted}>. </Text>
                    <Text color={isSelected ? theme.accent : theme.foreground} bold={isSelected}>
                      {displayTheme.name}
                    </Text>
                    {isSelected && <Text color={theme.success}> ✓</Text>}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>

        <Box flexDirection="row" marginTop={1}>
          <Box flexDirection="column" width="50%">
            <Text color={theme.foreground} bold>Sound:</Text>
            <Box marginTop={1}>
              <Text color={theme.accent} bold>s</Text>
              <Text color={theme.muted}>. </Text>
              <Text color={soundEnabled ? theme.success : theme.muted}>
                {soundEnabled ? '● ON' : '○ OFF'}
              </Text>
            </Box>
          </Box>
          <Box flexDirection="column" width="50%">
            <Text color={theme.foreground} bold>Preview:</Text>
            <Box marginTop={1} flexDirection="column">
              <Text color={theme.accent}>■ Accent </Text>
              <Text color={theme.accentSecondary}>■ Secondary </Text>
              <Text><Text color={theme.success}>■</Text> <Text color={theme.warning}>■</Text> <Text color={theme.error}>■</Text> Status</Text>
            </Box>
          </Box>
        </Box>

        <Box flexGrow={1} />
        <Box paddingX={1}>
          <Text color={theme.muted}>Press </Text>
          <Text color={theme.accent}>1-9, 0, -, =</Text>
          <Text color={theme.muted}> for theme, </Text>
          <Text color={theme.accent}>s</Text>
          <Text color={theme.muted}> for sound, </Text>
          <Text color={theme.accent}>q/ESC</Text>
          <Text color={theme.muted}> to close</Text>
        </Box>
      </Box>
    </Box>
  );
}
