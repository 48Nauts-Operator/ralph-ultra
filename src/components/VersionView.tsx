import React, { memo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

interface VersionViewProps {
  height: number;
  isFocused?: boolean;
}

interface PackageInfo {
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface ChangelogSection {
  title: string;
  items: string[];
}

interface ChangelogEntry {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

const getPackageInfo = (): PackageInfo | null => {
  try {
    const possiblePaths = [
      join(process.cwd(), 'package.json'),
      join(dirname(fileURLToPath(import.meta.url)), '../../package.json'),
      join(dirname(fileURLToPath(import.meta.url)), '../../../package.json'),
    ];

    for (const pkgPath of possiblePaths) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) {
          return {
            version: pkg.version,
            dependencies: pkg.dependencies || {},
            devDependencies: pkg.devDependencies || {},
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
};

const getSystemInfo = (): Record<string, string> => {
  const info: Record<string, string> = {};

  try {
    info['Node.js'] = process.version;
  } catch {
    info['Node.js'] = 'unknown';
  }

  try {
    info['Bun'] = execSync('bun --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    info['Bun'] = 'not installed';
  }

  try {
    info['Platform'] = `${process.platform} ${process.arch}`;
  } catch {
    info['Platform'] = 'unknown';
  }

  return info;
};

const getCLIVersions = (): Record<string, string> => {
  const clis: Record<string, string> = {};

  const commands: Record<string, string> = {
    'Claude CLI': 'claude --version',
    OpenCode: 'opencode --version',
    Aider: 'aider --version',
    Git: 'git --version',
  };

  for (const [name, cmd] of Object.entries(commands)) {
    try {
      const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const firstLine = output.split('\n')[0];
      clis[name] = firstLine ?? 'unknown';
    } catch {
      clis[name] = 'not installed';
    }
  }

  return clis;
};

const parseChangelog = (): ChangelogEntry[] => {
  const entries: ChangelogEntry[] = [];

  try {
    const possiblePaths = [
      join(process.cwd(), 'CHANGELOG.md'),
      join(dirname(fileURLToPath(import.meta.url)), '../../CHANGELOG.md'),
      join(dirname(fileURLToPath(import.meta.url)), '../../../CHANGELOG.md'),
    ];

    let content = '';
    for (const path of possiblePaths) {
      try {
        content = readFileSync(path, 'utf-8');
        if (content) break;
      } catch {
        continue;
      }
    }

    if (!content) return entries;

    const parts = content.split(/^## \[/m).slice(1);

    for (const part of parts) {
      const headerMatch = part.match(/^(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})/);
      if (!headerMatch) continue;

      const version = headerMatch[1] ?? '';
      const date = headerMatch[2] ?? '';

      const sections: ChangelogSection[] = [];
      let currentSection: ChangelogSection | null = null;

      const lines = part.split('\n');
      for (const line of lines) {
        const sectionMatch = line.match(/^### (.+)/);
        if (sectionMatch) {
          if (currentSection) sections.push(currentSection);
          currentSection = { title: sectionMatch[1] ?? '', items: [] };
        } else if (line.startsWith('- ') && currentSection) {
          const item = line.replace(/^- /, '').replace(/\*\*/g, '').trim();
          if (item) currentSection.items.push(item);
        }
      }
      if (currentSection) sections.push(currentSection);

      if (version && date) {
        entries.push({ version, date, sections });
      }
    }
  } catch {
    return entries;
  }

  return entries;
};

export const VersionView: React.FC<VersionViewProps> = memo(({ height, isFocused = false }) => {
  const { theme } = useTheme();
  const pkgInfo = getPackageInfo();
  const systemInfo = getSystemInfo();
  const cliVersions = getCLIVersions();
  const changelog = parseChangelog();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detailScrollOffset, setDetailScrollOffset] = useState(0);

  const keyDeps: Array<{ name: string; version: string }> = ['ink', 'react', 'ws'].map(dep => ({
    name: dep,
    version: pkgInfo?.dependencies[dep] || pkgInfo?.devDependencies[dep] || 'unknown',
  }));

  const infoHeight = 10;
  const changelogHeight = Math.max(5, height - infoHeight - 2);
  const selectedEntry = changelog[selectedIndex];

  const detailLines: string[] = [];
  if (selectedEntry) {
    for (const section of selectedEntry.sections) {
      detailLines.push(`[${section.title}]`);
      for (const item of section.items) {
        detailLines.push(`  ${item}`);
      }
      detailLines.push('');
    }
  }

  const maxDetailScroll = Math.max(0, detailLines.length - (changelogHeight - 2));

  useInput(
    (input, key) => {
      if (key.downArrow || input === 'j') {
        if (key.shift || input === 'J') {
          setDetailScrollOffset(prev => Math.min(prev + 1, maxDetailScroll));
        } else {
          setSelectedIndex(prev => Math.min(prev + 1, changelog.length - 1));
          setDetailScrollOffset(0);
        }
      }
      if (key.upArrow || input === 'k') {
        if (key.shift || input === 'K') {
          setDetailScrollOffset(prev => Math.max(prev - 1, 0));
        } else {
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          setDetailScrollOffset(0);
        }
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column" height={height} paddingX={1}>
      <Box flexDirection="row" width="100%">
        <Box flexDirection="column" width="50%">
          <Text bold color={theme.accent}>
            Ralph Ultra v{pkgInfo?.version || '?'}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            <Text bold color={theme.accentSecondary}>
              System
            </Text>
            {Object.entries(systemInfo).map(([key, value]) => (
              <Text key={key}>
                {' '}
                {key}: <Text color={theme.muted}>{value}</Text>
              </Text>
            ))}
          </Box>
        </Box>
        <Box flexDirection="column" width="50%">
          <Text bold color={theme.accentSecondary}>
            CLI Tools
          </Text>
          {Object.entries(cliVersions).map(([name, version]) => (
            <Text key={name}>
              {' '}
              {name}:{' '}
              <Text color={version.includes('not installed') ? theme.error : theme.success}>
                {version.includes('not installed') ? 'not installed' : version.split(' ')[0]}
              </Text>
            </Text>
          ))}
          <Box marginTop={1}>
            <Text bold color={theme.accentSecondary}>
              Dependencies
            </Text>
          </Box>
          {keyDeps.map(({ name, version }) => (
            <Text key={name}>
              {' '}
              {name}: <Text color={theme.muted}>{version}</Text>
            </Text>
          ))}
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="row" height={changelogHeight}>
        <Box flexDirection="column" width="30%" borderStyle="single" borderColor={theme.border}>
          <Text bold color={theme.accent}>
            {' '}
            Changelog
          </Text>
          {changelog.slice(0, changelogHeight - 2).map((entry, i) => (
            <Text key={entry.version} color={i === selectedIndex ? theme.accent : theme.muted}>
              {i === selectedIndex ? '>' : ' '} v{entry.version}
            </Text>
          ))}
        </Box>

        <Box
          flexDirection="column"
          width="70%"
          paddingLeft={1}
          borderStyle="single"
          borderColor={theme.border}
        >
          {selectedEntry ? (
            <>
              <Text bold color={theme.accent}>
                v{selectedEntry.version} <Text color={theme.muted}>({selectedEntry.date})</Text>
              </Text>
              <Box flexDirection="column" height={changelogHeight - 3} overflow="hidden">
                {detailLines
                  .slice(detailScrollOffset, detailScrollOffset + changelogHeight - 3)
                  .map((line, i) => (
                    <Text
                      key={i}
                      color={line.startsWith('[') ? theme.accentSecondary : theme.foreground}
                      bold={line.startsWith('[')}
                    >
                      {line}
                    </Text>
                  ))}
              </Box>
              {maxDetailScroll > 0 && (
                <Text dimColor>
                  Shift+j/k to scroll ({detailScrollOffset + 1}/{maxDetailScroll + 1})
                </Text>
              )}
            </>
          ) : (
            <Text color={theme.muted}>No changelog entries found</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
});
