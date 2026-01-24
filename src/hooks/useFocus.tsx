import React, { createContext, useContext, useState, useCallback } from 'react';
import type { FocusPane } from '@types';

interface FocusContextValue {
  /** Currently focused pane */
  focusPane: FocusPane;
  /** Set the focused pane */
  setFocusPane: (pane: FocusPane) => void;
  /** Cycle focus to the next pane */
  cycleFocus: () => void;
  /** Check if a specific pane is focused */
  isFocused: (pane: FocusPane) => boolean;
}

const FocusContext = createContext<FocusContextValue | undefined>(undefined);

/**
 * Focus Provider - Manages focus state across all panes
 *
 * Provides centralized focus tracking for the three-pane layout:
 * - Projects rail (left)
 * - Sessions pane (middle)
 * - Work pane (right)
 *
 * Focus can be cycled with Tab key or set directly.
 */
export const FocusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [focusPane, setFocusPane] = useState<FocusPane>('sessions');

  const cycleFocus = useCallback(() => {
    setFocusPane(prev => {
      if (prev === 'projects') return 'sessions';
      if (prev === 'sessions') return 'work';
      if (prev === 'work') return 'tabs';
      return 'projects';
    });
  }, []);

  /**
   * Check if a specific pane is focused
   */
  const isFocused = useCallback((pane: FocusPane) => focusPane === pane, [focusPane]);

  const value: FocusContextValue = {
    focusPane,
    setFocusPane,
    cycleFocus,
    isFocused,
  };

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
};

/**
 * Hook to access focus state and actions
 *
 * @example
 * ```tsx
 * const { focusPane, setFocusPane, cycleFocus, isFocused } = useFocus();
 *
 * // Check if current pane is focused
 * const focused = isFocused('sessions');
 *
 * // Set focus explicitly
 * setFocusPane('work');
 *
 * // Cycle to next pane
 * cycleFocus();
 * ```
 */
export const useFocus = (): FocusContextValue => {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocus must be used within FocusProvider');
  }
  return context;
};
