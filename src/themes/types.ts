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
  border: string;
  borderFocused: string;
}

/**
 * Available theme names
 */
export type ThemeName = 'nano-dark' | 'nano-light';
