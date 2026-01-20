#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { App } from '@components/App';
import { ThemeProvider } from '@hooks/useTheme';

// Render the app with ThemeProvider
render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
