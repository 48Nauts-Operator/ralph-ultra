#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import * as tty from 'tty';
import * as fs from 'fs';
import { resolve } from 'path';
import { App } from '@components/App';
import { ThemeProvider } from '@hooks/useTheme';
import { FocusProvider } from '@hooks/useFocus';
import { NotificationProvider } from '@hooks/useNotifications';

chalk.level = 3;

// Parse CLI arguments
function parseArgs(): { projectPath?: string } {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--project' || args[i] === '-p') && args[i + 1]) {
      const raw = args[i + 1]!;
      const resolved = resolve(raw.startsWith('~') ? raw.replace('~', process.env['HOME'] || '') : raw);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        console.error(`Error: "${resolved}" is not a valid directory`);
        process.exit(1);
      }
      return { projectPath: resolved };
    }
  }
  return {};
}

const { projectPath } = parseArgs();

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
        <App initialProjectPath={projectPath} />
      </NotificationProvider>
    </FocusProvider>
  </ThemeProvider>,
  { stdin: stdinStream },
);
