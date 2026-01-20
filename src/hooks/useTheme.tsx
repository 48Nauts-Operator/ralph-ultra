import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Theme, ThemeName } from '@themes/types.js';
import { getTheme } from '@themes/index.js';
import { loadSettings, saveSettings } from '@utils/config.js';

interface ThemeContextValue {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * ThemeProvider component wraps the app and provides theme context
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeName, setThemeName] = useState<ThemeName>('nano-dark');

  // Load saved theme on mount
  useEffect(() => {
    const settings = loadSettings();
    if (settings.theme) {
      setThemeName(settings.theme as ThemeName);
    }
  }, []);

  // Save theme when it changes
  const handleSetTheme = (name: ThemeName) => {
    setThemeName(name);
    const settings = loadSettings();
    saveSettings({ ...settings, theme: name });
  };

  const theme = getTheme(themeName);

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme: handleSetTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * useTheme hook to access current theme in components
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
