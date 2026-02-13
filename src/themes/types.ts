/**
 * Theme color palette definition
 */
export interface Theme {
  name: string;
  background: string;
  foreground: string;
  accent: string;
  accentSecondary: string;
  muted: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  border: string;
  borderFocused: string;
}

export type ThemeName =
  | 'nano-dark'
  | 'nano-light'
  | 'dracula'
  | 'monokai'
  | 'nord'
  | 'solarized-dark'
  | 'gruvbox'
  | 'tokyo-night'
  | 'catppuccin'
  | 'one-dark'
  | 'cyberpunk'
  | 'github-dark';
