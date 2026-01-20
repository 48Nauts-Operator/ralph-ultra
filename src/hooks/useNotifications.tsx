/**
 * Notification management hook and context
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Notification, NotificationType } from '../types/index.js';
import { loadSettings, saveSettings } from '../utils/config.js';

interface NotificationContextType {
  /** List of active notifications */
  notifications: Notification[];
  /** Full history of all notifications */
  history: Notification[];
  /** Add a new notification */
  notify: (type: NotificationType, message: string, duration?: number) => void;
  /** Clear a specific notification */
  clearNotification: (id: string) => void;
  /** Clear all active notifications */
  clearAll: () => void;
  /** Whether notification sounds are enabled */
  soundEnabled: boolean;
  /** Toggle notification sounds */
  toggleSound: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: React.ReactNode;
}

/**
 * NotificationProvider - manages notification state and auto-dismiss
 */
export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [history, setHistory] = useState<Notification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Load sound preference from settings
  useEffect(() => {
    const settings = loadSettings();
    setSoundEnabled(settings.notificationSound ?? true);
  }, []);

  // Toggle notification sound
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const newValue = !prev;
      const settings = loadSettings();
      saveSettings({ ...settings, notificationSound: newValue });
      return newValue;
    });
  }, []);

  // Play notification sound (terminal bell)
  const playSound = useCallback(() => {
    if (soundEnabled) {
      process.stdout.write('\x07'); // Terminal bell character
    }
  }, [soundEnabled]);

  // Clear a specific notification
  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));

    // Clear timeout if exists
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  // Add a new notification
  const notify = useCallback((type: NotificationType, message: string, duration = 5000) => {
    const notification: Notification = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      message,
      timestamp: new Date(),
      duration,
    };

    // Add to active notifications
    setNotifications((prev) => [notification, ...prev]);

    // Add to history
    setHistory((prev) => [notification, ...prev]);

    // Play sound
    playSound();

    // Set auto-dismiss timeout
    const timeout = setTimeout(() => {
      clearNotification(notification.id);
    }, duration);

    timeoutsRef.current.set(notification.id, timeout);
  }, [clearNotification, playSound]);

  // Clear all active notifications
  const clearAll = useCallback(() => {
    // Clear all timeouts
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    timeoutsRef.current.clear();

    // Clear notifications
    setNotifications([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      // Clear all timeouts
      timeouts.forEach((timeout) => clearTimeout(timeout));
      timeouts.clear();
    };
  }, []);

  const value: NotificationContextType = {
    notifications,
    history,
    notify,
    clearNotification,
    clearAll,
    soundEnabled,
    toggleSound,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access notification context
 */
export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
