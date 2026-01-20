/**
 * Theme definitions and utilities
 */
export { nanoDark } from './nano-dark.js';
export { nanoLight } from './nano-light.js';
export type { Theme, ThemeName } from './types.js';

import { nanoDark } from './nano-dark.js';
import { nanoLight } from './nano-light.js';
import type { Theme, ThemeName } from './types.js';

/**
 * Map of all available themes
 */
export const themes: Record<ThemeName, Theme> = {
  'nano-dark': nanoDark,
  'nano-light': nanoLight,
};

/**
 * Get a theme by name, with fallback to default
 */
export function getTheme(name: ThemeName): Theme {
  return themes[name] || themes['nano-dark'];
}
