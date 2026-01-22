#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import * as tty from 'tty';
import * as fs from 'fs';
import { App } from '@components/App';
import { ThemeProvider } from '@hooks/useTheme';
import { FocusProvider } from '@hooks/useFocus';
import { NotificationProvider } from '@hooks/useNotifications';

chalk.level = 3;

// On Linux with Bun, stdin can fail with EPERM. Open /dev/tty as TTY instead.
let stdinStream: tty.ReadStream = process.stdin;
if (process.platform === 'linux') {
  try {
    const fd = fs.openSync('/dev/tty', 'r');
    stdinStream = new tty.ReadStream(fd);
  } catch {
    stdinStream = process.stdin;
  }
}

render(
  <ThemeProvider>
    <FocusProvider>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </FocusProvider>
  </ThemeProvider>,
  { stdin: stdinStream },
);
