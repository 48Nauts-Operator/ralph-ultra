import React, { useState, useEffect, memo } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync, watchFile, unwatchFile, existsSync } from 'fs';
import { join } from 'path';
import { useTheme } from '@hooks/useTheme';
import { useNotifications } from '@hooks/useNotifications';
import type { UserStory, AcceptanceCriterion } from '@types';
import { runStoryTestsAndSave, type ACTestResult } from '../utils/ac-runner';
import type { TailscaleStatus } from '../remote/tailscale';
import { TracingPane, type AgentNode } from './TracingPane';
import {
  getSessionInfo,
  formatCost,
  formatTokens,
  type SessionInfo,
} from '../utils/session-tracker';

/**
 * View types for the work pane
 */
export type WorkView = 'monitor' | 'status' | 'details' | 'help' | 'tracing';

interface WorkPaneProps {
  isFocused: boolean;
  height: number;
  width: number;
  projectPath: string;
  selectedStory: UserStory | null;
  logLines?: string[];
  processState?: string;
  processError?: string;
  tailscaleStatus?: TailscaleStatus | null;
  remoteURL?: string | null;
  agentTree?: AgentNode[];
  initialView?: WorkView;
  initialScrollOffset?: number;
  availableCLI?: string | null;
  lastRunDuration?: number | null;
  lastRunExitCode?: number | null;
  currentStory?: string | null;
}

/**
 * Work pane - displays different content based on current view mode
 * Views: Monitor (logs), Status (system info), Details (story details), Help (commands), Tracing (agent tree)
 */
