#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { App } from '@components/App';
import { ThemeProvider } from '@hooks/useTheme';
import { FocusProvider } from '@hooks/useFocus';

// Render the app with ThemeProvider and FocusProvider
render(
  <ThemeProvider>
    <FocusProvider>
      <App />
    </FocusProvider>
  </ThemeProvider>,
);
