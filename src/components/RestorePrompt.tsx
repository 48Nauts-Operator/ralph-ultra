import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@hooks/useTheme';

interface RestorePromptProps {
  /** Terminal width for centering */
  width: number;
  /** Terminal height for centering */
  height: number;
  /** Whether this is a crash recovery prompt */
  isCrashRecovery: boolean;
}

/**
 * Prompt overlay asking user if they want to restore previous session
 */
export const RestorePrompt: React.FC<RestorePromptProps> = ({ width, height, isCrashRecovery }) => {
  const { theme } = useTheme();

  // Calculate prompt dimensions
  const promptWidth = 60;

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width={width}
      height={height}
      position="absolute"
    >
      {/* Centered prompt */}
      <Box
        width={promptWidth}
        flexDirection="column"
        borderStyle="double"
        borderColor={isCrashRecovery ? theme.warning : theme.accent}
        paddingX={2}
        paddingY={1}
      >
        {isCrashRecovery ? (
          <>
            <Text bold color={theme.warning}>
              ⚠ Crash Detected
            </Text>
            <Text color={theme.foreground}> </Text>
            <Text color={theme.foreground}>The previous session ended unexpectedly.</Text>
          </>
        ) : (
          <>
            <Text bold color={theme.accent}>
              Session Found
            </Text>
            <Text color={theme.foreground}> </Text>
            <Text color={theme.foreground}>A previous session was found for this project.</Text>
          </>
        )}
        <Text color={theme.foreground}> </Text>
        <Text color={theme.foreground}>
          Resume where you left off? <Text color={theme.accent}>[Y/n]</Text>
        </Text>
      </Box>
    </Box>
  );
};