export const WorkPane: React.FC<WorkPaneProps> = memo(
  ({
    isFocused,
    height,
    width,
    projectPath,
    selectedStory,
    logLines = [],
    processState = 'idle',
    processError,
    tailscaleStatus = null,
    remoteURL = null,
    agentTree = [],
    initialView = 'monitor',
    initialScrollOffset = 0,
    availableCLI = null,
    lastRunDuration = null,
    lastRunExitCode = null,
    currentStory = null,
  }) => {
    const { theme } = useTheme();
    const { history: notificationHistory, notify } = useNotifications();
    const [currentView, setCurrentView] = useState<WorkView>(initialView);
    const [logContent, setLogContent] = useState<string[]>([]);
    const [scrollOffset, setScrollOffset] = useState(initialScrollOffset);
    const [isRunningTests, setIsRunningTests] = useState(false);
    const [testProgress, setTestProgress] = useState<{ current: number; total: number } | null>(
      null,
    );
    const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
      model: null,
      cost: { cost: 0, tokens: { input: 0, output: 0 } },
      processes: [],
    });

    // Update log content when logLines prop changes
    useEffect(() => {
      if (logLines.length > 0) {
        setLogContent(logLines);
        // Auto-scroll to bottom on new content
        const contentHeight = logLines.length;
        const visibleHeight = height - 3; // Subtract header and borders
        if (contentHeight > visibleHeight) {
          setScrollOffset(Math.max(0, contentHeight - visibleHeight));
        }
      }
    }, [logLines, height]);

    // Load log file for Monitor view (fallback to file if no live stream)
    const loadLog = () => {
      try {
        const logPath = join(projectPath, 'ralph-monitor.log');
        if (existsSync(logPath)) {
          const content = readFileSync(logPath, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());
          setLogContent(lines);
          // Auto-scroll to bottom on new content
          setScrollOffset(Math.max(0, lines.length - (height - 3)));
        }
      } catch {
        // Silently fail if log doesn't exist yet
        setLogContent(['No log file found. Run Ralph to generate logs.']);
      }
    };

    // Watch log file for changes
    useEffect(() => {
      loadLog();

      const LOG_WATCH_INTERVAL_MS = 2000;
      const logPath = join(projectPath, 'ralph-monitor.log');
      if (existsSync(logPath)) {
        watchFile(logPath, { interval: LOG_WATCH_INTERVAL_MS }, loadLog);
      }

      return () => {
        unwatchFile(logPath, loadLog);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectPath]);

    useEffect(() => {
      const updateSessionInfo = () => {
        setSessionInfo(getSessionInfo(projectPath));
      };

      updateSessionInfo();
      const SESSION_POLL_INTERVAL_MS = 10000;
      const interval = setInterval(updateSessionInfo, SESSION_POLL_INTERVAL_MS);

      return () => clearInterval(interval);
    }, [projectPath]);

    // Handle keyboard input for view switching and scrolling
    useInput(
      (input, key) => {
        // Number keys: jump to specific views
        if (input === '1') {
          setCurrentView('monitor');
          return;
        }
        if (input === '2') {
          setCurrentView('status');
          return;
        }
        if (input === '3') {
          setCurrentView('details');
          return;
        }
        if (input === '4') {
          setCurrentView('help');
          return;
        }
        if (input === '5') {
          setCurrentView('tracing');
          return;
        }

        if (input === 'j' || key.downArrow) {
          setScrollOffset(prev => {
            const maxScroll = Math.max(0, getMaxScrollForView() - (height - 3));
            return Math.min(prev + 1, maxScroll);
          });
        }
        if (input === 'k' || key.upArrow) {
          setScrollOffset(prev => Math.max(0, prev - 1));
        }

        if (
          (input === 't' || input === 'T') &&
          currentView === 'details' &&
          selectedStory &&
          !isRunningTests
        ) {
          setIsRunningTests(true);
          setTestProgress({ current: 0, total: selectedStory.acceptanceCriteria.length });

          notify('info', `Running tests for ${selectedStory.id}...`);

          setTimeout(() => {
            const results = runStoryTestsAndSave(
              projectPath,
              selectedStory.id,
              (_result: ACTestResult, index: number, total: number) => {
                setTestProgress({ current: index + 1, total });
              },
            );

            setIsRunningTests(false);
            setTestProgress(null);

            if (results) {
              const passed = results.results.filter(r => r.passes).length;
              const total = results.results.length;
              if (results.allPassed) {
                notify('success', `All ${total} tests passed for ${selectedStory.id}!`);
              } else {
                notify('warning', `${passed}/${total} tests passed for ${selectedStory.id}`);
              }

              if (results.projectComplete && results.archivedPath) {
                notify('success', `Project complete! PRD archived.`, 10000);
              }
            } else {
              notify('error', 'Failed to run tests');
            }
          }, 100);
        }
      },
      { isActive: isFocused },
    );

    // Get max scroll value for current view
    const getMaxScrollForView = (): number => {
      if (currentView === 'monitor') return logContent.length;
      if (currentView === 'status') return 10; // Status view is short
      if (currentView === 'details' && selectedStory) {
        return 3 + selectedStory.acceptanceCriteria.length;
      }
      if (currentView === 'help') return 20; // Help view has ~20 lines
      return 0;
    };

    const borderColor = isFocused ? theme.borderFocused : theme.border;

    interface ParsedMonitorData {
      currentStoryId: string | null;
      currentStoryTitle: string | null;
      complexity: string | null;
      cli: string | null;
      phase: 'idle' | 'running' | 'verifying' | 'complete' | 'failed';
      acResults: { id: string; passed: boolean | null }[];
      acPassed: number;
      acTotal: number;
      storiesComplete: number;
      storiesTotal: number;
      lastDuration: string | null;
      recentActivity: string[];
      projectComplete: boolean;
    }

    const parseMonitorData = (lines: string[]): ParsedMonitorData => {
      const data: ParsedMonitorData = {
        currentStoryId: null,
        currentStoryTitle: null,
        complexity: null,
        cli: null,
        phase: 'idle',
        acResults: [],
        acPassed: 0,
        acTotal: 0,
        storiesComplete: 0,
        storiesTotal: 0,
        lastDuration: null,
        recentActivity: [],
        projectComplete: false,
      };

      for (const line of lines) {
        if (line.includes('Starting ') && line.includes('═══')) {
          const match = line.match(/Starting ([A-Z]+-\d+): (.+?) ═/);
          if (match) {
            data.currentStoryId = match[1] || null;
            data.currentStoryTitle = match[2] || null;
            data.phase = 'running';
            data.acResults = [];
          }
        }
        if (line.includes('Using CLI:')) {
          data.cli = line.split('Using CLI:')[1]?.trim() || null;
        }
        if (line.includes('Complexity:')) {
          data.complexity = line.split('Complexity:')[1]?.trim() || null;
        }
        if (line.includes('Verifying') && line.includes('acceptance criteria')) {
          data.phase = 'verifying';
        }
        if (line.includes('AC-') && (line.includes('PASS') || line.includes('FAIL'))) {
          const acMatch = line.match(/AC-(\d+)\/(\d+): (PASS|FAIL)/);
          if (acMatch) {
            const idx = parseInt(acMatch[1] || '0') - 1;
            const total = parseInt(acMatch[2] || '0');
            const passed = acMatch[3] === 'PASS';
            data.acTotal = total;
            if (!data.acResults[idx]) {
              data.acResults[idx] = { id: `AC-${idx + 1}`, passed };
            } else {
              data.acResults[idx]!.passed = passed;
            }
            data.acPassed = data.acResults.filter(r => r?.passed).length;
          }
        }
        if (line.includes('Results:') && line.includes('criteria passed')) {
          const match = line.match(/(\d+)\/(\d+) criteria/);
          if (match) {
            data.acPassed = parseInt(match[1] || '0');
            data.acTotal = parseInt(match[2] || '0');
          }
        }
        if (line.includes('VERIFIED')) {
          data.phase = 'complete';
        }
        if (line.includes('FAILED') && line.includes('criteria not met')) {
          data.phase = 'failed';
        }
        if (line.includes('completed (exit:')) {
          const match = line.match(/(\d+\.\d+)s\)/);
          if (match) data.lastDuration = match[1] + 's';
        }
        if (line.includes('PROJECT COMPLETE')) {
          data.projectComplete = true;
        }
        if (line.includes('/6 stories complete') || line.includes('stories complete')) {
          const match = line.match(/(\d+)\/(\d+)/);
          if (match) {
            data.storiesComplete = parseInt(match[1] || '0');
            data.storiesTotal = parseInt(match[2] || '0');
          }
        }
      }

      const isJsonOrCode = (l: string) =>
        l.startsWith('{') ||
        l.startsWith('[') ||
        l.startsWith('"') ||
        l.includes('tool_use_id') ||
        l.includes('"type":') ||
        l.includes('"message":') ||
        l.includes('"content":') ||
        /^\s*[)}{\[\]];?\s*$/.test(l) ||
        /^\s*(const|let|var|function|import|export|await|return|if|for|while)\s/.test(l) ||
        /^\s*\d+[→\-]/.test(l) ||
        l.includes('# Mark as');

      const activityLines = lines
        .filter(
          l =>
            !isJsonOrCode(l) &&
            (l.includes('✓') ||
              l.includes('✗') ||
              l.includes('Starting') ||
              l.includes('VERIFIED') ||
              l.includes('FAILED') ||
              l.includes('Moving') ||
              l.includes('completed') ||
              l.includes('PROJECT')),
        )
        .slice(-6);
      data.recentActivity = activityLines.map(l => l.replace(/[═─]/g, '').trim()).filter(Boolean);

      return data;
    };

    const renderMonitor = () => {
      const data = parseMonitorData(logContent);
      const boxWidth = Math.max(40, width - 4);

      const phaseColor =
        data.phase === 'complete'
          ? theme.success
          : data.phase === 'failed'
            ? theme.error
            : data.phase === 'verifying'
              ? theme.warning
              : data.phase === 'running'
                ? theme.accent
                : theme.muted;

      const phaseText =
        data.phase === 'complete'
          ? '✓ DONE'
          : data.phase === 'failed'
            ? '✗ RETRY'
            : data.phase === 'verifying'
              ? '⋯ VERIFY'
              : data.phase === 'running'
                ? '▶ RUN'
                : '○ IDLE';

      if (data.projectComplete) {
        return (
          <Box flexDirection="column" padding={1}>
            <Box
              borderStyle="round"
              borderColor={theme.success}
              flexDirection="column"
              paddingX={1}
            >
              <Text bold color={theme.success}>
                🎉 PROJECT COMPLETE
              </Text>
              <Text dimColor>All stories verified and archived</Text>
            </Box>
          </Box>
        );
      }

      if (!data.currentStoryId && data.phase === 'idle') {
        return (
          <Box flexDirection="column" padding={1}>
            <Box
              borderStyle="single"
              borderColor={theme.border}
              flexDirection="column"
              paddingX={1}
            >
              <Text bold color={theme.accent}>
                Monitor
              </Text>
              <Text dimColor>Press 'r' to start Ralph</Text>
            </Box>
          </Box>
        );
      }

      return (
        <Box flexDirection="column" paddingX={1} gap={0}>
          <Box
            borderStyle="single"
            borderColor={phaseColor}
            flexDirection="column"
            width={boxWidth}
          >
            <Box paddingX={1} justifyContent="space-between">
              <Text bold color={theme.accent}>
                {data.currentStoryId || 'No Story'}
              </Text>
              <Text color={phaseColor}>{phaseText}</Text>
            </Box>
            <Box paddingX={1}>
              <Text dimColor wrap="truncate">
                {data.currentStoryTitle || 'Waiting...'}
              </Text>
            </Box>
            <Box paddingX={1} gap={2}>
              <Text dimColor>
                CLI:<Text color={theme.success}>{data.cli || '?'}</Text>
              </Text>
              <Text dimColor>
                Complexity:<Text color={theme.warning}>{data.complexity || '?'}</Text>
              </Text>
              {data.lastDuration && (
                <Text dimColor>
                  Time:<Text>{data.lastDuration}</Text>
                </Text>
              )}
            </Box>
          </Box>

          <Box
            borderStyle="single"
            borderColor={theme.border}
            flexDirection="column"
            width={boxWidth}
          >
            <Box paddingX={1}>
              <Text bold color={theme.accent}>
                AC Tests{' '}
              </Text>
              <Text
                color={
                  data.acPassed === data.acTotal && data.acTotal > 0 ? theme.success : theme.warning
                }
              >
                {data.acPassed}/{data.acTotal}
              </Text>
            </Box>
            <Box paddingX={1} flexDirection="row" gap={2} flexWrap="wrap">
              {data.acTotal > 0 ? (
                Array.from({ length: data.acTotal }).map((_, i) => {
                  const result = data.acResults[i];
                  const icon = result?.passed === true ? '✓' : result?.passed === false ? '✗' : '○';
                  const color =
                    result?.passed === true
                      ? theme.success
                      : result?.passed === false
                        ? theme.error
                        : theme.muted;
                  return (
                    <Text key={i} color={color}>
                      {icon}AC-{i + 1}
                    </Text>
                  );
                })
              ) : (
                <Text dimColor>Waiting...</Text>
              )}
            </Box>
          </Box>

          <Box
            borderStyle="single"
            borderColor={theme.border}
            flexDirection="column"
            width={boxWidth}
          >
            <Box paddingX={1}>
              <Text bold color={theme.accent}>
                Activity
              </Text>
            </Box>
            <Box paddingX={2} paddingY={1} flexDirection="column" gap={0}>
              {data.recentActivity.length > 0 ? (
                data.recentActivity.slice(-6).map((line, i) => {
                  const isPass =
                    line.includes('✓') || line.includes('VERIFIED') || line.includes('PASS');
                  const isFail =
                    line.includes('✗') || line.includes('FAILED') || line.includes('FAIL');
                  const isStart = line.includes('Starting');
                  const textColor = isPass
                    ? theme.success
                    : isFail
                      ? theme.error
                      : isStart
                        ? theme.accent
                        : theme.muted;
                  const icon = isPass ? '✓' : isFail ? '✗' : isStart ? '▶' : '·';
                  const cleanLine = line.replace(/^[✓✗▶·]\s*/, '').trim();
                  const maxLen = boxWidth - 8;
                  const shortLine =
                    cleanLine.length > maxLen ? cleanLine.slice(0, maxLen - 3) + '...' : cleanLine;
                  return (
                    <Text key={i} color={textColor}>
                      {icon} {shortLine}
                    </Text>
                  );
                })
              ) : (
                <Text dimColor>No activity</Text>
              )}
            </Box>
          </Box>

          <Box borderStyle="single" borderColor={theme.border} width={boxWidth} paddingX={1}>
            <Text dimColor>Progress: </Text>
            {(() => {
              const pct = data.acTotal > 0 ? Math.round((data.acPassed / data.acTotal) * 100) : 0;
              const barWidth = Math.max(1, Math.min(20, boxWidth - 20));
              const filled = Math.max(0, Math.min(barWidth, Math.round((pct / 100) * barWidth)));
              const empty = Math.max(0, barWidth - filled);
              return (
                <>
                  <Text color={theme.success}>{'█'.repeat(filled)}</Text>
                  <Text dimColor>{'░'.repeat(empty)}</Text>
                  <Text> {pct}%</Text>
                </>
              );
            })()}
          </Box>
        </Box>
      );
    };

    // Render Status view
    const renderStatus = () => {
      const stateColor =
        processState === 'running' || processState === 'external'
          ? theme.success
          : processState === 'stopping'
            ? theme.warning
            : theme.muted;

      const stateText = processState === 'external' ? 'running (external)' : processState;

      // Determine Tailscale status display
      const getTailscaleStatusDisplay = () => {
        if (!tailscaleStatus) {
          return { text: 'Checking...', color: theme.muted };
        }
        if (!tailscaleStatus.isInstalled) {
          return { text: 'Not Installed', color: theme.error };
        }
        if (!tailscaleStatus.isConnected) {
          return { text: 'Disconnected', color: theme.warning };
        }
        return { text: 'Connected', color: theme.success };
      };

      const tailscaleDisplay = getTailscaleStatusDisplay();

      return (
        <Box flexDirection="column" paddingX={1} gap={0}>
          <Text bold color={theme.accent}>
            System Status
          </Text>
          <Text>
            <Text dimColor>Process State: </Text>
            <Text color={stateColor}>{stateText}</Text>
          </Text>
          {processError && (
            <Text>
              <Text dimColor>Error: </Text>
              <Text color={theme.error}>{processError}</Text>
            </Text>
          )}
          <Text>
            <Text dimColor>AI CLI: </Text>
            <Text color={availableCLI ? theme.success : theme.error}>
              {availableCLI || 'Not found'}
            </Text>
          </Text>
          <Text>
            <Text dimColor>Model: </Text>
            <Text color={sessionInfo.model ? theme.success : theme.muted}>
              {sessionInfo.model || 'Unknown'}
            </Text>
          </Text>
          {currentStory && (
            <Text>
              <Text dimColor>Current Story: </Text>
              <Text color={theme.accent}>{currentStory}</Text>
            </Text>
          )}
          <Text>
            <Text dimColor>Last Run: </Text>
            <Text>
              {lastRunDuration !== null
                ? `${(lastRunDuration / 1000).toFixed(1)}s (exit: ${lastRunExitCode ?? '?'})`
                : 'Not started'}
            </Text>
          </Text>
          <Text> </Text>
          <Text bold color={theme.accent}>
            Session Cost
          </Text>
          <Text>
            <Text dimColor>Total: </Text>
            <Text color={theme.warning}>{formatCost(sessionInfo.cost.cost)}</Text>
          </Text>
          <Text>
            <Text dimColor>Tokens: </Text>
            <Text>
              {formatTokens(sessionInfo.cost.tokens.input)} in /{' '}
              {formatTokens(sessionInfo.cost.tokens.output)} out
            </Text>
          </Text>
          <Text> </Text>
          <Text bold color={theme.accent}>
            Running Processes ({sessionInfo.processes.length})
          </Text>
          {sessionInfo.processes.length === 0 ? (
            <Text dimColor>No Ralph processes running</Text>
          ) : (
            sessionInfo.processes.slice(0, 5).map((proc, i) => (
              <Text key={i}>
                <Text color={proc.status === 'attached' ? theme.success : theme.accent}>
                  {proc.status === 'attached' ? '●' : '○'}
                </Text>
                <Text> {proc.name}</Text>
              </Text>
            ))
          )}
          {sessionInfo.processes.length > 5 && (
            <Text dimColor>... and {sessionInfo.processes.length - 5} more</Text>
          )}
          <Text> </Text>
          <Text bold color={theme.accent}>
            Remote Access
          </Text>
          <Text>
            <Text dimColor>Local Client: </Text>
            <Text color={theme.success}>http://127.0.0.1:7891/remote</Text>
          </Text>
          <Text dimColor wrap="wrap">
            (Open in browser on this machine)
          </Text>
          <Text> </Text>
          <Text>
            <Text dimColor>Tailscale: </Text>
            <Text color={tailscaleDisplay.color}>{tailscaleDisplay.text}</Text>
          </Text>
          {tailscaleStatus?.isConnected && (
            <>
              <Text>
                <Text dimColor>Tailscale IP: </Text>
                <Text color={theme.success}>{tailscaleStatus.tailscaleIP}</Text>
              </Text>
              <Text>
                <Text dimColor>MagicDNS: </Text>
                <Text color={theme.success}>{tailscaleStatus.magicDNS}</Text>
              </Text>
              {remoteURL && (
                <Text>
                  <Text dimColor>Remote URL: </Text>
                  <Text color={theme.accent}>{remoteURL}</Text>
                </Text>
              )}
              <Text dimColor>(Press &apos;c&apos; to copy URL to clipboard)</Text>
            </>
          )}
          {!tailscaleStatus?.isInstalled && (
            <Text color={theme.muted} wrap="wrap">
              Install Tailscale for secure remote access
            </Text>
          )}
          {tailscaleStatus?.isInstalled && !tailscaleStatus?.isConnected && (
            <Text color={theme.muted} wrap="wrap">
              Run &apos;tailscale up&apos; to connect
            </Text>
          )}
          <Text> </Text>
          <Text bold color={theme.accent}>
            Notification History
          </Text>
          {notificationHistory.length === 0 ? (
            <Text dimColor>No notifications yet</Text>
          ) : (
            <Box flexDirection="column">
              {notificationHistory.slice(0, 5).map(notification => {
                const typeColor =
                  notification.type === 'error'
                    ? theme.error
                    : notification.type === 'warning'
                      ? theme.warning
                      : notification.type === 'success'
                        ? theme.success
                        : '#3B82F6';
                const typeIcon =
                  notification.type === 'error'
                    ? '✗'
                    : notification.type === 'warning'
                      ? '⚠'
                      : notification.type === 'success'
                        ? '✓'
                        : 'ℹ';
                const timestamp = notification.timestamp.toLocaleTimeString();
                return (
                  <Text key={notification.id}>
                    <Text color={typeColor}>{typeIcon}</Text>
                    <Text dimColor> {timestamp} </Text>
                    <Text>{notification.message}</Text>
                  </Text>
                );
              })}
              {notificationHistory.length > 5 && (
                <Text dimColor>... and {notificationHistory.length - 5} more</Text>
              )}
            </Box>
          )}
        </Box>
      );
    };

    const renderDetails = () => {
      if (!selectedStory) {
        return (
          <Box flexDirection="column" paddingX={1}>
            <Text bold color={theme.accent}>
              Story Details
            </Text>
            <Text> </Text>
            <Text dimColor>Select a story from the left panel to view details</Text>
            <Text> </Text>
            <Text dimColor>Use j/k or ↑/↓ to navigate stories</Text>
            <Text dimColor>Press Enter to select</Text>
          </Box>
        );
      }

      const statusColor = selectedStory.passes ? theme.success : theme.warning;
      const statusText = selectedStory.passes ? 'Complete' : 'In Progress';
      const priorityColor =
        selectedStory.priority <= 1
          ? theme.error
          : selectedStory.priority <= 3
            ? theme.warning
            : theme.muted;
      const priorityText =
        selectedStory.priority <= 1
          ? 'P0 - Critical'
          : selectedStory.priority <= 3
            ? 'P1 - High'
            : selectedStory.priority <= 5
              ? 'P2 - Medium'
              : 'P3 - Low';
      const complexityColor =
        selectedStory.complexity === 'complex'
          ? theme.error
          : selectedStory.complexity === 'medium'
            ? theme.warning
            : theme.success;

      const visibleContent: React.ReactNode[] = [
        <Text key="header" bold color={theme.accent}>
          ▸ {selectedStory.title}
        </Text>,
        <Text key="space0"> </Text>,
        <Text key="id">
          <Text dimColor>ID: </Text>
          <Text>{selectedStory.id}</Text>
        </Text>,
        <Text key="space1"> </Text>,
        <Text key="status">
          <Text dimColor>Status: </Text>
          <Text color={statusColor}>{statusText}</Text>
        </Text>,
        <Text key="priority">
          <Text dimColor>Priority: </Text>
          <Text color={priorityColor}>{priorityText}</Text>
        </Text>,
        <Text key="complexity">
          <Text dimColor>Complexity: </Text>
          <Text color={complexityColor}>{selectedStory.complexity}</Text>
        </Text>,
        <Text key="space2"> </Text>,
        <Box
          key="desc-box"
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.border}
          paddingX={1}
          paddingY={0}
        >
          <Text key="desc-header" bold color={theme.accent}>
            Description
          </Text>
          <Text key="space3"> </Text>
          <Text key="description" wrap="wrap">
            {selectedStory.description}
          </Text>
        </Box>,
        <Text key="space4"> </Text>,
        <Box
          key="ac-box"
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.border}
          paddingX={1}
          paddingY={0}
        >
          <Box key="ac-header-row">
            <Text bold color={theme.accent}>
              Acceptance Criteria
            </Text>
            {isRunningTests && testProgress && (
              <Text color={theme.warning}>
                {' '}
                (Testing {testProgress.current}/{testProgress.total}...)
              </Text>
            )}
            {!isRunningTests && <Text dimColor> [T to run tests]</Text>}
          </Box>
          <Text key="space5"> </Text>
          {selectedStory.acceptanceCriteria.map((criteria, idx) => {
            if (typeof criteria === 'string') {
              return (
                <Text key={`ac-${idx}`}>
                  <Text dimColor>[ ] </Text>
                  <Text wrap="wrap">{criteria}</Text>
                </Text>
              );
            }
            const ac = criteria as AcceptanceCriterion;
            const statusIcon = ac.lastRun === null ? '○' : ac.passes ? '✓' : '✗';
            const statusColor =
              ac.lastRun === null ? theme.muted : ac.passes ? theme.success : theme.error;
            return (
              <Text key={`ac-${idx}`}>
                <Text color={statusColor}>[{statusIcon}] </Text>
                <Text wrap="wrap">{ac.text}</Text>
              </Text>
            );
          })}
        </Box>,
      ];

      return (
        <Box flexDirection="column" paddingX={1} overflowY="hidden">
          {visibleContent}
        </Box>
      );
    };

    // Render Help view
    const renderHelp = () => {
      const helpSections = [
        {
          title: 'Navigation',
          items: [
            { key: 'Tab', desc: 'Cycle focus between panes' },
            { key: 'j/k or ↑↓', desc: 'Navigate within pane' },
            { key: '[', desc: 'Toggle projects rail' },
          ],
        },
        {
          title: 'Actions',
          items: [
            { key: 'r', desc: 'Run Ralph on current project' },
            { key: 's', desc: 'Stop running Ralph' },
            { key: 'q', desc: 'Quit application' },
          ],
        },
        {
          title: 'Views',
          items: [
            { key: '1', desc: 'Monitor (logs)' },
            { key: '2', desc: 'Status (system info)' },
            { key: '3', desc: 'Details (story)' },
            { key: '4', desc: 'Help (this view)' },
            { key: '5', desc: 'Tracing (agent tree)' },
          ],
        },
        {
          title: 'Remote',
          items: [{ key: 'c', desc: 'Copy remote URL' }],
        },
        {
          title: 'Interface',
          items: [
            { key: '?', desc: 'Welcome overlay' },
            { key: 't', desc: 'Theme settings' },
          ],
        },
      ];

      const allLines: React.ReactNode[] = [];
      helpSections.forEach((section, sectionIdx) => {
        allLines.push(
          <Text key={`section-${sectionIdx}`} bold color={theme.accent}>
            {section.title}
          </Text>,
        );
        section.items.forEach((item, itemIdx) => {
          allLines.push(
            <Text key={`${sectionIdx}-${itemIdx}`}>
              <Text color={theme.warning}>{item.key.padEnd(12)}</Text>
              <Text dimColor>{item.desc}</Text>
            </Text>,
          );
        });
        allLines.push(<Text key={`space-${sectionIdx}`}> </Text>);
      });

      const visibleLines = allLines.slice(scrollOffset, scrollOffset + (height - 3));

      return (
        <Box flexDirection="column" paddingX={1}>
          {visibleLines}
        </Box>
      );
    };

    // Render appropriate view based on currentView
    const renderCurrentView = () => {
      switch (currentView) {
        case 'monitor':
          return renderMonitor();
        case 'status':
          return renderStatus();
        case 'details':
          return renderDetails();
        case 'help':
          return renderHelp();
        case 'tracing':
          return null; // TracingPane renders itself as a full component
      }
    };

    // For tracing view, render TracingPane directly (it has its own border)
    if (currentView === 'tracing') {
      return (
        <TracingPane isFocused={isFocused} height={height} width={width} agentTree={agentTree} />
      );
    }

    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={borderColor}
        width={width}
        height={height}
      >
        {/* Header showing current view */}
        <Box paddingX={1} borderStyle="single" borderColor={borderColor}>
          <Text bold color={theme.accent}>
            Work: {currentView.charAt(0).toUpperCase() + currentView.slice(1)}
          </Text>
          <Text dimColor> [1-5 to switch]</Text>
        </Box>

        {/* View content */}
        <Box flexDirection="column" flexGrow={1}>
          {renderCurrentView()}
        </Box>
      </Box>
    );
  },
);
