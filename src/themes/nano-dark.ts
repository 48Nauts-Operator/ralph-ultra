import type { Theme } from './types.js';

/**
 * Nano Dark theme - default theme with mint and dirty orange accents
 */
export const nanoDark: Theme = {
  name: 'Nano Dark',
  background: '#1a1a1a',
  foreground: '#e0e0e0',
  accent: '#7FFFD4', // Mint
  accentSecondary: '#CC5500', // Dirty orange
  muted: '#666666',
  error: '#ff5555',
  warning: '#ffaa00',
  success: '#50fa7b',
  info: '#bb9af7',
  border: '#444444',
  borderFocused: '#7FFFD4', // Mint for focused borders
};
