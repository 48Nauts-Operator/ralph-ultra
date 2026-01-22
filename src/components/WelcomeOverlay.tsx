import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';

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
    '       ╚ U L T R A  2 . 0 ╝              ',
  ];

  const tagline = '⚡ The Autonomous Coding Cockpit ⚡';
  const version = 'v2.0.0';

  // Command categories
  const commands = {
    Navigation: [
      { key: 'Tab', desc: 'Cycle focus between panes' },
      { key: '↑/↓ or j/k', desc: 'Navigate within active pane' },
      { key: 'Enter', desc: 'Select/activate item' },
    ],
    Actions: [
      { key: 'r', desc: 'Run Ralph on current project' },
      { key: 's', desc: 'Stop running Ralph process' },
      { key: 'q', desc: 'Quit Ralph Ultra' },
    ],
    Views: [
      { key: '1', desc: 'Show Monitor (logs)' },
      { key: '2', desc: 'Show Status (system info)' },
      { key: '3', desc: 'Show Details (story info)' },
      { key: '4', desc: 'Show Help (commands)' },
    ],
    Interface: [
      { key: '[', desc: 'Toggle Projects Rail' },
      { key: '?', desc: 'Toggle this help screen' },
      { key: 't', desc: 'Open theme settings (coming)' },
    ],
    Remote: [{ key: 'c', desc: 'Copy remote URL (with Tailscale)' }],
  };

  // Calculate overlay dimensions (centered, 80% of screen)
  const overlayWidth = Math.min(65, Math.floor(width * 0.8));

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width={width}
      height={height}
      position="absolute"
    >
      {/* Dimmed background effect */}
      <Box width={width} height={height} position="absolute" flexDirection="column">
        {Array.from({ length: height }).map((_, i) => (
          <Text key={i} dimColor>
            {' '.repeat(width)}
          </Text>
        ))}
      </Box>

      {/* Overlay content */}
      <Box
        flexDirection="column"
        width={overlayWidth}
        borderStyle="double"
        borderColor={theme.accent}
        paddingX={2}
        paddingY={1}
      >
        {/* Logo Banner */}
        <Box flexDirection="column" alignItems="center" marginBottom={1}>
          {logoText.map((line, i) => (
            <Text key={`logo-${i}`} color={theme.accent} bold>
              {line}
            </Text>
          ))}
          <Text color={theme.accentSecondary} bold>
            {tagline}
          </Text>
          <Text dimColor>{version}</Text>
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
