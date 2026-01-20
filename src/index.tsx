#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { App } from '@components/App';
import { ThemeProvider } from '@hooks/useTheme';
import { FocusProvider } from '@hooks/useFocus';
import { NotificationProvider } from '@hooks/useNotifications';

// Render the app with all providers
render(
  <ThemeProvider>
    <FocusProvider>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </FocusProvider>
  </ThemeProvider>,
);
