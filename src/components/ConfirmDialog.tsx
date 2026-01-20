import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';

export interface ConfirmDialogProps {
  /** Terminal dimensions */
  width: number;
  height: number;
  /** Dialog title */
  title: string;
  /** Dialog message */
  message: string;
  /** Callback when confirmed (Y) */
  onConfirm: () => void;
  /** Callback when cancelled (N/Esc) */
  onCancel: () => void;
}

/**
 * ConfirmDialog component - modal overlay for yes/no confirmations
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  width,
  height,
  title,
  message,
  onConfirm,
  onCancel,
}) => {
  const { theme } = useTheme();

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (input === 'y' || input === 'Y' || key.return) {
        onConfirm();
      } else if (input === 'n' || input === 'N' || key.escape) {
        onCancel();
      }
    },
    { isActive: true },
  );

  const modalWidth = Math.min(50, Math.floor(width * 0.6));
  const modalHeight = 8;

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
        borderColor={theme.warning}
        paddingX={2}
        paddingY={1}
      >
        {/* Title */}
        <Box marginBottom={1}>
          <Text bold color={theme.warning}>
            {title}
          </Text>
        </Box>

        {/* Message */}
        <Box marginBottom={1} flexGrow={1}>
          <Text color={theme.foreground}>{message}</Text>
        </Box>

        {/* Footer */}
        <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
          <Text color={theme.muted}>Y/Enter Confirm  N/Esc Cancel</Text>
        </Box>
      </Box>
    </Box>
  );
};
