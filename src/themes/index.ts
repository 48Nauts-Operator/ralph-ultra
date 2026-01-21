export { nanoDark } from './nano-dark.js';
export { nanoLight } from './nano-light.js';
export { dracula } from './dracula.js';
export { monokai } from './monokai.js';
export { nord } from './nord.js';
export { solarizedDark } from './solarized-dark.js';
export { gruvbox } from './gruvbox.js';
export { tokyoNight } from './tokyo-night.js';
export { catppuccin } from './catppuccin.js';
export { oneDark } from './one-dark.js';
export { cyberpunk } from './cyberpunk.js';
export { githubDark } from './github-dark.js';
export type { Theme, ThemeName } from './types.js';

import { nanoDark } from './nano-dark.js';
import { nanoLight } from './nano-light.js';
import { dracula } from './dracula.js';
import { monokai } from './monokai.js';
import { nord } from './nord.js';
import { solarizedDark } from './solarized-dark.js';
import { gruvbox } from './gruvbox.js';
import { tokyoNight } from './tokyo-night.js';
import { catppuccin } from './catppuccin.js';
import { oneDark } from './one-dark.js';
import { cyberpunk } from './cyberpunk.js';
import { githubDark } from './github-dark.js';
import type { Theme, ThemeName } from './types.js';

export const themes: Record<ThemeName, Theme> = {
  'nano-dark': nanoDark,
  'nano-light': nanoLight,
  'dracula': dracula,
  'monokai': monokai,
  'nord': nord,
  'solarized-dark': solarizedDark,
  'gruvbox': gruvbox,
  'tokyo-night': tokyoNight,
  'catppuccin': catppuccin,
  'one-dark': oneDark,
  'cyberpunk': cyberpunk,
  'github-dark': githubDark,
};

export function getTheme(name: ThemeName): Theme {
  return themes[name] || themes['nano-dark'];
}
