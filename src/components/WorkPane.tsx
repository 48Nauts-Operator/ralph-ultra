import React, { useState, useEffect, memo, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync, watchFile, unwatchFile, existsSync } from 'fs';
import { join } from 'path';
import { useTheme } from '@hooks/useTheme';
import { useNotifications } from '@hooks/useNotifications';
import { useSearch } from '@hooks/useSearch';
import { useQuotas } from '@hooks/useQuotas';
import type {
  UserStory,
  AcceptanceCriterion,
  LogFilter,
  LogFilterLevel,
  PRD,
  WorkView,
  AgentActivity,
  OutputLine,
} from '@types';
import { runStoryTestsAndSave, type ACTestResult } from '../utils/ac-runner';
import type { TailscaleStatus } from '../remote/tailscale';

import {
  getSessionInfo,
  formatCost,
  formatTokens,
  type SessionInfo,
} from '../utils/session-tracker';
import { analyzeStoryComplexity, type ComplexityWarning } from '../utils/ralph-service';
import { QuotaDashboard } from './QuotaDashboard';
import { VersionView } from './VersionView';
import { ExecutionPlanView } from './ExecutionPlanView';
import { CostDashboard } from './CostDashboard';

const VIEW_NUMBERS: Record<string, number> = {
  monitor: 1, status: 2, details: 3, quota: 4,
  plan: 5, help: 6, version: 7, costs: 8,
};

interface WorkPaneProps {
  isFocused: boolean;
  height: number;
  width: number;
  projectPath: string;
  selectedStory: UserStory | null;
  logLines?: string[];
  processState?: string;
  processError?: string;
  processPid?: number | null;
  tailscaleStatus?: TailscaleStatus | null;
  remoteURL?: string | null;

  initialView?: WorkView;
  initialScrollOffset?: number;
  availableCLI?: string | null;
  lastRunDuration?: number | null;
  lastRunExitCode?: number | null;
  currentStory?: string | null;
  retryCount?: number;
  logFilter?: LogFilter;
  allStoriesComplete?: boolean;
  liveOutput?: OutputLine[];
  agentActivity?: AgentActivity | null;
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
    processPid = null,
    tailscaleStatus = null,
    remoteURL = null,

