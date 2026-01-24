import { useInput } from 'ink';
import { useRef, useCallback } from 'react';
import type { Key } from 'ink';

export interface KeyHandler {
  /** The key or input to handle */
  key: string | ((input: string, key: Key) => boolean);
  /** Handler function to call when key is pressed */
  handler: (input: string, key: Key) => void;
  /** Priority level (higher = executed first) */
  priority?: number;
  /** Whether this handler should be debounced */
  debounce?: number;
  /** Whether handler is active (default: true) */
  isActive?: boolean;
}

export interface UseKeyboardOptions {
  /** Whether keyboard handling is enabled (default: true) */
  enabled?: boolean;
  /** Global debounce time in milliseconds (default: 0) */
  globalDebounce?: number;
}

/**
 * Centralized keyboard navigation system
 *
 * Features:
 * - Priority-based handler execution
 * - Key debouncing to prevent rapid repeats
 * - Handler enable/disable for overlays
 * - Supports both string keys and custom matchers
 *
 * Priority levels:
 * - 100: Critical (overlays, modals)
 * - 50: Global shortcuts ('[', 'r', 's', '?', 'q', 't')
 * - 10: Pane-specific navigation
 * - 0: Default
 *
 * @example
 * ```tsx
 * const { registerHandler, unregisterHandler } = useKeyboard({
 *   globalDebounce: 50
 * });
 *
 * useEffect(() => {
 *   const handler: KeyHandler = {
 *     key: '?',
 *     handler: () => setShowHelp(true),
 *     priority: 50
 *   };
 *   registerHandler(handler);
 *   return () => unregisterHandler(handler);
 * }, []);
 * ```
 */
export const useKeyboard = (options: UseKeyboardOptions = {}) => {
  const { enabled = true, globalDebounce = 0 } = options;
  const handlers = useRef<KeyHandler[]>([]);
  const lastKeyTime = useRef<Record<string, number>>({});

  /**
   * Register a keyboard handler
   */
  const registerHandler = useCallback((handler: KeyHandler) => {
    handlers.current.push(handler);
    // Sort by priority (highest first)
    handlers.current.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, []);

  /**
   * Unregister a keyboard handler
   */
  const unregisterHandler = useCallback((handler: KeyHandler) => {
    handlers.current = handlers.current.filter(h => h !== handler);
  }, []);

  /**
   * Clear all handlers (useful for cleanup)
   */
  const clearHandlers = useCallback(() => {
    handlers.current = [];
  }, []);

  /**
   * Check if a key should be debounced
   */
  const shouldDebounce = useCallback((keyId: string, debounceTime: number): boolean => {
    const now = Date.now();
    const lastTime = lastKeyTime.current[keyId] || 0;
    const timeSinceLastKey = now - lastTime;

    if (timeSinceLastKey < debounceTime) {
      return true; // Should debounce (too soon)
    }

    lastKeyTime.current[keyId] = now;
    return false; // Don't debounce (enough time has passed)
  }, []);

  /**
   * Main keyboard input handler
   */
  useInput(
    (input, key) => {
      if (!enabled) return;

      // Find matching handlers (sorted by priority)
      for (const handler of handlers.current) {
        // Skip inactive handlers
        if (handler.isActive === false) continue;

        // Check if handler matches the key
        let matches = false;
        if (typeof handler.key === 'string') {
          matches = input === handler.key;
        } else if (typeof handler.key === 'function') {
          matches = handler.key(input, key);
        }

        if (!matches) continue;

        // Check debouncing
        const debounceTime = handler.debounce || globalDebounce;
        if (debounceTime > 0) {
          const keyId =
            typeof handler.key === 'string' ? handler.key : `${input}-${JSON.stringify(key)}`;

          if (shouldDebounce(keyId, debounceTime)) {
            continue; // Skip this handler due to debouncing
          }
        }

        // Execute handler
        handler.handler(input, key);

        // Stop propagation if handler was executed
        // (handlers with higher priority prevent lower priority handlers)
        break;
      }
    },
    { isActive: enabled },
  );

  return {
    registerHandler,
    unregisterHandler,
    clearHandlers,
  };
};

/**
 * Common key matchers for convenience
 */
export const KeyMatchers = {
  /** Match Tab key */
  tab: (_input: string, key: Key) => key.tab === true,

  /** Match Escape key */
  escape: (_input: string, key: Key) => key.escape === true,

  /** Match Enter/Return key */
  enter: (_input: string, key: Key) => key.return === true,

  /** Match Return key (alias for enter) */
  return: (_input: string, key: Key) => key.return === true,

  /** Match Backspace/Delete key */
  backspace: (_input: string, key: Key) => key.backspace === true || key.delete === true,

  /** Match up arrow key */
  upArrow: (_input: string, key: Key) => key.upArrow === true,

  /** Match down arrow key */
  downArrow: (_input: string, key: Key) => key.downArrow === true,

  /** Match left arrow key */
  leftArrow: (_input: string, key: Key) => key.leftArrow === true,

  /** Match right arrow key */
  rightArrow: (_input: string, key: Key) => key.rightArrow === true,

  /** Match j or down arrow (vim-style) */
  downOrJ: (input: string, key: Key) => input === 'j' || key.downArrow === true,

  /** Match k or up arrow (vim-style) */
  upOrK: (input: string, key: Key) => input === 'k' || key.upArrow === true,

  /** Match h or left arrow (vim-style) */
  leftOrH: (input: string, key: Key) => input === 'h' || key.leftArrow === true,

  /** Match l or right arrow (vim-style) */
  rightOrL: (input: string, key: Key) => input === 'l' || key.rightArrow === true,

  /** Match any arrow key */
  anyArrow: (_input: string, key: Key) =>
    key.upArrow === true ||
    key.downArrow === true ||
    key.leftArrow === true ||
    key.rightArrow === true,
};

/**
 * Priority levels for keyboard handlers
 */
export const KeyPriority = {
  CRITICAL: 100, // Overlays, modals, critical UI
  GLOBAL: 50, // Global shortcuts that work anywhere
  PANE: 10, // Pane-specific navigation
  DEFAULT: 0, // Default priority
};
