import type { Theme } from './types.js';

/**
 * Nano Light theme - light alternative with adjusted colors
 */
export const nanoLight: Theme = {
  name: 'Nano Light',
  background: '#f5f5f5',
  foreground: '#2a2a2a',
  accent: '#00bfa5', // Darker mint for light background
  accentSecondary: '#d84315', // Darker orange for light background
  muted: '#999999',
  error: '#d32f2f',
  warning: '#f57c00',
  success: '#388e3c',
  border: '#cccccc',
  borderFocused: '#00bfa5', // Darker mint for focused borders
};
