#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import { App } from '@components/App';
import { ThemeProvider } from '@hooks/useTheme';
import { FocusProvider } from '@hooks/useFocus';
import { NotificationProvider } from '@hooks/useNotifications';

// Force chalk to use true colors (level 3 = 16 million colors)
chalk.level = 3;

render(
  <ThemeProvider>
    <FocusProvider>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </FocusProvider>
  </ThemeProvider>,
);
