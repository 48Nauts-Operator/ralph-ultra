import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';

// Read version from package.json at module load time
let APP_VERSION = 'v3.0.0';
try {
  const pkg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'package.json'), 'utf-8'));
  APP_VERSION = `v${pkg.version}`;
} catch { /* fallback to hardcoded */ }

interface WelcomeOverlayProps {
  /** Whether the overlay is currently visible */
  visible: boolean;
  /** Callback when the overlay should be dismissed */
  onDismiss: () => void;
  /** Terminal dimensions for centering */
  width: number;
  height: number;
}

/**
 * Welcome/Help overlay component
 * Shows ASCII art banner and organized command list
 * Appears on first launch or when pressing '?'
 */
export const WelcomeOverlay: React.FC<WelcomeOverlayProps> = ({
  visible,
  onDismiss,
  width,
  height,
}) => {
  const { theme } = useTheme();

  // Handle any key press to dismiss
  useInput(
    (input, key) => {
      if (visible) {
        // Any key dismisses the overlay
        if (input || key.escape || key.return) {
          onDismiss();
        }
      }
    },
    { isActive: visible },
  );

  if (!visible) {
    return null;
  }

  const logoText = [
    '  ██████╗  █████╗ ██╗     ██████╗ ██╗  ██╗',
    '  ██╔══██╗██╔══██╗██║     ██╔══██╗██║  ██║',
    '  ██████╔╝███████║██║     ██████╔╝███████║',
    '  ██╔══██╗██╔══██║██║     ██╔═══╝ ██╔══██║',
    '  ██║  ██║██║  ██║███████╗██║     ██║  ██║',
    '  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝',
    '       ╚ U L T R A  3 . 0 ╝              ',
  ];

  const tagline = '~ The Autonomous Coding Cockpit ~';
  const version = APP_VERSION;

  // Command categories
  const commands = {
    Navigation: [
      { key: 'Tab', desc: 'Cycle focus between panes' },
      { key: '↑/↓ or j/k', desc: 'Navigate within active pane' },
      { key: 'Enter', desc: 'Select/activate item' },
    ],
    Actions: [
      { key: 'r', desc: 'Run Ralph on current project' },
      { key: 'R', desc: 'Retry current story' },
      { key: 's', desc: 'Stop running Ralph process' },
      { key: 'q', desc: 'Quit Ralph Ultra' },
    ],
    Views: [
      { key: '1', desc: 'Monitor (logs)' },
      { key: '2', desc: 'Status (system info)' },
      { key: '3', desc: 'Details (story info)' },
      { key: '4', desc: 'Quota (provider quotas)' },
      { key: '5', desc: 'Plan (execution plan)' },
      { key: '6', desc: 'Help (keyboard shortcuts)' },
      { key: '7', desc: 'Version (system info)' },
      { key: '8', desc: 'Costs (cost tracking)' },
    ],
    'Search (Monitor)': [
      { key: '/', desc: 'Start search' },
      { key: 'n / N', desc: 'Next / previous match' },
      { key: 'f', desc: 'Cycle log filter' },
    ],
    Tabs: [
      { key: 'Ctrl+Shift+T', desc: 'Open new tab' },
      { key: 'e', desc: 'Close current tab' },
    ],
    Interface: [
      { key: '[', desc: 'Toggle Projects Rail' },
      { key: '?', desc: 'Toggle this help screen' },
      { key: 't', desc: 'Theme settings' },
      { key: 'd', desc: 'Toggle debug mode' },
      { key: ': / Ctrl+P', desc: 'Command palette' },
      { key: 'Ctrl+L', desc: 'Clear session' },
      { key: 'c', desc: 'Copy remote URL (Tailscale)' },
    ],
  };

  // Calculate overlay dimensions and centering margins
  const overlayWidth = Math.min(65, Math.floor(width * 0.8));
  const leftMargin = Math.floor((width - overlayWidth) / 2);
  const overlayHeight = Math.min(height - 4, 58);
  const topMargin = Math.max(0, Math.floor((height - overlayHeight) / 2));

  // Center text with manual space padding — avoids Ink/Yoga flex centering bugs
  const contentWidth = overlayWidth - 6; // 2 border chars + 4 paddingX chars
  const centerLine = (text: string, len = text.length): string => {
    const pad = Math.max(0, Math.floor((contentWidth - len) / 2));
    return ' '.repeat(pad) + text;
  };

  // Create dimmed background
  const backgroundLines = Array.from({ length: height }, () => ' '.repeat(width));

  return (
    <Box position="absolute" flexDirection="column" width={width} height={height}>
      {/* Dimmed background */}
      <Box flexDirection="column" position="absolute">
        {backgroundLines.map((line, i) => (
          <Text key={i} dimColor>
            {line}
          </Text>
        ))}
      </Box>

      {/* Overlay content */}
      <Box
        position="absolute"
        flexDirection="column"
        width={overlayWidth}
        height={overlayHeight}
        borderStyle="double"
        borderColor={theme.accent}
        marginLeft={leftMargin}
        marginTop={topMargin}
        paddingX={2}
        paddingY={1}
      >
        {/* Logo Banner — centered via space padding (not flex) to avoid border artifacts */}
        <Box flexDirection="column" marginBottom={1}>
          {logoText.map((line, i) => (
            <Text key={`logo-${i}`} color={theme.accent} bold>
              {centerLine(line)}
            </Text>
          ))}
          <Text color={theme.accentSecondary} bold>
            {centerLine(tagline)}
          </Text>
          <Text dimColor>{centerLine(version)}</Text>
        </Box>

        {/* Commands organized by category */}
        <Box flexDirection="column" gap={1}>
          {Object.entries(commands).map(([category, cmds]) => (
            <Box key={category} flexDirection="column">
              <Text bold color={theme.accentSecondary}>
                {category}:
              </Text>
              {cmds.map((cmd, i) => (
                <Box key={i} marginLeft={2}>
                  <Text color={theme.accent} bold>
                    {cmd.key.padEnd(15)}
                  </Text>
                  <Text dimColor>{cmd.desc}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>

        {/* Dismiss instruction */}
        <Box marginTop={1} justifyContent="center">
          <Text dimColor italic>
            Press any key to continue
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