    initialView = 'monitor',
    initialScrollOffset = 0,
    availableCLI = null,
    lastRunDuration = null,
    lastRunExitCode = null,
    currentStory = null,
    retryCount = 0,
    logFilter = { level: 'all' },
    allStoriesComplete = false,
    liveOutput = [],
    agentActivity = null,
  }) => {
    const { theme } = useTheme();
    const { history: notificationHistory, notify } = useNotifications();
    const { refresh: refreshQuotas } = useQuotas();
    const [currentView, setCurrentView] = useState<WorkView>(initialView);
    const [logContent, setLogContent] = useState<string[]>([]);

    useEffect(() => {
      setCurrentView(initialView);
    }, [initialView]);
    const [scrollOffset, setScrollOffset] = useState(initialScrollOffset);
    const [isRunningTests, setIsRunningTests] = useState(false);
    const [testProgress, setTestProgress] = useState<{ current: number; total: number } | null>(
      null,
    );
    const [complexityWarning, setComplexityWarning] = useState<ComplexityWarning | null>(null);
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [isRefreshingQuota, setIsRefreshingQuota] = useState(false);

    // Load PRD to check for CLI override
    const getPRDCLI = (): string | null => {
      try {
        const prdPath = join(projectPath, 'prd.json');
        if (existsSync(prdPath)) {
          const content = readFileSync(prdPath, 'utf-8');
          const prd: PRD = JSON.parse(content);
          return prd.cli || null;
        }
      } catch {
        // Ignore errors
      }
      return null;
    };

    const prdCLI = getPRDCLI();

    // Filter log lines based on current filter level
    const filterLogLines = (lines: string[]): string[] => {
      if (logFilter.level === 'all') {
        return lines;
      }

      return lines.filter(line => {
        const lowerLine = line.toLowerCase();

        if (logFilter.level === 'errors') {
          // Show only error lines
          return (
            lowerLine.includes('error') ||
            lowerLine.includes('fail') ||
            lowerLine.includes('failed') ||
            lowerLine.includes('exception') ||
            lowerLine.includes('fatal') ||
            line.includes('✗') ||
            line.includes('FAILED') ||
            line.includes('ERROR')
          );
        }

        if (logFilter.level === 'warnings_errors') {
          // Show warnings and errors
          return (
            lowerLine.includes('error') ||
            lowerLine.includes('fail') ||
            lowerLine.includes('failed') ||
            lowerLine.includes('exception') ||
            lowerLine.includes('fatal') ||
            lowerLine.includes('warn') ||
            lowerLine.includes('warning') ||
            lowerLine.includes('retry') ||
            lowerLine.includes('retrying') ||
            line.includes('✗') ||
            line.includes('⚠') ||
            line.includes('FAILED') ||
            line.includes('ERROR') ||
            line.includes('WARNING') ||
            line.includes('WARN')
          );
        }

        return false;
      });
    };

    // Apply filter to log content
    const filteredLogContent = useMemo(
      () => filterLogLines(logContent),
      [logContent, logFilter.level],
    );

    // Initialize search hook with filtered content
    const search = useSearch(filteredLogContent);

    // Helper function to highlight matching text
    const highlightMatch = (text: string, lineIndex: number): React.ReactNode => {
      if (!search.searchState.searchQuery || !search.isLineMatch(lineIndex)) {
        return text;
      }

      const query = search.searchState.searchQuery.toLowerCase();
      const lowerText = text.toLowerCase();
      const index = lowerText.indexOf(query);

      if (index === -1) {
        return text;
      }

      const isCurrentMatch = search.isCurrentMatch(lineIndex);
      const highlightColor = isCurrentMatch ? theme.accent : theme.warning;

      return (
        <>
          {text.substring(0, index)}
          <Text backgroundColor={highlightColor} color="black">
            {text.substring(index, index + query.length)}
          </Text>
          {text.substring(index + query.length)}
        </>
      );
    };

    const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
      model: null,
      cost: { cost: 0, tokens: { input: 0, output: 0 } },
      contextBudget: {
        fiveHourPercent: 0,
        sevenDayPercent: 0,
        fiveHourResetsAt: null,
        sevenDayResetsAt: null,
        approaching: false,
        exceeded: false,
      },
      processes: [],
    });

    // Update log content when logLines prop changes
    useEffect(() => {
      if (logLines.length > 0) {
        setLogContent(prev => {
          if (prev.length === logLines.length && prev.join('\n') === logLines.join('\n')) {
            return prev;
          }
          const contentHeight = logLines.length;
          const visibleHeight = height - 3;
          if (contentHeight > visibleHeight) {
            setScrollOffset(Math.max(0, contentHeight - visibleHeight));
          }
          return logLines;
        });
      }
    }, [logLines, height]);

    // Load log file for Monitor view (fallback to file if no live stream)
    const loadLog = () => {
      try {
        const logPath = join(projectPath, 'ralph-monitor.log');
        if (existsSync(logPath)) {
          const content = readFileSync(logPath, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());
          setLogContent(prev => {
            if (prev.length === lines.length && prev.join('\n') === lines.join('\n')) {
              return prev;
            }
            return lines;
          });
        }
      } catch {
        // Silently fail if log doesn't exist yet
        setLogContent(prev => {
          if (prev.length === 1 && prev[0] === 'No log file found. Run Ralph to generate logs.') {
            return prev;
          }
          return ['No log file found. Run Ralph to generate logs.'];
        });
      }
    };

    // Watch log file for changes
    useEffect(() => {
      loadLog();

      const LOG_WATCH_INTERVAL_MS = 5000;
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
      const interval = setInterval(updateSessionInfo, 60000);

      return () => clearInterval(interval);
    }, [projectPath]);

    // Check story complexity when selected story changes
    useEffect(() => {
      if (selectedStory) {
        const warning = analyzeStoryComplexity(selectedStory);
        setComplexityWarning(warning);
      } else {
        setComplexityWarning(null);
      }
    }, [selectedStory]);

    // Handle keyboard input for view switching and scrolling
    useInput(
      (input, key) => {
        // Search mode handling
        if (isSearchMode) {
          if (key.escape) {
            setIsSearchMode(false);
            setSearchInput('');
            search.exitSearch();
            return;
          }
          if (key.return) {
            setIsSearchMode(false);
            return;
          }
          if (key.backspace || key.delete) {
            const newQuery = searchInput.slice(0, -1);
            setSearchInput(newQuery);
            search.updateSearchQuery(newQuery);
            return;
          }
          if (input && input.length === 1 && !key.ctrl && !key.meta) {
            const newQuery = searchInput + input;
            setSearchInput(newQuery);
            search.updateSearchQuery(newQuery);
            return;
          }
          return;
        }

        // '/' to start search (only in monitor view)
        if (input === '/' && currentView === 'monitor') {
          setIsSearchMode(true);
          setSearchInput('');
          search.startSearch('');
          return;
        }

        // 'n' for next match, 'N' for previous match
        if (input === 'n' && search.searchState.totalMatches > 0) {
          search.nextMatch();
          const matchLine = search.currentMatchLineIndex;
          if (matchLine !== undefined && matchLine >= 0) {
            setScrollOffset(Math.max(0, matchLine - Math.floor((height - 3) / 2)));
          }
          return;
        }
        if (input === 'N' && search.searchState.totalMatches > 0) {
          search.previousMatch();
          const matchLine = search.currentMatchLineIndex;
          if (matchLine !== undefined && matchLine >= 0) {
            setScrollOffset(Math.max(0, matchLine - Math.floor((height - 3) / 2)));
          }
          return;
        }

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
          setCurrentView('quota');
          return;
        }
        if (input === '5') {
          setCurrentView('plan');
          return;
        }
        if (input === '6') {
          setCurrentView('help');
          return;
        }
        if (input === '7') {
          setCurrentView('version');
          return;
        }
        if (input === '8') {
          setCurrentView('costs');
          return;
        }

        // Skip scroll handling for version view - it has its own scroll handler
        if (currentView !== 'version') {
          if (input === 'j' || key.downArrow) {
            setScrollOffset(prev => {
              const maxScroll = Math.max(0, getMaxScrollForView() - (height - 3));
              return Math.min(prev + 1, maxScroll);
            });
          }
          if (input === 'k' || key.upArrow) {
            setScrollOffset(prev => Math.max(0, prev - 1));
          }
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

        // 'R' or 'r' to refresh quotas (only in quota view)
        if ((input === 'r' || input === 'R') && currentView === 'quota' && !isRefreshingQuota) {
          setIsRefreshingQuota(true);
          notify('info', 'Refreshing quotas...');

          // Use setTimeout to ensure UI updates before the async operation
          setTimeout(async () => {
            try {
              await refreshQuotas(true); // Force refresh
              notify('success', 'Quotas refreshed successfully');
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Failed to refresh quotas';
              notify('error', errorMessage);
            } finally {
              setIsRefreshingQuota(false);
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
      phase: 'idle' | 'running' | 'verifying' | 'complete' | 'failed' | 'paused';
      acResults: { id: string; passed: boolean | null }[];
      acPassed: number;
      acTotal: number;
      storiesComplete: number;
      storiesTotal: number;
      lastDuration: string | null;
      recentActivity: string[];
      projectComplete: boolean;
    }

    const isJsonOrCode = (l: string): boolean => {
      const trimmed = l.trim();
      if (!trimmed) return true;
      // Allow lines starting with [ if they look like log prefixes: [INFO], [WARN], etc.
      if (trimmed.startsWith('[') && /^\[[A-Z]+\]/.test(trimmed)) return false;
      // Detect JSON fragments: lines with multiple "key": patterns (e.g. "agents":["Bash",...])
      const jsonKeyCount = (l.match(/"[a-zA-Z_]+"\s*:/g) || []).length;
      if (jsonKeyCount >= 2) return true;
      return (
        trimmed.startsWith('{') ||
        trimmed.startsWith('[') ||
        trimmed.startsWith('"') ||
        l.includes('tool_use_id') ||
        l.includes('"type":') ||
        l.includes('"message":') ||
        l.includes('"content":') ||
        l.includes('"tool_use_result"') ||
        l.includes('"tool_result"') ||
        /^\s*[)}{\[\]];?\s*$/.test(l) ||
        /^\s*(const|let|var|function|import|export|await|return|if|for|while)\s/.test(l) ||
        /^\s*\d+[→\-]/.test(l) ||
        l.includes('# Mark as')
      );
    };

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
              l.includes('PROJECT') ||
              l.includes('[OK]') ||
              l.includes('[WARN]') ||
              l.includes('[ERROR]') ||
              l.includes('[ERR]') ||
              l.includes('[INFO]') ||
              l.includes('[...]') ||
              l.includes('Implementing') ||
              l.includes('Creating') ||
              l.includes('Updating') ||
              l.includes('Running') ||
              l.includes('Testing') ||
              l.includes('Tmux session') ||
              l.includes('Session PID') ||
              l.includes('Mode:') ||
              l.includes('Model:') ||
              l.includes('Claude')),
        )
        .slice(-6);
      data.recentActivity = activityLines.map(l => l.replace(/[═─]/g, '').trim()).filter(Boolean);

      return data;
    };

    const renderMonitor = () => {
      // Use filtered content for monitor view
      const data = parseMonitorData(filteredLogContent);
      const boxWidth = Math.max(40, width - 4);

      // When process is running, use props as fallback for data the parser hasn't extracted yet
      if (processState === 'running' || processState === 'external') {
        if (!data.currentStoryId && currentStory) {
          data.currentStoryId = currentStory;
        }
        if (!data.cli && availableCLI) {
          data.cli = availableCLI;
        }
        if (data.phase === 'idle') {
          data.phase = 'running';
        }
      }

      if (processState === 'paused' || processState === 'stopping') {
        if (!data.currentStoryId && currentStory) {
          data.currentStoryId = currentStory;
        }
        if (!data.cli && availableCLI) {
          data.cli = availableCLI;
        }
        data.phase = 'paused';
      }

      const phaseColor =
        data.phase === 'complete'
          ? theme.success
          : data.phase === 'failed'
            ? theme.error
            : data.phase === 'verifying'
              ? theme.warning
              : data.phase === 'running'
                ? theme.accent
                : data.phase === 'paused'
                  ? theme.warning
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
                : data.phase === 'paused'
                  ? '⏸ PAUSED'
                  : '○ IDLE';

      if (allStoriesComplete) {
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
        const hasFilter = logFilter.level !== 'all';
        const filteredCount = logContent.length - filteredLogContent.length;

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
              {hasFilter && filteredCount > 0 && (
                <Text color={theme.warning}>({filteredCount} lines filtered)</Text>
              )}
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
                {prdCLI && data.cli === prdCLI && <Text color={theme.accent}>*</Text>}
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

                  // Find the line index in the filtered content array for proper highlighting
                  const lineIndex = filteredLogContent.indexOf(line);
                  const highlighted =
                    lineIndex >= 0 ? highlightMatch(shortLine, lineIndex) : shortLine;

                  return (
                    <Text key={i} color={textColor}>
                      {icon} {highlighted}
                    </Text>
                  );
                })
              ) : (
                <Text dimColor>No activity</Text>
              )}
            </Box>
          </Box>

          {(processState === 'running' || processState === 'paused') && (() => {
            // Determine if we have structured agent activity data
            const hasActivity = agentActivity && (
              agentActivity.metrics.toolCallCount > 0 ||
              agentActivity.isThinking ||
              agentActivity.currentTool
            );

            // Map tool names to dot colors matching Claude Code's visual language
            const getToolDotColor = (toolName?: string): string => {
              switch (toolName) {
                case 'Write':
                case 'Edit':
                case 'NotebookEdit':
                  return theme.warning;          // amber — file mutations
                case 'Bash':
                  return theme.accentSecondary;  // orange — shell commands
                case 'Read':
                case 'Glob':
                case 'Grep':
                case 'LSP':
                  return theme.accent;           // mint/teal — read-only ops
                case 'Task':
                  return theme.info;             // purple — delegation
                default:
                  return theme.success;          // green — default/text
              }
            };

            // Truncate text with ellipsis
            const truncate = (text: string, maxLen: number): string =>
              maxLen > 0 && text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;

            // Helper: render a single OutputLine
            const renderOutputLine = (ol: OutputLine, i: number, lines: OutputLine[]): React.ReactNode => {
              const maxContent = boxWidth - 6;
              // Add spacing before tool_start and text block starts
              const prev = i > 0 ? lines[i - 1] : undefined;
              const needsSpacing = (ol.type === 'tool_start' && prev && prev.type !== 'tool_start')
                || (ol.type === 'text' && ol.isBlockStart && prev && prev.type !== 'text');

              switch (ol.type) {
                case 'tool_start': {
                  const dotColor = getToolDotColor(ol.toolName);
                  const name = ol.toolName || ol.content;
                  const maxInput = boxWidth - name.length - 8;
                  const input = ol.toolInput ? truncate(ol.toolInput, maxInput) : '';
                  return (
                    <Box key={i} flexDirection="column">
                      {needsSpacing && <Box height={1} />}
                      <Box>
                        <Text color={dotColor} bold>{'● '}</Text>
                        <Text bold color={dotColor}>{name}</Text>
                        {input ? <Text dimColor>{'  '}{input}</Text> : null}
                      </Box>
                    </Box>
                  );
                }
                case 'text':
                  if (ol.isBlockStart) {
                    return (
                      <Box key={i} flexDirection="column">
                        {needsSpacing && <Box height={1} />}
                        <Box width={boxWidth - 4}>
                          <Text color={theme.success} bold>{'● '}</Text>
                          <Text>{truncate(ol.content, maxContent)}</Text>
                        </Box>
                      </Box>
                    );
                  }
                  return (
                    <Box key={i} width={boxWidth - 4}>
                      <Text>{'  '}</Text>
                      <Text>{truncate(ol.content, maxContent)}</Text>
                    </Box>
                  );
                case 'system':
                  return (
                    <Box key={i} width={boxWidth - 4}>
                      <Text dimColor>{'  '}{truncate(ol.content, maxContent)}</Text>
                    </Box>
                  );
                case 'result':
                  return (
                    <Box key={i} width={boxWidth - 4}>
                      <Text dimColor>{'  '}{truncate(ol.content, maxContent)}</Text>
                    </Box>
                  );
                default:
                  return null;
              }
            };

            // Compact Agent Activity metrics strip (always visible when data available)
            const activityStrip = hasActivity && agentActivity ? (() => {
              const elapsed = agentActivity.startedAt
                ? Math.floor((Date.now() - agentActivity.startedAt) / 1000)
                : 0;
              const elapsedStr = elapsed > 0 ? `${elapsed}s` : '';

              let actionIcon = '⏳';
              let actionText = 'Waiting...';
              let actionColor = theme.muted;
              if (agentActivity.currentTool) {
                actionIcon = '▶';
                actionText = agentActivity.currentTool;
                actionColor = theme.accent;
              } else if (agentActivity.isThinking) {
                actionIcon = '💭';
                actionText = 'Thinking...';
                actionColor = theme.warning;
              }

              const inTok = formatTokens(agentActivity.metrics.totalInputTokens);
              const outTok = formatTokens(agentActivity.metrics.totalOutputTokens);
              const cost = formatCost(agentActivity.metrics.costUSD);
              const toolCount = agentActivity.metrics.toolCallCount;
              const modelName = agentActivity.metrics.model || 'unknown';
              const shortModel = modelName.includes('sonnet') ? 'sonnet'
                : modelName.includes('opus') ? 'opus'
                : modelName.includes('haiku') ? 'haiku'
                : modelName.length > 20 ? modelName.slice(0, 17) + '...' : modelName;

              const inputSummary = agentActivity.currentToolInput
                ? (agentActivity.currentToolInput.length > boxWidth - 30
                    ? agentActivity.currentToolInput.slice(0, boxWidth - 33) + '...'
                    : agentActivity.currentToolInput)
                : agentActivity.isThinking && agentActivity.lastThinkingSnippet
                  ? (agentActivity.lastThinkingSnippet.length > boxWidth - 30
                      ? agentActivity.lastThinkingSnippet.slice(0, boxWidth - 33) + '...'
                      : agentActivity.lastThinkingSnippet)
                  : '';

              return (
                <Box
                  borderStyle="single"
                  borderColor={theme.accent}
                  flexDirection="column"
                  width={boxWidth}
                >
                  <Box paddingX={1} justifyContent="space-between">
                    <Text bold color={theme.accent}>Agent Activity</Text>
                    {elapsedStr && <Text dimColor>({elapsedStr})</Text>}
                  </Box>
                  <Box paddingX={1}>
                    <Text color={actionColor} bold>{actionIcon} {actionText}</Text>
                    {inputSummary ? <Text dimColor>{'  '}{inputSummary}</Text> : null}
                  </Box>
                  <Box paddingX={1} gap={2}>
                    <Text color={theme.muted}>{shortModel}</Text>
                    <Text dimColor>{inTok}in {outTok}out</Text>
                    <Text color={theme.warning}>{cost}</Text>
                    <Text dimColor>{toolCount}↹</Text>
                  </Box>
                </Box>
              );
            })() : null;

            // Calculate available rows for CLI Output lines
            const WORKPANE_CHROME = 5;  // outer border(2) + header bar with border(3)
            const STORY_ROWS = 5;       // border(2) + 3 content rows
            const AC_ROWS = 4;          // border(2) + header(1) + icons(1)
            const activityLines = Math.max(1, Math.min(6, data.recentActivity.length));
            const ACTIVITY_ROWS = 4 + activityLines;  // border(2) + header(1) + paddingY top(1) + lines
            const AGENT_ROWS = hasActivity ? 5 : 0;   // border(2) + 3 content rows
            const failedACs = data.acResults.filter(r => r?.passed === false);
            const showFailed = failedACs.length > 0 && selectedStory && data.currentStoryId === selectedStory.id;
            const FAILED_ROWS = showFailed ? 3 + failedACs.length : 0;
            const PROGRESS_ROWS = 3;    // border(2) + 1 content
            const CLI_CHROME = 3;       // border(2) + header(1)

            const fixedRows = STORY_ROWS + AC_ROWS + ACTIVITY_ROWS + AGENT_ROWS + FAILED_ROWS + PROGRESS_ROWS;
            const availableOutputLines = Math.max(3, (height - WORKPANE_CHROME) - fixedRows - CLI_CHROME);

            // CLI Output panel with structured rendering
            const cliOutputPanel = liveOutput.length > 0 ? (
              <Box
                borderStyle="single"
                borderColor={theme.border}
                flexDirection="column"
                width={boxWidth}
                height={availableOutputLines + CLI_CHROME}
              >
                <Box paddingX={1}>
                  <Text bold color={theme.accent}>CLI Output</Text>
                  <Text dimColor> (live)</Text>
                </Box>
                <Box paddingX={1} paddingY={0} flexDirection="column" gap={0}>
                  {(() => {
                    const visible = liveOutput.slice(-availableOutputLines);
                    return visible.map((ol, i) => renderOutputLine(ol, i, visible));
                  })()}
                </Box>
              </Box>
            ) : null;

            // If we have either strip or output, show them
            if (activityStrip || cliOutputPanel) {
              return (
                <>
                  {activityStrip}
                  {cliOutputPanel}
                </>
              );
            }

            // No output yet — show starting message
            return (
              <Box
                borderStyle="single"
                borderColor={theme.border}
                flexDirection="column"
                width={boxWidth}
              >
                <Box paddingX={1}>
                  <Text bold color={theme.accent}>Agent Activity</Text>
                </Box>
                <Box paddingX={1}>
                  <Text color={theme.muted}>Claude is starting...</Text>
                </Box>
              </Box>
            );
          })()}

          {data.acResults.some(r => r?.passed === false) &&
            selectedStory &&
            data.currentStoryId === selectedStory.id && (
              <Box
                borderStyle="single"
                borderColor={theme.error}
                flexDirection="column"
                width={boxWidth}
              >
                <Box paddingX={1}>
                  <Text bold color={theme.error}>
                    Failed Criteria
                  </Text>
                </Box>
                <Box paddingX={1} flexDirection="column" gap={0}>
                  {data.acResults.map((result, i) => {
                    if (result?.passed !== false) return null;
                    const ac = selectedStory.acceptanceCriteria[i];
                    if (!ac) return null;
                    const acText = typeof ac === 'string' ? ac : ac.text;
                    const testCmd = typeof ac === 'string' ? null : ac.testCommand;
                    const maxLen = boxWidth - 6;
                    const shortText =
                      acText.length > maxLen ? acText.slice(0, maxLen - 3) + '...' : acText;
                    return (
                      <Box key={i} flexDirection="column">
                        <Text color={theme.error}>
                          ✗ AC-{i + 1}: {shortText}
                        </Text>
                        {testCmd && (
                          <Text dimColor>
                            {' '}
                            test:{' '}
                            {testCmd.length > maxLen - 8
                              ? testCmd.slice(0, maxLen - 11) + '...'
                              : testCmd}
                          </Text>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}

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
            {processPid && <Text dimColor> (PID {processPid})</Text>}
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
            {prdCLI && availableCLI === prdCLI && (
              <Text color={theme.accent}> (project override)</Text>
            )}
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
              {retryCount > 0 && <Text color={theme.warning}> (attempt {retryCount + 1})</Text>}
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
            Session Cost & Context
          </Text>
          <Text>
            <Text dimColor>Total Cost: </Text>
            <Text color={theme.warning}>{formatCost(sessionInfo.cost.cost)}</Text>
          </Text>
          <Text>
            <Text dimColor>Tokens: </Text>
            <Text>
              {formatTokens(sessionInfo.cost.tokens.input)} in /{' '}
              {formatTokens(sessionInfo.cost.tokens.output)} out
            </Text>
          </Text>
          <Text>
            <Text dimColor>Context Quota (5h): </Text>
            <Text
              color={
                sessionInfo.contextBudget.exceeded
                  ? theme.error
                  : sessionInfo.contextBudget.approaching
                    ? theme.warning
                    : theme.success
              }
            >
              {Math.round(sessionInfo.contextBudget.fiveHourPercent)}%
              {sessionInfo.contextBudget.exceeded && ' ⚠ EXCEEDED'}
              {sessionInfo.contextBudget.approaching &&
                !sessionInfo.contextBudget.exceeded &&
                ' ⚠ HIGH'}
            </Text>
          </Text>
          {sessionInfo.contextBudget.fiveHourResetsAt && (
            <Text dimColor>
              Resets: {new Date(sessionInfo.contextBudget.fiveHourResetsAt).toLocaleTimeString()}
            </Text>
          )}
          <Text> </Text>
          <Text bold color={theme.accent}>
            Running Processes ({processState === 'running' ? 1 : sessionInfo.processes.length})
          </Text>
          {processState === 'running' && processPid ? (
            <Text>
              <Text color={theme.success}>●</Text>
              <Text> claude </Text>
              <Text dimColor>(PID: {processPid})</Text>
              {currentStory && <Text color={theme.accent}> → {currentStory}</Text>}
            </Text>
          ) : sessionInfo.processes.length === 0 ? (
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
      ];

      // Add complexity warning box if story is too complex
      if (complexityWarning?.isComplex) {
        visibleContent.push(
          <Box
            key="complexity-warning"
            flexDirection="column"
            borderStyle="round"
            borderColor={theme.warning}
            paddingX={1}
            paddingY={0}
          >
            <Text bold color={theme.warning}>
              ⚠ Story May Be Too Complex
            </Text>
            <Text key="warning-space1"> </Text>
            {complexityWarning.reasons.map((reason, idx) => (
              <Text key={`reason-${idx}`} color={theme.warning}>
                • {reason}
              </Text>
            ))}
            <Text key="warning-space2"> </Text>
            <Text dimColor wrap="wrap">
              Story is too complex. Consider breaking this into smaller stories (breakDown into
              subtasks) for better success rates.
            </Text>
          </Box>,
          <Text key="space-after-warning"> </Text>,
        );
      }

      visibleContent.push(
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
      );

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
            { key: 'j/k or ↑↓', desc: 'Navigate / scroll' },
            { key: 'g', desc: 'Go to story by number (sessions pane)' },
          ],
        },
        {
          title: 'Actions',
          items: [
            { key: 'r', desc: 'Run Ralph on current project' },
            { key: 'R', desc: 'Retry current story' },
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
            { key: '4', desc: 'Quota (provider quotas)' },
            { key: '5', desc: 'Plan (execution plan)' },
            { key: '6', desc: 'Help (this view)' },
            { key: '7', desc: 'Version (system info)' },
            { key: '8', desc: 'Costs (cost tracking)' },
          ],
        },
        {
          title: 'Search (Monitor view)',
          items: [
            { key: '/', desc: 'Start search' },
            { key: 'n', desc: 'Next match' },
            { key: 'N', desc: 'Previous match' },
            { key: 'f', desc: 'Cycle log filter (all/errors/warnings)' },
            { key: 'Esc', desc: 'Cancel search' },
          ],
        },
        {
          title: 'Details View',
          items: [{ key: 'T', desc: 'Run acceptance tests' }],
        },
        {
          title: 'Execution Plan',
          items: [
            { key: 'm / M', desc: 'Cycle execution mode' },
            { key: 'r / R', desc: 'Refresh plan' },
          ],
        },
        {
          title: 'Tabs',
          items: [
            { key: 'Ctrl+Shift+T', desc: 'Open new tab' },
            { key: 'e', desc: 'Close current tab' },
          ],
        },
        {
          title: 'Interface',
          items: [
            { key: '?', desc: 'Welcome overlay' },
            { key: 't', desc: 'Theme settings' },
            { key: 'd', desc: 'Toggle debug mode' },
            { key: ': / Ctrl+P', desc: 'Command palette' },
            { key: 'Ctrl+L', desc: 'Clear session' },
            { key: 'c', desc: 'Copy remote URL' },
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
        case 'quota':
          return <QuotaDashboard width={width - 4} />;
        case 'plan':
          return <ExecutionPlanView projectPath={projectPath} height={height - 6} />;
        case 'help':
          return renderHelp();
        case 'version':
          return <VersionView height={height - 4} isFocused={isFocused} />;
        case 'costs':
          return <CostDashboard />;
        default:
          return renderMonitor();
      }
    };

    // Get filter display text
    const getFilterDisplay = () => {
      if (currentView !== 'monitor' || !logFilter) return '';

      const filterLabels: Record<LogFilterLevel, string> = {
        all: 'All',
        errors: 'Errors',
        warnings_errors: 'Warn+Err',
      };

      return filterLabels[logFilter.level as LogFilterLevel];
    };

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
          {isSearchMode ? (
            <>
              <Text color={theme.accent}>/</Text>
              <Text>{searchInput}</Text>
              <Text color={theme.muted}>_</Text>
              {search.searchState.totalMatches > 0 && (
                <Text dimColor>
                  {' '}
                  [{search.searchState.currentMatchIndex + 1}/{search.searchState.totalMatches}]
                </Text>
              )}
              {searchInput && search.searchState.totalMatches === 0 && (
                <Text color={theme.error}> (no matches)</Text>
              )}
              <Text dimColor> [Enter to confirm, Esc to cancel]</Text>
            </>
          ) : (
            <>
              <Text bold color={theme.accent}>
                Work: {(() => {
                  const num = VIEW_NUMBERS[currentView] ?? '?';
                  const label = currentView.charAt(0).toUpperCase() + currentView.slice(1);
                  return `[${num}] ${label}`;
                })()}
              </Text>
              {currentView === 'monitor' && logFilter && (
                <>
                  <Text dimColor> | Filter: </Text>
                  <Text color={logFilter.level === 'all' ? theme.muted : theme.warning}>
                    {getFilterDisplay()}
                  </Text>
                  <Text dimColor> [f]</Text>
                </>
              )}
              {currentView === 'monitor' && search.searchState.searchQuery && !isSearchMode && (
                <>
                  <Text dimColor> | Search: </Text>
                  <Text color={theme.accent}>{search.searchState.searchQuery}</Text>
                  <Text dimColor>
                    {' '}
                    [{search.searchState.currentMatchIndex + 1}/{search.searchState.totalMatches}]
                  </Text>
                </>
              )}
              <Text dimColor> [1-8 to switch]</Text>
            </>
          )}
        </Box>

        {/* View content */}
        <Box flexDirection="column" flexGrow={1}>
          {renderCurrentView()}
        </Box>
      </Box>
    );
  },
);
