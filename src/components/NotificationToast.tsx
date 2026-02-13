/**
 * NotificationToast component - displays notifications in the top-right corner
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../hooks/useTheme.js';
import type { Notification } from '../types/index.js';

interface NotificationToastProps {
  /** List of active notifications to display */
  notifications: Notification[];
  /** Terminal width for positioning */
  terminalWidth: number;
}

/**
 * Get the color for a notification type
 */
function getNotificationColor(
  type: Notification['type'],
  themeColors: ReturnType<typeof useTheme>['theme'],
): string {
  switch (type) {
    case 'info':
      return '#3B82F6'; // Blue
    case 'success':
      return themeColors.success;
    case 'warning':
      return themeColors.warning;
    case 'error':
      return themeColors.error;
  }
}

/**
 * Get the icon for a notification type
 */
function getNotificationIcon(type: Notification['type']): string {
  switch (type) {
    case 'info':
      return 'ℹ';
    case 'success':
      return '✓';
    case 'warning':
      return '⚠';
    case 'error':
      return '✗';
  }
}

/**
 * NotificationToast component
 *
 * Displays a stack of toast notifications in the top-right corner.
 * Maximum 3 visible at a time, auto-dismisses after duration.
 */
export function NotificationToast({ notifications, terminalWidth }: NotificationToastProps) {
  const { theme } = useTheme();

  // Show maximum 3 notifications at once
  const visibleNotifications = notifications.slice(0, 3);

  if (visibleNotifications.length === 0) {
    return null;
  }

  // Calculate toast width (40% of terminal or max 70 chars)
  const toastWidth = Math.min(70, Math.floor(terminalWidth * 0.4));
  // Position from right edge (leave 1 char margin)
  const rightMargin = 1;
  const leftPosition = terminalWidth - toastWidth - rightMargin;

  return (
    <Box
      position="absolute"
      marginLeft={leftPosition}
      marginTop={2} // Below status bar
      width={toastWidth}
      flexDirection="column"
      gap={1}
    >
      {visibleNotifications.map(notification => {
        const color = getNotificationColor(notification.type, theme);
        const icon = getNotificationIcon(notification.type);

        // Truncate message to fit in toast
        const maxMessageLength = toastWidth - 6; // Account for padding and icon
        const displayMessage =
          notification.message.length > maxMessageLength
            ? notification.message.substring(0, maxMessageLength - 3) + '...'
            : notification.message;

        return (
          <Box
            key={notification.id}
            borderStyle="round"
            borderColor={color}
            paddingX={1}
            flexDirection="column"
          >
            <Box>
              <Text color={color} bold>
                {icon}
              </Text>
              <Text color={color}> {displayMessage}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
