import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  unlinkSync,
  appendFileSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from 'fs';
import { join, basename } from 'path';
import { homedir, tmpdir } from 'os';

/**
 * Load plugins from an OpenCode config file (with JSONC support).
 * Returns array of plugin strings or empty array on error.
 */
function loadPluginsFromConfig(configPath: string): string[] {
  if (!existsSync(configPath)) {
    return [];
  }
  try {
    const raw = readFileSync(configPath, 'utf-8');
    // Basic JSONC support: strip // and /* */ comments
    const withoutBlock = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    const withoutLine = withoutBlock.replace(/^\s*\/\/.*$/gm, '');
    const parsed = JSON.parse(withoutLine);
    const plugins = parsed?.plugin;
    return Array.isArray(plugins) ? plugins.filter((p: unknown) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Create a Ralph-specific OpenCode config for headless execution.
 * Filters non-auth plugins and auto-approves all permissions.
 * Returns the path to the config file.
 */
function ensureRalphOpencodeConfig(projectPath: string): string {
  const ralphDir = join(projectPath, '.ralph');
  if (!existsSync(ralphDir)) {
    mkdirSync(ralphDir, { recursive: true });
  }

  const configPath = join(ralphDir, 'ralph-opencode.config.json');
  const userConfigPath = join(
    process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'),
    'opencode',
    'opencode.json',
  );
  const projectConfigPath = join(projectPath, '.ralph', 'opencode.json');
  const legacyProjectConfigPath = join(projectPath, '.opencode', 'opencode.json');

  // Collect plugins from all config sources
  const plugins = [
    ...loadPluginsFromConfig(userConfigPath),
    ...loadPluginsFromConfig(projectConfigPath),
    ...loadPluginsFromConfig(legacyProjectConfigPath),
  ];

  // Filter to only keep auth plugins (for API authentication)
  const authPlugins = Array.from(new Set(plugins)).filter(p => /auth/i.test(p));

  // Build config with auto-approved permissions for non-interactive use
  const config: Record<string, unknown> = {
    $schema: 'https://opencode.ai/config.json',
    plugin: authPlugins,
    permission: {
      read: 'allow',
      edit: 'allow',
      glob: 'allow',
      grep: 'allow',
      list: 'allow',
      bash: 'allow',
      task: 'allow',
      webfetch: 'allow',
      websearch: 'allow',
      codesearch: 'allow',
      todowrite: 'allow',
      todoread: 'allow',
      question: 'allow',
      lsp: 'allow',
      external_directory: 'allow',
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}
import type { PRD, UserStory, AgentActivity, OutputLine } from '../types';
import { isTestableAC } from '../types';
import { runStoryTestsAndSave, markStoryPassedInPRD, type ACTestResult } from './ac-runner';
import { checkApiStatus, shouldWarnAboutStatus } from './status-check';
import { loadSettings } from './config';
import { CostTracker } from '../core/cost-tracker';
import { LearningRecorder } from '../core/learning-recorder';
import type { Provider, ExecutionPlan, TaskType } from '../core/types';
import { generateExecutionPlan } from '../core/execution-planner';

export type ProcessState = 'idle' | 'running' | 'stopping' | 'paused' | 'external';

export interface RalphStatus {
  state: ProcessState;
  startTime?: number;
  exitCode?: number;
  duration?: number;
  error?: string;
  currentStory?: string;
  acTestsPassed?: number;
  acTestsTotal?: number;
  storyPassed?: boolean;
  pid?: number;
  retryCount?: number;
  tmuxSession?: string;
}

export interface StoryProgress {
  storyId: string;
  attempts: number;
  lastAttempt: string;
  passed: boolean;
  failureReasons?: string[];
  sessionId?: string;
  paused?: boolean;
  passingACs?: string[];
  failingACs?: string[];
}

export interface ExecutionProgress {
  startedAt: string;
  lastUpdated: string;
  stories: StoryProgress[];
}

const MAX_RETRIES_PER_STORY = 3;
const MAX_ITERATIONS = 10;
const LOG_POLL_INTERVAL_MS = 500;
const DEFAULT_MODEL = 'sonnet';
const DEFAULT_CLAUDE_MODEL_ID = 'claude-sonnet-4-20250514';

// Anthropic models use Claude CLI, all other providers use OpenCode CLI
const ANTHROPIC_MODELS = [
  'claude-opus-4-20250514',
  'claude-sonnet-4-20250514',
  'claude-3-5-haiku-20241022',
];

// Story complexity thresholds
const MAX_DESCRIPTION_WORDS = 100;
const MAX_AC_COUNT = 7;
// Model pricing: $ per million tokens (input, output)
const MODEL_PRICING: Record<string, { inputPricePerM: number; outputPricePerM: number }> = {
  'claude-sonnet': { inputPricePerM: 3.0, outputPricePerM: 15.0 },
  'claude-opus': { inputPricePerM: 15.0, outputPricePerM: 75.0 },
  'claude-haiku': { inputPricePerM: 0.8, outputPricePerM: 4.0 },
};

const DEFAULT_PRICING = MODEL_PRICING['claude-sonnet']!;

function getModelPricing(modelId: string | null): {
  inputPricePerM: number;
  outputPricePerM: number;
} {
  if (!modelId) return DEFAULT_PRICING;
  const lower = modelId.toLowerCase();
  if (lower.includes('opus')) return MODEL_PRICING['claude-opus']!;
  if (lower.includes('haiku')) return MODEL_PRICING['claude-haiku']!;
  if (lower.includes('sonnet')) return MODEL_PRICING['claude-sonnet']!;
  return DEFAULT_PRICING;
}

const COMPLEX_KEYWORDS = [
  'refactor entire',
  'migrate all',
  'rewrite',
  'redesign',
  'overhaul',
  'rearchitect',
  'comprehensive refactor',
  'system-wide',
  'cross-cutting',
  'breaking change',
];

export interface ComplexityWarning {
  isComplex: boolean;
  reasons: string[];
  wordCount?: number;
  acCount?: number;
  hasComplexKeywords?: boolean;
}

/**
 * Standalone complexity analysis - no RalphService instance needed
 */
export function analyzeStoryComplexity(story: UserStory): ComplexityWarning {
  const reasons: string[] = [];

  const wordCount = story.description.trim().split(/\s+/).length;
  if (wordCount > MAX_DESCRIPTION_WORDS) {
    reasons.push(`Description too long (${wordCount} words, max ${MAX_DESCRIPTION_WORDS})`);
  }

  const acCount = story.acceptanceCriteria.length;
  if (acCount > MAX_AC_COUNT) {
    reasons.push(`Too many acceptance criteria (${acCount}, max ${MAX_AC_COUNT})`);
  }

  const combinedText = `${story.title} ${story.description}`.toLowerCase();
  const foundKeywords = COMPLEX_KEYWORDS.filter(keyword => combinedText.includes(keyword));
  const hasComplexKeywords = foundKeywords.length >= 1;
  if (hasComplexKeywords) {
    reasons.push(`Contains complexity keywords: ${foundKeywords.join(', ')}`);
  }

  if (story.complexity === 'complex' && (wordCount > 50 || acCount > 5)) {
    reasons.push('Marked as complex with high AC count or word count');
  }

  return {
    isComplex: reasons.length >= 2,
    reasons,
    wordCount,
    acCount,
    hasComplexKeywords,
  };
}

interface CLIHealthCache {
  cli: string;
  healthy: boolean;
  checkedAt: number;
}

const CLI_HEALTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class RalphService {
  private state: ProcessState = 'idle';
  private startTime?: number;
  private currentStoryId?: string;
  private lastStoryId?: string;
  private outputCallback?: (line: string, type: 'stdout' | 'stderr') => void;
  private statusCallback?: (status: RalphStatus) => void;
  private projectPath: string;
  private sessionCheckInterval?: ReturnType<typeof setInterval>;
  private logWatchInterval?: ReturnType<typeof setInterval>;
  private storyRetryCount: Map<string, number> = new Map();
  private storyIterationCount: Map<string, number> = new Map();
  private cliHealthCache: Map<string, CLIHealthCache> = new Map();
  private logFile: string;
  private sessionLogFile: string;
  private lastLogPosition: number = 0;
  private tmuxSessionName: string;
  private tmuxPid?: number;
  private progressFile: string;
  private executionProgress: ExecutionProgress;
  private debugMode: boolean = false;
  private costTracker: CostTracker;
  private learningRecorder: LearningRecorder;
  private executionPlan: ExecutionPlan | null = null;
  private currentSessionId?: string;
  private currentModelName?: string;
  private agentActivity: AgentActivity = this.createEmptyActivity();
  private toolInputBuffer: string = '';
  private currentBlockType: 'text' | 'tool_use' | null = null;
  private recentOutputLines: string[] = [];
  private structuredOutput: OutputLine[] = [];
  private liveTextAccumulator: string = '';
  private liveBlockType: 'text' | 'tool_use' | null = null;
  private liveToolName: string | null = null;
  private liveToolInputBuffer: string = '';
  private hasSeenDeltas: boolean = false;
  private stoppingTickCount: number = 0;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.tmuxSessionName = this.buildTmuxSessionName();
    this.costTracker = new CostTracker();
    this.learningRecorder = new LearningRecorder();

    const logsDir = join(projectPath, 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    this.logFile = join(logsDir, 'ralph-ultra.log');
    this.sessionLogFile = join(logsDir, 'ralph-session.log');
    this.progressFile = join(projectPath, 'progress.txt');

    // Initialize or load progress
    this.executionProgress = this.readProgress();

    this.log('INFO', `RalphService initialized for: ${projectPath}`);
    this.log('INFO', `Tmux session name: ${this.tmuxSessionName}`);
    this.checkTmuxSession();
    this.startSessionMonitor();
  }

  private log(level: string, message: string): void {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    try {
      appendFileSync(this.logFile, logLine);
    } catch {
      // Silent fail - logging should never break execution
    }

    // In debug mode, also output to TUI
    if (this.debugMode && this.outputCallback) {
      const debugLine = `[DEBUG] [${level}] ${message}`;
      this.outputCallback(debugLine, level === 'ERROR' || level === 'FAIL' ? 'stderr' : 'stdout');
    }
  }

  public setDebugMode(enabled: boolean): void {
    if (this.debugMode === enabled) return;
    this.debugMode = enabled;
    this.log('INFO', `Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  public getDebugMode(): boolean {
    return this.debugMode;
  }

  private buildTmuxSessionName(): string {
    const prdPath = join(this.projectPath, 'prd.json');
    try {
      const prdContent = readFileSync(prdPath, 'utf-8');
      const prd = JSON.parse(prdContent);
      const branchName = prd.branchName || `ralph/${prd.project || basename(this.projectPath)}`;
      const sessionName = branchName.replace(/[^a-zA-Z0-9_-]/g, '-');
      return `ralph-${sessionName}`;
    } catch {
      return `ralph-${basename(this.projectPath).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    }
  }

  private checkTmuxSession(): boolean {
    try {
      execSync(`tmux has-session -t "${this.tmuxSessionName}" 2>/dev/null`);

      if (this.state !== 'running' && this.state !== 'external') {
        this.state = 'external';
        this.tmuxPid = this.getTmuxPid();
        this.log(
          'INFO',
          `Found existing tmux session: ${this.tmuxSessionName} (PID: ${this.tmuxPid})`,
        );
        this.emitStatus({
          state: 'external',
          pid: this.tmuxPid,
          tmuxSession: this.tmuxSessionName,
        });
        this.startLogTailing();
      }
      return true;
    } catch {
      if (this.state === 'external') {
        this.state = 'idle';
        this.stopLogTailing();
        this.emitStatus({ state: 'idle' });
      }
      return false;
    }
  }

  private getTmuxPid(): number | undefined {
    try {
      const output = execSync(
        `tmux list-panes -t "${this.tmuxSessionName}" -F "#{pane_pid}" 2>/dev/null`,
        { encoding: 'utf-8' },
      );
      const pid = parseInt(output.trim().split('\n')[0] || '', 10);
      return isNaN(pid) ? undefined : pid;
    } catch {
      return undefined;
    }
  }

  /**
   * Kill the current tmux session to prevent race conditions.
   * Called before setting state to 'idle' after verification completes.
   * This prevents checkTmuxSession() from finding the old session and
   * setting state to 'external' before the retry setTimeout fires.
   */
  private killCurrentSession(): void {
    try {
      execSync(`tmux kill-session -t "${this.tmuxSessionName}" 2>/dev/null`);
      this.log('INFO', `Killed tmux session: ${this.tmuxSessionName}`);
    } catch {
      // Session may already be gone, that's fine
    }
  }

  /**
   * Reclaim an orphaned tmux session from a previous run.
   * When an old session is still alive, the constructor sets state to 'external'
   * before React callbacks are registered, leaving a mismatch. This helper kills
   * the orphaned session and resets to 'idle' so the user's intent to start
   * Ralph succeeds instead of throwing "Cannot start: process is external".
   */
  private reclaimExternalSession(): void {
    if (this.state !== 'external') return;

    this.log('INFO', `Reclaiming orphaned tmux session: ${this.tmuxSessionName}`);
    this.outputCallback?.(
      `[INFO] Found orphaned session "${this.tmuxSessionName}" — reclaiming...\n`,
      'stdout',
    );

    this.killCurrentSession();
    this.stopLogTailing();
    this.state = 'idle';
    this.tmuxPid = undefined;
    this.emitStatus({ state: 'idle' });
  }

  private startSessionMonitor(): void {
    this.sessionCheckInterval = setInterval(() => {
      if (this.state === 'running' || this.state === 'external') {
        this.stoppingTickCount = 0;
        if (!this.checkTmuxSession()) {
          this.handleSessionEnded();
        }
      } else if (this.state === 'stopping') {
        this.stoppingTickCount++;
        if (this.stoppingTickCount >= 3) {
          this.log(
            'WARN',
            `State stuck in 'stopping' for ${this.stoppingTickCount} ticks — force-resetting to idle`,
          );
          this.stoppingTickCount = 0;
          this.state = 'idle';
          this.stopLogTailing();
          this.emitStatus({ state: 'idle' });
        }
      } else if (this.state !== 'paused') {
        this.stoppingTickCount = 0;
        // Don't check for tmux sessions when paused (we intentionally killed it)
        this.checkTmuxSession();
      }
    }, 3000);
  }

  private handleSessionEnded(): void {
    this.log('INFO', `Session completed: ${this.tmuxSessionName}`);
    this.stopLogTailing();

    // Accept 'stopping'/'paused' states too — these indicate stop() was called
    // (e.g. by a React cleanup race) but the session actually completed normally.
    // Use lastStoryId as fallback since stop() clears currentStoryId.
    const storyId = this.currentStoryId || this.lastStoryId;
    if (
      storyId &&
      (this.state === 'running' || this.state === 'stopping' || this.state === 'paused')
    ) {
      const duration = this.startTime ? Date.now() - this.startTime : 0;

      // If session ended very quickly (< 10s), it may be a failed --resume
      if (duration < 10_000 && this.currentSessionId) {
        this.log(
          'WARN',
          `Session ended quickly (${duration}ms) - possible failed resume, clearing session ID`,
        );
        this.outputCallback?.(
          `\n⚠ Session ended quickly - clearing saved session for fresh start\n`,
          'stderr',
        );
        // Clear the session ID so next retry starts fresh
        const existingProgress = this.executionProgress.stories.find(
          s => s.storyId === storyId && s.sessionId === this.currentSessionId,
        );
        if (existingProgress) {
          existingProgress.sessionId = undefined;
          existingProgress.paused = false;
          this.writeProgress();
        }
        this.currentSessionId = undefined;
      }

      this.outputCallback?.(`\n═══ Session completed ═══\n`, 'stdout');

      const prd = this.loadPRD();
      const story = prd?.userStories.find(s => s.id === storyId);
      if (story) {
        // Restore state to 'running' so verifyAndContinue works correctly
        this.state = 'running';
        this.currentStoryId = storyId;
        this.verifyAndContinue(story, this.projectPath, duration, 0);
      } else {
        this.state = 'idle';
        this.currentStoryId = undefined;
        this.emitStatus({ state: 'idle', duration });
      }
    } else {
      this.log(
        'WARN',
        `handleSessionEnded: skipped verification (state=${this.state}, storyId=${storyId || 'none'})`,
      );
      this.state = 'idle';
      this.emitStatus({ state: 'idle' });
    }
  }

  private waitForCompletion(story: UserStory, _retryCount: number): void {
    const signalName = `${this.tmuxSessionName}-done`;
    this.log('INFO', `Waiting for completion signal: ${signalName}`);

    const { spawn } = require('child_process');
    const waiter = spawn('tmux', ['wait-for', signalName], {
      stdio: 'ignore',
      detached: true,
    });

    waiter.on('close', () => {
      this.log('INFO', `Received completion signal for ${story.id}`);
      this.handleSessionEnded();
    });

    waiter.on('error', (err: Error) => {
      this.log('ERROR', `Wait-for error: ${err.message}`);
      this.handleSessionEnded();
    });

    waiter.unref();
  }

  private startLogTailing(): void {
    if (this.logWatchInterval) return;

    this.lastLogPosition = 0;
    if (existsSync(this.sessionLogFile)) {
      const stats = statSync(this.sessionLogFile);
      this.lastLogPosition = stats.size;
    }

    this.logWatchInterval = setInterval(() => {
      this.tailSessionLog();
    }, LOG_POLL_INTERVAL_MS);
  }

  /**
   * Get recent structured output lines for live display.
   * Returns last N OutputLines from the structured ring buffer.
   */
  public getLiveOutput(maxLines: number = 25): OutputLine[] {
    return this.structuredOutput.slice(-maxLines);
  }

  /**
   * Push a structured OutputLine into the ring buffer.
   */
  private pushOutputLine(line: OutputLine): void {
    this.structuredOutput.push(line);
    if (this.structuredOutput.length > 100) {
      this.structuredOutput = this.structuredOutput.slice(-60);
    }
  }

  /**
   * Flush accumulated text into OutputLine entries (one per line).
   */
  private flushTextAccumulator(): void {
    if (!this.liveTextAccumulator) return;
    const lines = this.liveTextAccumulator.split('\n');
    let isFirst = true;
    for (const line of lines) {
      if (line.trim()) {
        this.pushOutputLine({
          type: 'text',
          content: line,
          isBlockStart: isFirst,
          timestamp: Date.now(),
        });
        isFirst = false;
      }
    }
    this.liveTextAccumulator = '';
  }

  /**
   * Parse a stream-json log line and produce structured OutputLine entries.
   * Called from tailSessionLog() alongside updateAgentActivity().
   */
  private updateLiveOutput(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Non-JSON — emit as system line
    if (!trimmed.startsWith('{')) {
      this.pushOutputLine({
        type: 'system',
        content: trimmed,
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const obj = JSON.parse(trimmed);

      switch (obj.type) {
        case 'message_start': {
          // New turn — reset delta tracking
          this.hasSeenDeltas = false;
          break;
        }

        case 'content_block_start': {
          const block = obj.content_block;
          if (block?.type === 'text') {
            // Flush any prior text
            this.flushTextAccumulator();
            this.liveBlockType = 'text';
          } else if (block?.type === 'tool_use') {
            // Flush text before switching to tool
            this.flushTextAccumulator();
            this.liveBlockType = 'tool_use';
            this.liveToolName = block.name || null;
            this.liveToolInputBuffer = '';
          }
          break;
        }

        case 'content_block_delta': {
          if (obj.delta?.type === 'text_delta' && this.liveBlockType === 'text') {
            const text = obj.delta.text || '';
            this.liveTextAccumulator += text;
            this.hasSeenDeltas = true;

            // Flush complete lines on newline
            if (this.liveTextAccumulator.includes('\n')) {
              const parts = this.liveTextAccumulator.split('\n');
              // All parts except last are complete lines
              const completeParts = parts.slice(0, -1);
              let isFirst =
                this.structuredOutput.length === 0 ||
                this.structuredOutput[this.structuredOutput.length - 1]?.type !== 'text';
              for (const part of completeParts) {
                if (part.trim()) {
                  this.pushOutputLine({
                    type: 'text',
                    content: part,
                    isBlockStart: isFirst,
                    timestamp: Date.now(),
                  });
                  isFirst = false;
                }
              }
              this.liveTextAccumulator = parts[parts.length - 1] || '';
            }
          } else if (obj.delta?.type === 'input_json_delta' && this.liveBlockType === 'tool_use') {
            this.liveToolInputBuffer += obj.delta.partial_json || '';
          }
          break;
        }

        case 'content_block_stop': {
          if (this.liveBlockType === 'text') {
            // Flush remaining text
            this.flushTextAccumulator();
          } else if (this.liveBlockType === 'tool_use' && this.liveToolName) {
            const summary = this.extractToolInputSummary(
              this.liveToolName,
              this.liveToolInputBuffer,
            );
            this.pushOutputLine({
              type: 'tool_start',
              content: this.liveToolName,
              toolName: this.liveToolName,
              toolInput: summary,
              isBlockStart: true,
              timestamp: Date.now(),
            });
            this.liveToolName = null;
            this.liveToolInputBuffer = '';
          }
          this.liveBlockType = null;
          break;
        }

        case 'assistant': {
          // Full assistant message (non-streaming fallback)
          if (!this.hasSeenDeltas && Array.isArray(obj.message?.content)) {
            for (const block of obj.message.content) {
              if (block.type === 'text' && block.text) {
                const lines = block.text.split('\n');
                let isFirst = true;
                for (const l of lines) {
                  if (l.trim()) {
                    this.pushOutputLine({
                      type: 'text',
                      content: l,
                      isBlockStart: isFirst,
                      timestamp: Date.now(),
                    });
                    isFirst = false;
                  }
                }
              } else if (block.type === 'tool_use') {
                const toolName = block.name || 'Tool';
                const inputStr = block.input ? JSON.stringify(block.input) : '';
                const summary = this.extractToolInputSummary(toolName, inputStr);
                this.pushOutputLine({
                  type: 'tool_start',
                  content: toolName,
                  toolName,
                  toolInput: summary,
                  isBlockStart: true,
                  timestamp: Date.now(),
                });
              }
            }
          }
          break;
        }

        case 'result': {
          // Optionally emit result summary
          if (obj.result && typeof obj.result === 'string') {
            this.pushOutputLine({
              type: 'result',
              content: obj.result,
              timestamp: Date.now(),
            });
          }
          break;
        }

        // message_stop, ping, etc. — ignore
        default:
          break;
      }
    } catch {
      // Malformed JSON — log and emit as system line so data loss is detectable
      this.log('DEBUG', `Malformed JSON in live output: ${trimmed.slice(0, 120)}`);
      this.pushOutputLine({
        type: 'system',
        content: trimmed,
        timestamp: Date.now(),
      });
    }
  }

  private stopLogTailing(): void {
    if (this.logWatchInterval) {
      clearInterval(this.logWatchInterval);
      this.logWatchInterval = undefined;
    }
  }

  /**
   * Parse a stream-json line from Claude CLI output.
   * Returns extracted text for display, or null if the line should be skipped.
   */
  private parseStreamJsonLine(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Not JSON — return as-is (non-Claude output like shell messages)
    if (!trimmed.startsWith('{')) return trimmed;

    try {
      const obj = JSON.parse(trimmed);

      // assistant message with content blocks containing text
      if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
        const texts: string[] = [];
        for (const block of obj.message.content) {
          if (block.type === 'text' && block.text) {
            texts.push(block.text);
          }
        }
        return texts.length > 0 ? texts.join('\n') : null;
      }

      // content_block_delta — streaming text chunk
      if (
        obj.type === 'content_block_delta' &&
        obj.delta?.type === 'text_delta' &&
        obj.delta?.text
      ) {
        return obj.delta.text;
      }

      // result — final output
      if (obj.type === 'result' && obj.result) {
        return typeof obj.result === 'string' ? obj.result : null;
      }

      // message_start, content_block_start, content_block_stop, message_stop, etc. — skip
      return null;
    } catch {
      // Malformed JSON — return raw line
      return trimmed;
    }
  }

  private tailSessionLog(): void {
    if (!existsSync(this.sessionLogFile)) return;

    try {
      const stats = statSync(this.sessionLogFile);
      if (stats.size <= this.lastLogPosition) return;

      const fd = openSync(this.sessionLogFile, 'r');
      const buffer = Buffer.alloc(stats.size - this.lastLogPosition);
      readSync(fd, buffer, 0, buffer.length, this.lastLogPosition);
      closeSync(fd);

      const newContent = buffer.toString('utf-8');
      const lines = newContent.split('\n');

      for (const line of lines) {
        if (line.trim()) {
          this.updateAgentActivity(line);
          this.updateLiveOutput(line);
          const parsed = this.parseStreamJsonLine(line);
          if (parsed !== null) {
            // Add to ring buffer (legacy, used by outputCallback for full log lines)
            this.recentOutputLines.push(parsed);
            if (this.recentOutputLines.length > 50) {
              this.recentOutputLines = this.recentOutputLines.slice(-30);
            }
            const isError = parsed.includes('[ERROR]') || parsed.includes('[ERR]');
            this.outputCallback?.(parsed, isError ? 'stderr' : 'stdout');
          }
        }
      }

      this.lastLogPosition = stats.size;
    } catch (err) {
      this.log('ERROR', `Failed to tail session log: ${err}`);
    }
  }

  public dispose(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
    }
    this.stopLogTailing();
  }

  public onOutput(callback: (line: string, type: 'stdout' | 'stderr') => void): void {
    this.outputCallback = callback;
  }

  public onStatusChange(callback: (status: RalphStatus) => void): void {
    this.statusCallback = callback;
  }

  private loadPRD(): PRD | null {
    try {
      const prdPath = join(this.projectPath, 'prd.json');
      const content = readFileSync(prdPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private backupPRD(): string | null {
    const prdPath = join(this.projectPath, 'prd.json');
    if (!existsSync(prdPath)) return null;

    try {
      const backupDir = join(this.projectPath, '.ralph-backups');
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }

      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      const backupPath = join(backupDir, `prd_${timestamp}.json`);

      copyFileSync(prdPath, backupPath);

      const latestPath = join(backupDir, 'prd_latest.json');
      copyFileSync(prdPath, latestPath);

      this.cleanupOldBackups(backupDir, 20);

      return backupPath;
    } catch (err) {
      this.outputCallback?.(`[WARN] Failed to backup PRD: ${err}\n`, 'stderr');
      return null;
    }
  }

  private cleanupOldBackups(backupDir: string, keepCount: number): void {
    try {
      const { readdirSync, statSync, unlinkSync } = require('fs');
      const files = readdirSync(backupDir)
        .filter(
          (f: string) => f.startsWith('prd_') && f.endsWith('.json') && f !== 'prd_latest.json',
        )
        .map((f: string) => ({
          name: f,
          path: join(backupDir, f),
          mtime: statSync(join(backupDir, f)).mtime.getTime(),
        }))
        .sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);

      for (let i = keepCount; i < files.length; i++) {
        unlinkSync(files[i].path);
      }
    } catch (_) {
      void _;
    }
  }

  public restorePRDFromBackup(): boolean {
    const latestBackup = join(this.projectPath, '.ralph-backups', 'prd_latest.json');
    const prdPath = join(this.projectPath, 'prd.json');

    if (!existsSync(latestBackup)) {
      this.outputCallback?.('[ERROR] No backup found to restore from\n', 'stderr');
      return false;
    }

    try {
      copyFileSync(latestBackup, prdPath);
      this.outputCallback?.('[INFO] PRD restored from latest backup\n', 'stdout');
      return true;
    } catch (err) {
      this.outputCallback?.(`[ERROR] Failed to restore PRD: ${err}\n`, 'stderr');
      return false;
    }
  }

  /**
   * List available PRD backups.
   */
  public listBackups(): { path: string; timestamp: string; completedStories: number }[] {
    const backupDir = join(this.projectPath, '.ralph-backups');
    if (!existsSync(backupDir)) return [];

    try {
      const { readdirSync } = require('fs');
      return readdirSync(backupDir)
        .filter(
          (f: string) => f.startsWith('prd_') && f.endsWith('.json') && f !== 'prd_latest.json',
        )
        .map((f: string) => {
          const fullPath = join(backupDir, f);
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const prd: PRD = JSON.parse(content);
            const completedStories = prd.userStories.filter(s => s.passes).length;
            return {
              path: fullPath,
              timestamp: f.replace('prd_', '').replace('.json', ''),
              completedStories,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a: { timestamp: string }, b: { timestamp: string }) =>
          b.timestamp.localeCompare(a.timestamp),
        );
    } catch {
      return [];
    }
  }

  /**
   * Restore PRD from a specific backup file.
   */
  public restoreFromBackup(backupPath: string): boolean {
    const prdPath = join(this.projectPath, 'prd.json');

    if (!existsSync(backupPath)) {
      this.outputCallback?.(`[ERROR] Backup file not found: ${backupPath}\n`, 'stderr');
      return false;
    }

    try {
      copyFileSync(backupPath, prdPath);
      this.outputCallback?.(`[INFO] PRD restored from: ${backupPath}\n`, 'stdout');
      return true;
    } catch (err) {
      this.outputCallback?.(`[ERROR] Failed to restore PRD: ${err}\n`, 'stderr');
      return false;
    }
  }

  private getNextStory(prd: PRD): UserStory | null {
    return prd.userStories.find(s => !s.passes && !s.skipped) || null;
  }

  private markStorySkipped(storyId: string): void {
    const prdPath = join(this.projectPath, 'prd.json');
    try {
      const content = readFileSync(prdPath, 'utf-8');
      const prd: PRD = JSON.parse(content);
      const story = prd.userStories.find(s => s.id === storyId);
      if (story) {
        story.skipped = true;
        writeFileSync(prdPath, JSON.stringify(prd, null, 2), 'utf-8');
        this.log('INFO', `Marked ${storyId} as skipped in prd.json`);
      }
    } catch (err) {
      this.log('ERROR', `Failed to mark story skipped: ${err}`);
    }
  }

  private buildPrompt(story: UserStory, _prd: PRD): string {
    let acText = '';
    if (isTestableAC(story.acceptanceCriteria)) {
      acText = story.acceptanceCriteria
        .map(ac => `- ${ac.text}${ac.testCommand ? ` (test: ${ac.testCommand})` : ''}`)
        .join('\n');
    } else {
      acText = story.acceptanceCriteria.map(ac => `- ${ac}`).join('\n');
    }

    const customPrinciples = this.loadCustomPrinciples();

    return `You are a pragmatic programmer implementing a user story.

## Core Principles (Apply to ALL code you write)

### 🎯 Design Principles
- **DRY (Don't Repeat Yourself)**: Before writing new code, search for existing similar implementations. Never duplicate knowledge; every piece of logic should have a single source of truth.
- **ETC (Easier To Change)**: Every decision should make future changes easier. Prefer flexibility over rigid solutions.
- **Orthogonality**: Design components to be independent. Changes to one module should not affect unrelated modules.
- **Match Existing Patterns**: Study the codebase first. Follow established conventions, naming patterns, and architectural decisions.

### 🔨 Implementation Rules
- **Tracer Bullets First**: For complex features, get a minimal end-to-end version working first, then iterate.
- **Crash Early**: Fail fast with clear error messages. A dead program does less damage than a crippled one.
- **Small Steps**: Make incremental changes. Verify each step works before proceeding.
- **No Magic**: Understand WHY your code works, not just THAT it works. Don't use code you don't understand.

### ✨ Code Quality
- **Assertions**: Use assertions for conditions that "can't happen"
- **Clear Naming**: Names should express intent. Rename immediately when intent shifts.
- **No Broken Windows**: Don't leave bad code. Fix issues as you find them or add a TODO with explanation.
- **Law of Demeter**: Avoid method chains like \`a.b().c().d()\`. Keep dependencies minimal.

### 📋 Before Writing Code
1. Search for existing similar code in the codebase using grep/find
2. Understand the existing patterns and conventions
3. Plan how your changes fit into the existing architecture
4. Consider what tests are needed

${customPrinciples ? `\n### 🔧 Project-Specific Principles\n${customPrinciples}\n` : ''}

---

## User Story: ${story.id} - ${story.title}

**Description:**
${story.description}

**Acceptance Criteria:**
${acText}

**Complexity:** ${story.complexity}

---

## Instructions

1. **Explore First**: Look at existing code that's similar to what you need to implement
2. **Follow Patterns**: Match the existing codebase style and conventions exactly
3. **Implement Incrementally**: Build the feature step by step, verifying as you go
4. **Test Thoroughly**: Run all test commands to verify your implementation works
5. **Clean Up**: Ensure no broken windows are left behind
6. **Summarize**: When complete, describe what you implemented and any key decisions made

Begin implementation now.`;
  }

  /**
   * Build a resume prompt for a previously paused story.
   * Includes AC status so Claude knows what still needs work.
   */
  private buildResumePrompt(story: UserStory, storyProgress: StoryProgress): string {
    const passingACs = storyProgress.passingACs || [];
    const failingACs = storyProgress.failingACs || [];

    const passingText =
      passingACs.length > 0 ? passingACs.map(ac => `- ${ac}`).join('\n') : '- (none yet)';
    const failingText =
      failingACs.length > 0 ? failingACs.map(ac => `- ${ac}`).join('\n') : '- (none identified)';

    return `You were previously working on this user story and were interrupted.

## Story: ${story.id} - ${story.title}
${story.description}

## Current Status
**Passing:**
${passingText}

**Failing:**
${failingText}

Continue from where you left off. Focus on the remaining failing acceptance criteria.
Do not redo work that already passes.`;
  }

  /**
   * Get current AC status for a story (passing/failing AC IDs).
   */
  private getACStatus(story: UserStory): { passingACs: string[]; failingACs: string[] } {
    if (!isTestableAC(story.acceptanceCriteria)) {
      return { passingACs: [], failingACs: [] };
    }
    const criteria = story.acceptanceCriteria as import('../types').AcceptanceCriterion[];
    const passingACs = criteria.filter(ac => ac.passes).map(ac => ac.id || ac.text);
    const failingACs = criteria.filter(ac => !ac.passes).map(ac => ac.id || ac.text);
    return { passingACs, failingACs };
  }

  /**
   * Load or generate execution plan for the current PRD.
   * Caches the plan for subsequent calls.
   */
  private loadOrGenerateExecutionPlan(prd: PRD): ExecutionPlan | null {
    if (this.executionPlan) {
      return this.executionPlan;
    }

    try {
      // Load execution mode from settings
      const settings = loadSettings();
      const executionMode = settings.executionMode || 'balanced';

      // Generate execution plan from PRD with learning data and execution mode
      const learningData = this.learningRecorder.getAllLearnings();
      this.executionPlan = generateExecutionPlan(
        prd,
        undefined,
        this.projectPath,
        learningData,
        executionMode,
      );
      this.log(
        'INFO',
        `Execution plan generated with ${this.executionPlan.stories.length} stories using ${executionMode} mode`,
      );
      return this.executionPlan;
    } catch (err) {
      this.log('WARN', `Failed to generate execution plan: ${err}`);
      return null;
    }
  }

  /**
   * Map model ID from execution plan to Claude CLI model flag value.
   * Falls back to DEFAULT_MODEL if model is unknown or not supported.
   */
  private mapModelIdToCLIFlag(modelId: string): string {
    // Map full model IDs to CLI model names
    const modelMapping: Record<string, string> = {
      'claude-opus-4-20250514': 'opus',
      'claude-sonnet-4-20250514': 'sonnet',
      'claude-3-5-haiku-20241022': 'haiku',
      // Add common variants
      'claude-opus-4': 'opus',
      'claude-sonnet-4': 'sonnet',
      'claude-haiku-3.5': 'haiku',
    };

    const cliModel = modelMapping[modelId];
    if (cliModel) {
      return cliModel;
    }

    // Try to detect from model ID string
    if (modelId.includes('opus')) return 'opus';
    if (modelId.includes('haiku')) return 'haiku';
    if (modelId.includes('sonnet')) return 'sonnet';

    // Default fallback
    this.log('WARN', `Unknown model ID '${modelId}', falling back to DEFAULT_MODEL`);
    return DEFAULT_MODEL;
  }

  /**
   * Map CLI name to provider and model ID for cost tracking
   */
  private mapCLIToProviderModel(cli: string): { provider: Provider; modelId: string } {
    switch (cli) {
      case 'claude':
        return { provider: 'anthropic', modelId: DEFAULT_CLAUDE_MODEL_ID };
      case 'opencode':
        return { provider: 'openai', modelId: 'gpt-4' };
      case 'codex':
        return { provider: 'openai', modelId: 'gpt-4-turbo' };
      case 'gemini':
        return { provider: 'gemini', modelId: 'gemini-pro' };
      case 'aider':
        // Aider can use different backends, default to GPT-4
        return { provider: 'openai', modelId: 'gpt-4' };
      case 'cody':
        return { provider: 'anthropic', modelId: 'claude-2' };
      default:
        return { provider: 'local' as Provider, modelId: cli };
    }
  }

  /**
   * Extract token usage from CLI output log
   * Looks for patterns like:
   * - "Input tokens: 1234, Output tokens: 5678"
   * - "Total tokens: 6912"
   * - "tokens used: 6912"
   * Returns { inputTokens, outputTokens } or { inputTokens: 0, outputTokens: 0 } if not found
   */
  private extractTokenUsage(logContent: string): { inputTokens: number; outputTokens: number } {
    // Try to find input/output token counts
    const inputMatch = logContent.match(/Input tokens?:?\s*(\d+)/i);
    const outputMatch = logContent.match(/Output tokens?:?\s*(\d+)/i);

    if (inputMatch && outputMatch) {
      return {
        inputTokens: parseInt(inputMatch[1] || '0', 10),
        outputTokens: parseInt(outputMatch[1] || '0', 10),
      };
    }

    // Try to find total tokens (assume 2:1 ratio output:input as rough estimate)
    const totalMatch = logContent.match(/(?:Total|tokens used):?\s*(\d+)/i);
    if (totalMatch) {
      const total = parseInt(totalMatch[1] || '0', 10);
      // Estimate: ~33% input, ~67% output (typical for code generation)
      return {
        inputTokens: Math.floor(total * 0.33),
        outputTokens: Math.floor(total * 0.67),
      };
    }

    // No token information found
    return { inputTokens: 0, outputTokens: 0 };
  }

  /**
   * Calculate cost based on provider and token usage
   * Uses rough estimates for pricing per 1M tokens
   */
  private calculateCost(provider: Provider, inputTokens: number, outputTokens: number): number {
    // Pricing per 1M tokens (USD) - approximate as of 2024
    const pricing: Record<Provider, { input: number; output: number }> = {
      anthropic: { input: 3.0, output: 15.0 }, // Claude Sonnet
      openai: { input: 10.0, output: 30.0 }, // GPT-4
      openrouter: { input: 5.0, output: 15.0 }, // Average
      gemini: { input: 0.5, output: 1.5 }, // Gemini Pro
      local: { input: 0, output: 0 }, // Free
    };

    const rates = pricing[provider] || pricing.local;
    const inputCost = (inputTokens / 1_000_000) * rates.input;
    const outputCost = (outputTokens / 1_000_000) * rates.output;

    return inputCost + outputCost;
  }

  private loadCustomPrinciples(): string | null {
    try {
      const principlesPath = join(homedir(), '.config', 'ralph-ultra', 'principles.md');

      if (existsSync(principlesPath)) {
        const content = readFileSync(principlesPath, 'utf-8');
        // Strip HTML comments and empty lines
        const cleaned = content
          .replace(/<!--[\s\S]*?-->/g, '')
          .split('\n')
          .filter(line => line.trim())
          .join('\n');

        // Only return if there's meaningful content
        return cleaned.length > 100 ? cleaned : null;
      }
    } catch (_error) {
      // Silently fall back to defaults - no logging needed
    }
    return null;
  }

  /**
   * Perform a health check on a CLI to verify it's actually working.
   * Checks cache first; if expired, runs a simple test command.
   * Returns true if CLI is healthy, false otherwise.
   */
  private checkCLIHealth(cli: string): boolean {
    // Check cache first
    const cached = this.cliHealthCache.get(cli);
    const now = Date.now();

    if (cached && now - cached.checkedAt < CLI_HEALTH_CACHE_TTL) {
      this.log('DEBUG', `CLI health check: ${cli} cached result = ${cached.healthy}`);
      return cached.healthy;
    }

    this.log('DEBUG', `CLI health check: Testing ${cli}...`);

    try {
      // Run a minimal health check command
      // Safe: cli is validated against hardcoded array in detectAICLI/tryFallbackChain
      execSync(`${cli} --version`, { stdio: 'pipe', timeout: 3000 });

      this.log('INFO', `CLI health check: ${cli} is healthy`);
      this.cliHealthCache.set(cli, { cli, healthy: true, checkedAt: now });
      return true;
    } catch (err) {
      this.log('WARN', `CLI health check: ${cli} failed - ${err}`);
      this.cliHealthCache.set(cli, { cli, healthy: false, checkedAt: now });
      return false;
    }
  }

  /**
   * Try each CLI in the fallback chain until one is found and verified healthy
   */
  private tryFallbackChain(
    fallbackOrder: string[],
    validOptions: string[],
    source: 'project' | 'global',
  ): string | null {
    for (const cli of fallbackOrder) {
      // Validate against whitelist
      if (!validOptions.includes(cli)) {
        this.log('WARN', `Ignoring invalid CLI in fallback chain: ${cli}`);
        continue;
      }

      try {
        // Safe: cli is validated against hardcoded validOptions array
        execSync(`which ${cli}`, { stdio: 'pipe' });

        // Health check the CLI before using it
        if (!this.checkCLIHealth(cli)) {
          this.log(
            'WARN',
            `Fallback chain: ${cli} found but failed health check, trying next option`,
          );
          this.outputCallback?.(
            `[WARN] CLI '${cli}' is installed but not working, trying next option...\n`,
            'stderr',
          );
          continue;
        }

        this.log('INFO', `Fallback: Using ${cli} from ${source} fallback chain`);
        this.outputCallback?.(
          `[INFO] Falling back to alternative CLI: ${cli} (from ${source} configuration)\n`,
          'stdout',
        );
        return cli;
      } catch {
        this.log('DEBUG', `Fallback chain: ${cli} not available, trying next option`);
        continue;
      }
    }

    this.log('WARN', `No CLI found in ${source} fallback chain`);
    return null;
  }

  private detectAICLI(): string | null {
    const cliOptions = ['claude', 'opencode', 'codex', 'gemini', 'aider', 'cody'];

    // Priority 1: Check PRD for project-specific CLI override
    const prd = this.loadPRD();
    if (prd?.cli && cliOptions.includes(prd.cli)) {
      try {
        // Safe: prd.cli is validated against hardcoded cliOptions array
        execSync(`which ${prd.cli}`, { stdio: 'pipe' });

        // Health check the CLI before using it
        if (!this.checkCLIHealth(prd.cli)) {
          this.log(
            'WARN',
            `PRD specifies CLI '${prd.cli}' but it failed health check, falling back`,
          );
          this.outputCallback?.(
            `[WARN] CLI '${prd.cli}' is installed but not working, falling back...\n`,
            'stderr',
          );
          // Try project-specific fallback chain if configured
          if (prd.cliFallbackOrder && Array.isArray(prd.cliFallbackOrder)) {
            const fallbackCli = this.tryFallbackChain(prd.cliFallbackOrder, cliOptions, 'project');
            if (fallbackCli) return fallbackCli;
          }
        } else {
          this.log('INFO', `Using project CLI override: ${prd.cli}`);
          return prd.cli;
        }
      } catch {
        this.log('WARN', `PRD specifies CLI '${prd.cli}' but it's not installed, falling back`);
        // Try project-specific fallback chain if configured
        if (prd.cliFallbackOrder && Array.isArray(prd.cliFallbackOrder)) {
          const fallbackCli = this.tryFallbackChain(prd.cliFallbackOrder, cliOptions, 'project');
          if (fallbackCli) return fallbackCli;
        }
      }
    }

    // Priority 2: Check global settings for preferred CLI
    const settings = loadSettings();
    const preferredCli = settings['preferredCli'] as string | undefined;
    if (preferredCli && cliOptions.includes(preferredCli)) {
      try {
        execSync(`which ${preferredCli}`, { stdio: 'pipe' });

        // Health check the CLI before using it
        if (!this.checkCLIHealth(preferredCli)) {
          this.log(
            'WARN',
            `Preferred CLI '${preferredCli}' found but failed health check, falling back`,
          );
          this.outputCallback?.(
            `[WARN] CLI '${preferredCli}' is installed but not working, falling back...\n`,
            'stderr',
          );
          // Try global fallback chain if configured
          const fallbackOrder = settings['cliFallbackOrder'] as string[] | undefined;
          if (fallbackOrder && Array.isArray(fallbackOrder)) {
            const fallbackCli = this.tryFallbackChain(fallbackOrder, cliOptions, 'global');
            if (fallbackCli) return fallbackCli;
          }
        } else {
          return preferredCli;
        }
      } catch {
        this.log(
          'WARN',
          `Preferred CLI '${preferredCli}' not found, falling back to configured order`,
        );
        // Try global fallback chain if configured
        const fallbackOrder = settings['cliFallbackOrder'] as string[] | undefined;
        if (fallbackOrder && Array.isArray(fallbackOrder)) {
          const fallbackCli = this.tryFallbackChain(fallbackOrder, cliOptions, 'global');
          if (fallbackCli) return fallbackCli;
        }
      }
    }

    // Priority 3: Auto-detect first available and healthy CLI
    for (const cli of cliOptions) {
      try {
        // Safe: cli is from hardcoded array, not user input
        execSync(`which ${cli}`, { stdio: 'pipe' });

        // Health check before using
        if (this.checkCLIHealth(cli)) {
          this.log('INFO', `Auto-detected CLI: ${cli}`);
          return cli;
        } else {
          this.log('DEBUG', `Auto-detect: ${cli} found but failed health check, trying next`);
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Detect all available AI CLIs and their installation status
   * @returns Array of CLI names with their installation status
   */
  public static detectAvailableCLIs(): Array<{ name: string; installed: boolean }> {
    const cliOptions = ['claude', 'opencode', 'codex', 'gemini', 'aider', 'cody'];

    return cliOptions.map(cli => {
      try {
        // Safe: cli is from hardcoded array, not user input
        execSync(`which ${cli}`, { stdio: 'pipe' });
        return { name: cli, installed: true };
      } catch {
        return { name: cli, installed: false };
      }
    });
  }

  private promptTempFile: string | null = null;

  /**
   * Write prompt to temp file and return path.
   * Claude CLI works better with file-based prompts (like ralph-nano does).
   */
  private writePromptToFile(prompt: string): string {
    const tempPath = join(tmpdir(), `ralph-prompt-${Date.now()}.txt`);
    writeFileSync(tempPath, prompt, 'utf-8');
    this.promptTempFile = tempPath;
    return tempPath;
  }

  private cleanupPromptFile(): void {
    if (this.promptTempFile && existsSync(this.promptTempFile)) {
      try {
        unlinkSync(this.promptTempFile);
      } catch {
        // Ignore cleanup errors
      }
      this.promptTempFile = null;
    }
  }

  /**
   * Read progress file from disk. If file doesn't exist or is corrupt, return new empty progress.
   */
  private readProgress(): ExecutionProgress {
    try {
      if (!existsSync(this.progressFile)) {
        return {
          startedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          stories: [],
        };
      }

      const content = readFileSync(this.progressFile, 'utf-8');
      const progress: ExecutionProgress = JSON.parse(content);
      this.log('INFO', `Progress loaded: ${progress.stories.length} stories tracked`);
      return progress;
    } catch (err) {
      this.log('WARN', `Failed to read progress file: ${err}, starting fresh`);
      return {
        startedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        stories: [],
      };
    }
  }

  /**
   * Write current progress to disk.
   */
  private writeProgress(): void {
    try {
      this.executionProgress.lastUpdated = new Date().toISOString();
      const content = JSON.stringify(this.executionProgress, null, 2);
      writeFileSync(this.progressFile, content, 'utf-8');
      this.log(
        'INFO',
        `Progress written: ${this.executionProgress.stories.length} stories tracked`,
      );
    } catch (err) {
      this.log('ERROR', `Failed to write progress file: ${err}`);
    }
  }

  /**
   * Update progress for a specific story.
   */
  private updateStoryProgress(storyId: string, passed: boolean, failureReason?: string): void {
    const existingStory = this.executionProgress.stories.find(s => s.storyId === storyId);

    if (existingStory) {
      existingStory.attempts += 1;
      existingStory.lastAttempt = new Date().toISOString();
      existingStory.passed = passed;
      // Preserve sessionId but clear paused flag when actively running
      if (this.currentSessionId) {
        existingStory.sessionId = this.currentSessionId;
      }
      existingStory.paused = false;
      if (failureReason && !passed) {
        if (!existingStory.failureReasons) {
          existingStory.failureReasons = [];
        }
        existingStory.failureReasons.push(failureReason);
      }
      this.log(
        'DEBUG',
        `Story ${storyId} progress updated: attempt ${existingStory.attempts}, ${passed ? 'PASSED' : 'FAILED'}`,
      );
    } else {
      const newStory: StoryProgress = {
        storyId,
        attempts: 1,
        lastAttempt: new Date().toISOString(),
        passed,
        sessionId: this.currentSessionId,
      };
      if (failureReason && !passed) {
        newStory.failureReasons = [failureReason];
      }
      this.executionProgress.stories.push(newStory);
      this.log('DEBUG', `Story ${storyId} tracking started: ${passed ? 'PASSED' : 'FAILED'}`);
    }

    this.writeProgress();
  }

  /**
   * Get progress history for display.
   */
  public getProgressHistory(): ExecutionProgress {
    return this.executionProgress;
  }

  /**
   * Select CLI based on model/provider. Anthropic → Claude CLI, others → OpenCode CLI
   * NOTE: OpenCode routing is currently disabled due to "Session not found" bug in v1.1.33
   * See: https://github.com/anomalyco/opencode/issues - opencode run fails to create new sessions
   * Enable via settings.enableOpenCodeRouting = true when bug is fixed
   */
  private selectCLIForModel(
    modelId?: string,
    provider?: Provider,
  ): { cli: string; model: string; modelFlag: string } {
    if (!modelId || !provider) {
      return { cli: 'claude', model: DEFAULT_MODEL, modelFlag: DEFAULT_MODEL };
    }

    if (ANTHROPIC_MODELS.includes(modelId) || provider === 'anthropic') {
      const shortModel = modelId.includes('opus')
        ? 'opus'
        : modelId.includes('haiku')
          ? 'haiku'
          : 'sonnet';
      return { cli: 'claude', model: modelId, modelFlag: shortModel };
    }

    const settings = loadSettings();
    const enableOpenCodeRouting = settings['enableOpenCodeRouting'] as boolean | undefined;

    if (enableOpenCodeRouting) {
      const opencodeCli = this.checkCLIHealth('opencode') ? 'opencode' : null;
      if (opencodeCli) {
        const opencodeModel = `${provider}/${modelId}`;
        return { cli: 'opencode', model: modelId, modelFlag: opencodeModel };
      }
    }

    this.log(
      'WARN',
      `Non-Anthropic model ${provider}/${modelId} requested but OpenCode routing disabled, using Claude`,
    );
    return { cli: 'claude', model: DEFAULT_MODEL, modelFlag: DEFAULT_MODEL };
  }

  private buildTmuxCommand(
    cli: string,
    promptFile: string,
    logFile: string,
    modelFlag?: string,
    options?: { sessionId?: string; isResume?: boolean },
  ): string {
    const catPrompt = `"$(cat '${promptFile}')"`;
    const signalDone = `; tmux wait-for -S "${this.tmuxSessionName}-done"`;

    switch (cli) {
      case 'claude': {
        const model = modelFlag || DEFAULT_MODEL;
        if (options?.isResume && options.sessionId) {
          // Resume an existing session
          return `${cli} --print --verbose --output-format stream-json --resume ${options.sessionId} --model ${model} --dangerously-skip-permissions ${catPrompt} 2>&1 | tee -a "${logFile}"${signalDone}`;
        }
        // New session with session ID for future resume
        const sessionFlag = options?.sessionId ? ` --session-id ${options.sessionId}` : '';
        return `${cli} --print --verbose --output-format stream-json${sessionFlag} --model ${model} --dangerously-skip-permissions ${catPrompt} 2>&1 | tee -a "${logFile}"${signalDone}`;
      }
      case 'opencode':
        const opencodeModelArg = modelFlag ? `-m ${modelFlag}` : '';
        const opencodeConfigPath = ensureRalphOpencodeConfig(this.projectPath);
        return `OPENCODE_CONFIG="${opencodeConfigPath}" ${cli} run ${opencodeModelArg} --title Ralph ${catPrompt} 2>&1 | tee -a "${logFile}"${signalDone}`;
      case 'codex':
        return `${cli} exec ${catPrompt} 2>&1 | tee -a "${logFile}"${signalDone}`;
      case 'gemini':
        return `${cli} -p ${catPrompt} 2>&1 | tee -a "${logFile}"${signalDone}`;
      case 'aider':
        return `${cli} --message ${catPrompt} --yes 2>&1 | tee -a "${logFile}"${signalDone}`;
      case 'cody':
        return `${cli} chat -m ${catPrompt} 2>&1 | tee -a "${logFile}"${signalDone}`;
      default:
        return `${cli} ${catPrompt} 2>&1 | tee -a "${logFile}"${signalDone}`;
    }
  }

  private getCLIConfig(
    cli: string,
    prompt: string,
    model?: string,
  ): { args: string[]; useStdin: boolean; parseJson: boolean; shell: boolean } {
    // Write prompt to temp file to avoid arg length limits and escaping issues
    const promptFile = this.writePromptToFile(prompt);

    switch (cli) {
      case 'claude':
        // Use shell to read from file, exactly like ralph-nano does
        // Use provided model or fallback to DEFAULT_MODEL
        const claudeModel = model || DEFAULT_MODEL;
        return {
          args: [
            '--print',
            '--model',
            claudeModel,
            '--dangerously-skip-permissions',
            `"$(cat ${promptFile})"`,
          ],
          useStdin: false,
          parseJson: false,
          shell: true,
        };
      case 'opencode':
        return {
          args: ['run', '--title', 'Ralph', `"$(cat ${promptFile})"`],
          useStdin: false,
          parseJson: false,
          shell: true,
        };
      case 'codex':
        return {
          args: ['exec', `"$(cat ${promptFile})"`],
          useStdin: false,
          parseJson: false,
          shell: true,
        };
      case 'gemini':
        return {
          args: ['-p', `"$(cat ${promptFile})"`],
          useStdin: false,
          parseJson: false,
          shell: true,
        };
      case 'aider':
        return {
          args: ['--message', `"$(cat ${promptFile})"`, '--yes'],
          useStdin: false,
          parseJson: false,
          shell: true,
        };
      case 'cody':
        return {
          args: ['chat', '-m', `"$(cat ${promptFile})"`],
          useStdin: false,
          parseJson: false,
          shell: true,
        };
      default:
        return { args: [`"$(cat ${promptFile})"`], useStdin: false, parseJson: false, shell: true };
    }
  }

  /**
   * Run a specific story by its ID, skipping any uncompleted stories before it.
   * This allows jumping directly to a specific story for debugging or resuming work.
   */
  public async runStory(
    projectPath: string,
    storyId: string,
    options?: { ignoreApiStatus?: boolean; ignoreComplexity?: boolean },
  ): Promise<void> {
    this.reclaimExternalSession();

    if (this.state !== 'idle' && this.state !== 'paused') {
      throw new Error(`Cannot start: process is ${this.state}`);
    }

    const prd = this.loadPRD();
    if (!prd) {
      const error = 'No prd.json found in project directory';
      this.emitStatus({ state: 'idle', error });
      throw new Error(error);
    }

    const story = prd.userStories.find(s => s.id === storyId);
    if (!story) {
      const error = `Story ${storyId} not found in PRD`;
      this.emitStatus({ state: 'idle', error });
      throw new Error(error);
    }

    if (story.passes) {
      this.outputCallback?.(`Story ${storyId} is already complete\n`, 'stdout');
      this.emitStatus({ state: 'idle' });
      return;
    }

    const backupPath = this.backupPRD();
    if (backupPath) {
      this.outputCallback?.(`PRD backed up to: ${backupPath}\n`, 'stdout');
    }

    // Run the specific story
    return this.runStoryInternal(projectPath, story, prd, options);
  }

  public async run(
    projectPath: string,
    options?: { ignoreApiStatus?: boolean; ignoreComplexity?: boolean },
  ): Promise<void> {
    this.reclaimExternalSession();

    if (this.state !== 'idle' && this.state !== 'paused') {
      throw new Error(`Cannot start: process is ${this.state}`);
    }

    const prd = this.loadPRD();
    if (!prd) {
      const error = 'No prd.json found in project directory';
      this.emitStatus({ state: 'idle', error });
      throw new Error(error);
    }

    const backupPath = this.backupPRD();
    if (backupPath) {
      this.outputCallback?.(`PRD backed up to: ${backupPath}\n`, 'stdout');
    }

    const story = this.getNextStory(prd);
    if (!story) {
      this.outputCallback?.('All stories are complete!', 'stdout');
      this.emitStatus({ state: 'idle' });
      return;
    }

    // Run the next uncompleted story
    return this.runStoryInternal(projectPath, story, prd, options);
  }

  private async runStoryInternal(
    projectPath: string,
    story: UserStory,
    prd: PRD,
    options?: { ignoreApiStatus?: boolean; ignoreComplexity?: boolean },
  ): Promise<void> {
    // User can override complexity check via complexityOverride option
    const complexityOverride = options?.ignoreComplexity || false;

    // Check story complexity unless bypassed
    if (!complexityOverride) {
      const complexityWarning = analyzeStoryComplexity(story);
      if (complexityWarning.isComplex) {
        this.outputCallback?.(`\n⚠️  Warning: Story ${story.id} may be too complex:\n`, 'stderr');
        complexityWarning.reasons.forEach(reason => {
          this.outputCallback?.(` - ${reason}\n`, 'stderr');
        });
        this.outputCallback?.(
          '\n   Consider breaking this story into smaller, more focused stories.\n',
          'stderr',
        );
        this.outputCallback?.(
          '   Smaller stories have higher success rates and are easier to verify.\n',
          'stderr',
        );
        this.outputCallback?.('\n   Starting in 5 seconds... Press Ctrl+C to cancel\n', 'stdout');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Check API status unless bypassed
    if (!options?.ignoreApiStatus) {
      const apiStatus = await checkApiStatus();
      if (shouldWarnAboutStatus(apiStatus)) {
        const statusMessage = `⚠️  Warning: Claude API status is '${apiStatus.status}' - ${apiStatus.message}\n`;
        this.outputCallback?.(statusMessage, 'stderr');

        // Give user 3 seconds to cancel before proceeding
        this.outputCallback?.(
          '   Starting in 3 seconds... Press Ctrl+C to cancel or set RALPH_IGNORE_API_STATUS=true\n',
          'stdout',
        );
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // First check if execution plan recommends a specific model/provider
    let cli: string | null = null;
    let executionPlanModel: { modelId: string; provider: Provider; reason: string } | null = null;

    const executionPlan = this.loadOrGenerateExecutionPlan(prd);
    if (executionPlan) {
      const storyAllocation = executionPlan.stories.find(s => s.storyId === story.id);
      if (storyAllocation) {
        executionPlanModel = storyAllocation.recommendedModel;
        const selected = this.selectCLIForModel(
          executionPlanModel.modelId,
          executionPlanModel.provider,
        );
        cli = selected.cli;
        this.log(
          'INFO',
          `Execution plan recommends ${executionPlanModel.provider}/${executionPlanModel.modelId} → using ${cli}`,
        );
      }
    }

    if (!cli) {
      cli = this.detectAICLI();
    }

    if (!cli) {
      const error = 'No AI CLI found. Install: claude, opencode, codex, gemini, aider, or cody';
      this.emitStatus({ state: 'idle', error });
      throw new Error(error);
    }

    if (!this.checkCLIHealth(cli)) {
      this.log('WARN', `Selected CLI '${cli}' failed final health check before execution`);
      this.outputCallback?.(
        `[WARN] CLI '${cli}' failed health check, attempting fallback...\n`,
        'stderr',
      );

      // Try to find an alternative healthy CLI
      const cliOptions = ['claude', 'opencode', 'codex', 'gemini', 'aider', 'cody'];
      let fallbackCli: string | null = null;

      // Try global fallback chain first if configured
      const settings = loadSettings();
      const fallbackOrder = settings['cliFallbackOrder'] as string[] | undefined;
      if (fallbackOrder && Array.isArray(fallbackOrder)) {
        fallbackCli = this.tryFallbackChain(fallbackOrder, cliOptions, 'global');
      }

      // If no fallback chain or all failed, try remaining CLIs in order
      if (!fallbackCli) {
        for (const altCli of cliOptions) {
          if (altCli === cli) continue; // Skip the one that just failed
          try {
            // Safe: altCli is from hardcoded cliOptions array, not user input
            execSync(`which ${altCli}`, { stdio: 'pipe' });
            if (this.checkCLIHealth(altCli)) {
              fallbackCli = altCli;
              this.log('INFO', `Fallback: Using ${altCli} after ${cli} failed health check`);
              this.outputCallback?.(
                `[INFO] Falling back to alternative CLI: ${altCli}\n`,
                'stdout',
              );
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (!fallbackCli) {
        const error = `CLI '${cli}' failed health check and no working alternatives found`;
        this.emitStatus({ state: 'idle', error });
        throw new Error(error);
      }

      cli = fallbackCli;
    }

    // Track iterations for this story
    const iterationCount = this.storyIterationCount.get(story.id) || 0;
    const newIterationCount = iterationCount + 1;
    this.storyIterationCount.set(story.id, newIterationCount);

    // Check if we've exceeded max iterations
    if (newIterationCount > MAX_ITERATIONS) {
      const error = `Story ${story.id} exceeded maximum iterations limit (${MAX_ITERATIONS}). Stopping to prevent runaway execution.`;
      this.outputCallback?.(`\n⚠ ${error}\n`, 'stderr');
      this.emitStatus({ state: 'idle', error });
      return;
    }

    this.state = 'running';
    this.startTime = Date.now();
    this.currentStoryId = story.id;
    this.lastStoryId = story.id;
    const retryCount = this.storyRetryCount.get(story.id) || 0;
    this.emitStatus({
      state: 'running',
      startTime: this.startTime,
      currentStory: story.id,
      retryCount,
    });

    // Check for existing paused session to resume
    const existingProgress = this.executionProgress.stories.find(
      s => s.storyId === story.id && s.paused && s.sessionId,
    );
    const isResume = !!existingProgress?.sessionId;
    const sessionId = existingProgress?.sessionId || randomUUID();
    this.currentSessionId = sessionId;

    let prompt: string;
    if (isResume && existingProgress) {
      prompt = this.buildResumePrompt(story, existingProgress);
      this.log('INFO', `Resuming session ${sessionId.substring(0, 8)}... for ${story.id}`);
      this.outputCallback?.(
        `Resuming previous session: ${sessionId.substring(0, 8)}...\n`,
        'stdout',
      );
      // Clear paused state
      existingProgress.paused = false;
      this.writeProgress();
    } else {
      prompt = this.buildPrompt(story, prd);
      this.log('INFO', `New session ${sessionId.substring(0, 8)}... for ${story.id}`);
    }
    this.getCLIConfig(cli, prompt); // writes prompt to temp file

    // Track story attempt in progress
    this.updateStoryProgress(story.id, false);

    this.log('INFO', `═══ Starting ${story.id}: ${story.title} ═══`);
    this.log(
      'INFO',
      `Using CLI: ${cli}, Complexity: ${story.complexity}, Iteration: ${newIterationCount}/${MAX_ITERATIONS}`,
    );
    this.outputCallback?.(`\n═══ Starting ${story.id}: ${story.title} ═══\n`, 'stdout');
    this.outputCallback?.(`Using CLI: ${cli}\n`, 'stdout');
    this.outputCallback?.(`Complexity: ${story.complexity}\n`, 'stdout');
    this.outputCallback?.(`Iteration: ${newIterationCount}/${MAX_ITERATIONS}\n\n`, 'stdout');

    try {
      writeFileSync(this.sessionLogFile, '');
      this.lastLogPosition = 0;

      // Reset agent activity tracking for new story
      this.agentActivity = this.createEmptyActivity();
      this.agentActivity.startedAt = Date.now();
      this.agentActivity.metrics.model = this.currentModelName || null;

      try {
        execSync(`tmux has-session -t "${this.tmuxSessionName}" 2>/dev/null`);
        this.log('INFO', `Killing existing tmux session: ${this.tmuxSessionName}`);
        execSync(`tmux kill-session -t "${this.tmuxSessionName}" 2>/dev/null`);
      } catch {
        // No existing session - also ensures tmux server is started
      }

      try {
        execSync(`tmux new-session -d -s "${this.tmuxSessionName}" -c "${projectPath}"`);
      } catch (tmuxError) {
        this.log('WARN', `tmux new-session failed, starting tmux server first`);
        execSync(`tmux start-server`);
        execSync(`tmux new-session -d -s "${this.tmuxSessionName}" -c "${projectPath}"`);
      }

      const promptFile = this.promptTempFile;

      // Build model flag based on CLI type and execution plan
      let modelFlag: string | undefined;
      if (executionPlanModel) {
        if (cli === 'claude' && executionPlanModel.provider === 'anthropic') {
          modelFlag = this.mapModelIdToCLIFlag(executionPlanModel.modelId);
        } else if (cli === 'opencode') {
          modelFlag = `${executionPlanModel.provider}/${executionPlanModel.modelId}`;
        }
        this.log('INFO', `Model: ${executionPlanModel.provider}/${executionPlanModel.modelId}`);
        this.log('INFO', `Reason: ${executionPlanModel.reason}`);
        this.outputCallback?.(`Model: ${modelFlag} (${executionPlanModel.reason})\n`, 'stdout');
      }
      this.currentModelName = modelFlag || DEFAULT_MODEL;

      const cliCommand = this.buildTmuxCommand(
        cli,
        promptFile || '',
        this.sessionLogFile,
        modelFlag,
        {
          sessionId: cli === 'claude' ? sessionId : undefined,
          isResume: cli === 'claude' ? isResume : false,
        },
      );

      this.log('INFO', `Creating tmux session: ${this.tmuxSessionName}`);
      this.log('INFO', `CLI command: ${cliCommand}`);

      execSync(
        `tmux send-keys -t "${this.tmuxSessionName}" '${cliCommand.replace(/'/g, "'\\''")}' Enter`,
      );

      this.tmuxPid = this.getTmuxPid();

      this.log('INFO', `Tmux session created with PID: ${this.tmuxPid}`);
      this.outputCallback?.(`Tmux session: ${this.tmuxSessionName}\n`, 'stdout');
      this.outputCallback?.(`Session PID: ${this.tmuxPid}\n`, 'stdout');

      // Start cost tracking for this story
      const { provider, modelId } = this.mapCLIToProviderModel(cli);
      const estimatedCost = 0; // TODO: Get from execution plan when available
      this.costTracker.startStory(story.id, modelId, provider, estimatedCost, retryCount);
      this.log('INFO', `Cost tracking started: ${modelId} on ${provider}, retry ${retryCount}`);

      this.emitStatus({
        state: 'running',
        startTime: this.startTime,
        currentStory: story.id,
        pid: this.tmuxPid,
        retryCount,
        tmuxSession: this.tmuxSessionName,
      });

      this.startLogTailing();

      this.waitForCompletion(story, retryCount);
    } catch (err) {
      this.state = 'idle';
      this.currentStoryId = undefined;
      this.cleanupPromptFile();
      const error = err instanceof Error ? err.message : String(err);
      this.log('ERROR', `Failed to create tmux session: ${error}`);
      this.emitStatus({ state: 'idle', error });
      throw err;
    }
  }

  public stop(): void {
    if (this.state !== 'running' && this.state !== 'external') {
      return;
    }

    this.log('INFO', `Stopping tmux session: ${this.tmuxSessionName}`);
    this.state = 'stopping';
    this.emitStatus({ state: 'stopping' });
    this.outputCallback?.('\n─── Pausing process... ───\n', 'stdout');

    // Save session ID and AC status before killing
    const storyId = this.currentStoryId;
    const sessionId = this.currentSessionId;

    if (storyId && sessionId) {
      // Get current AC status from PRD
      const prd = this.loadPRD();
      const story = prd?.userStories.find(s => s.id === storyId);
      const acStatus = story ? this.getACStatus(story) : { passingACs: [], failingACs: [] };

      // Update progress with pause state
      const existingStory = this.executionProgress.stories.find(s => s.storyId === storyId);
      if (existingStory) {
        existingStory.sessionId = sessionId;
        existingStory.paused = true;
        existingStory.passingACs = acStatus.passingACs;
        existingStory.failingACs = acStatus.failingACs;
      } else {
        this.executionProgress.stories.push({
          storyId,
          attempts: 0,
          lastAttempt: new Date().toISOString(),
          passed: false,
          sessionId,
          paused: true,
          passingACs: acStatus.passingACs,
          failingACs: acStatus.failingACs,
        });
      }
      this.writeProgress();
      this.log('INFO', `Session ${sessionId} saved for story ${storyId} (paused)`);
      this.outputCallback?.(
        `Session saved for resume: ${sessionId.substring(0, 8)}...\n`,
        'stdout',
      );
    }

    try {
      execSync(`tmux kill-session -t "${this.tmuxSessionName}" 2>/dev/null`);
      this.log('INFO', `Tmux session killed: ${this.tmuxSessionName}`);
    } catch {
      this.log('WARN', `Failed to kill tmux session: ${this.tmuxSessionName}`);
    }

    this.stopLogTailing();
    this.recentOutputLines = [];
    this.state = 'paused';
    const pausedStoryId = this.currentStoryId;
    this.currentStoryId = undefined;
    this.tmuxPid = undefined;
    this.emitStatus({ state: 'paused', currentStory: pausedStoryId });
    this.outputCallback?.('─── Process paused (press r to resume) ───\n', 'stdout');
  }

  public getStatus(): RalphStatus {
    const retryCount = this.currentStoryId ? this.storyRetryCount.get(this.currentStoryId) || 0 : 0;
    return {
      state: this.state,
      startTime: this.startTime,
      currentStory: this.currentStoryId,
      pid: this.tmuxPid,
      tmuxSession: this.tmuxSessionName,
      retryCount,
    };
  }

  public isReady(): boolean {
    const prd = this.loadPRD();
    if (!prd) return false;
    const cli = this.detectAICLI();
    return cli !== null;
  }

  public getAvailableCLI(): string | null {
    return this.detectAICLI();
  }

  /**
   * Check if the current CLI is from a project-specific override (prd.json)
   * rather than global settings or auto-detection
   */
  public isProjectCLIOverride(): boolean {
    const cliOptions = ['claude', 'opencode', 'codex', 'gemini', 'aider', 'cody'];
    const prd = this.loadPRD();

    // If PRD has a CLI field and it's valid and installed, it's an override
    if (prd?.cli && cliOptions.includes(prd.cli)) {
      try {
        // Safe: prd.cli is validated against hardcoded cliOptions array (same pattern as detectAICLI)
        execSync(`which ${prd.cli}`, { stdio: 'pipe' });
        return true;
      } catch {
        // CLI specified but not installed
        return false;
      }
    }

    return false;
  }

  public getCurrentRetryCount(): number {
    if (!this.currentStoryId) return 0;
    return this.storyRetryCount.get(this.currentStoryId) || 0;
  }

  /**
   * Get the current Claude Code session ID (if any).
   */
  public getCurrentSessionId(): string | null {
    return this.currentSessionId ?? null;
  }

  /**
   * Get the current model name being used (e.g., 'sonnet', 'opus', 'haiku').
   */
  public getCurrentModel(): string | null {
    return this.currentModelName ?? null;
  }

  private createEmptyActivity(): AgentActivity {
    return {
      currentTool: null,
      currentToolInput: null,
      isThinking: false,
      lastThinkingSnippet: null,
      recentTools: [],
      metrics: {
        model: null,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUSD: 0,
        toolCallCount: 0,
      },
      startedAt: null,
    };
  }

  /**
   * Extract a human-readable summary from (possibly incomplete) tool input JSON.
   */
  private extractToolInputSummary(toolName: string, rawBuffer: string): string {
    const extractField = (field: string): string | null => {
      // Try JSON parse first
      try {
        const obj = JSON.parse(rawBuffer);
        if (obj[field]) return String(obj[field]);
      } catch {
        // Fall back to regex for partial JSON
      }
      const regex = new RegExp(`"${field}"\\s*:\\s*"([^"]*)`);
      const match = rawBuffer.match(regex);
      return match?.[1] || null;
    };

    switch (toolName) {
      case 'Read':
      case 'Edit':
      case 'Write': {
        const filePath = extractField('file_path');
        if (filePath) {
          // Show just the filename or last path component
          const parts = filePath.split('/');
          return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : filePath;
        }
        return '';
      }
      case 'Bash': {
        const command = extractField('command');
        if (command) {
          return command.length > 60 ? command.slice(0, 57) + '...' : command;
        }
        return '';
      }
      case 'Glob': {
        const pattern = extractField('pattern');
        return pattern || '';
      }
      case 'Grep': {
        const pattern = extractField('pattern');
        const path = extractField('path');
        if (pattern && path) return `${pattern} in ${path}`;
        return pattern || '';
      }
      case 'Task': {
        const desc = extractField('description');
        return desc || '';
      }
      default: {
        // Generic: try file_path, then command, then truncate raw
        const fp = extractField('file_path');
        if (fp) return fp;
        const cmd = extractField('command');
        if (cmd) return cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
        return rawBuffer.length > 40 ? rawBuffer.slice(0, 37) + '...' : rawBuffer;
      }
    }
  }

  /**
   * Process a single raw session log line and update the agentActivity struct.
   * Handles all stream-json event types from Claude CLI.
   */
  private updateAgentActivity(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) return;

    try {
      const obj = JSON.parse(trimmed);

      switch (obj.type) {
        case 'assistant': {
          // Extract model from the message
          if (obj.message?.model) {
            this.agentActivity.metrics.model = obj.message.model;
          }
          // Track tool_use blocks from complete message events (non-streaming format)
          if (Array.isArray(obj.message?.content)) {
            for (const block of obj.message.content) {
              if (block.type === 'tool_use') {
                const toolName = block.name || 'Tool';
                const inputStr = block.input ? JSON.stringify(block.input) : '';
                const summary = this.extractToolInputSummary(toolName, inputStr);
                this.agentActivity.recentTools.push({
                  name: toolName,
                  inputSummary: summary,
                  startedAt: Date.now(),
                });
                if (this.agentActivity.recentTools.length > 10) {
                  this.agentActivity.recentTools = this.agentActivity.recentTools.slice(-10);
                }
                this.agentActivity.metrics.toolCallCount++;
                this.agentActivity.currentTool = toolName;
                this.agentActivity.currentToolInput = summary;
              } else if (block.type === 'text') {
                this.agentActivity.isThinking = false;
                this.agentActivity.currentTool = null;
                this.agentActivity.currentToolInput = null;
              }
            }
          }
          break;
        }

        case 'content_block_start': {
          const block = obj.content_block;
          if (block?.type === 'tool_use') {
            this.currentBlockType = 'tool_use';
            this.agentActivity.currentTool = block.name || null;
            this.agentActivity.currentToolInput = null;
            this.agentActivity.isThinking = false;
            this.toolInputBuffer = '';
          } else if (block?.type === 'text') {
            this.currentBlockType = 'text';
            this.agentActivity.isThinking = true;
            this.agentActivity.currentTool = null;
            this.agentActivity.currentToolInput = null;
          }
          break;
        }

        case 'content_block_delta': {
          if (obj.delta?.type === 'input_json_delta' && this.currentBlockType === 'tool_use') {
            this.toolInputBuffer += obj.delta.partial_json || '';
            // Extract summary from accumulated buffer
            if (this.agentActivity.currentTool) {
              this.agentActivity.currentToolInput = this.extractToolInputSummary(
                this.agentActivity.currentTool,
                this.toolInputBuffer,
              );
            }
          } else if (obj.delta?.type === 'text_delta' && this.currentBlockType === 'text') {
            const text = obj.delta.text || '';
            if (text) {
              // Keep last ~80 chars of thinking text
              const current = this.agentActivity.lastThinkingSnippet || '';
              const combined = current + text;
              this.agentActivity.lastThinkingSnippet =
                combined.length > 80 ? combined.slice(-80) : combined;
            }
          }
          break;
        }

        case 'content_block_stop': {
          if (this.currentBlockType === 'tool_use' && this.agentActivity.currentTool) {
            // Push to recent tools
            this.agentActivity.recentTools.push({
              name: this.agentActivity.currentTool,
              inputSummary: this.agentActivity.currentToolInput || '',
              startedAt: Date.now(),
            });
            // Keep last 10
            if (this.agentActivity.recentTools.length > 10) {
              this.agentActivity.recentTools = this.agentActivity.recentTools.slice(-10);
            }
            this.agentActivity.metrics.toolCallCount++;
            this.agentActivity.currentTool = null;
            this.agentActivity.currentToolInput = null;
          } else if (this.currentBlockType === 'text') {
            this.agentActivity.isThinking = false;
          }
          this.currentBlockType = null;
          this.toolInputBuffer = '';
          break;
        }

        case 'result': {
          // Extract usage metrics from result
          if (obj.result && typeof obj.result === 'object') {
            const usage = obj.result.usage;
            if (usage) {
              this.agentActivity.metrics.totalInputTokens += usage.input_tokens || 0;
              this.agentActivity.metrics.totalOutputTokens += usage.output_tokens || 0;
              this.agentActivity.metrics.cacheReadTokens += usage.cache_read_input_tokens || 0;
              this.agentActivity.metrics.cacheCreationTokens +=
                usage.cache_creation_input_tokens || 0;
            }
            // modelUsage has per-model breakdown — accumulate from it
            const modelUsage = obj.result.modelUsage;
            if (modelUsage && typeof modelUsage === 'object') {
              for (const modelId of Object.keys(modelUsage)) {
                const mu = modelUsage[modelId];
                if (mu && typeof mu === 'object') {
                  this.agentActivity.metrics.totalInputTokens +=
                    mu.inputTokens || mu.input_tokens || 0;
                  this.agentActivity.metrics.totalOutputTokens +=
                    mu.outputTokens || mu.output_tokens || 0;
                  this.agentActivity.metrics.cacheReadTokens +=
                    mu.cacheReadInputTokens || mu.cache_read_input_tokens || 0;
                  this.agentActivity.metrics.cacheCreationTokens +=
                    mu.cacheCreationInputTokens || mu.cache_creation_input_tokens || 0;
                }
                // Set model from the first model key if not set
                if (!this.agentActivity.metrics.model) {
                  this.agentActivity.metrics.model = modelId;
                }
              }
            }
            // Calculate cost from accumulated tokens using model-specific pricing
            const inTokens = this.agentActivity.metrics.totalInputTokens;
            const outTokens = this.agentActivity.metrics.totalOutputTokens;
            const { inputPricePerM, outputPricePerM } = getModelPricing(
              this.agentActivity.metrics.model,
            );
            this.agentActivity.metrics.costUSD =
              (inTokens / 1_000_000) * inputPricePerM + (outTokens / 1_000_000) * outputPricePerM;
          }
          break;
        }
      }
    } catch {
      // Malformed JSON — log for debugging, don't crash the activity tracker
      this.log('DEBUG', `Malformed JSON in agent activity: ${trimmed.slice(0, 120)}`);
    }
  }

  /**
   * Get a snapshot of the current agent activity state.
   */
  public getAgentActivity(): AgentActivity {
    return { ...this.agentActivity, metrics: { ...this.agentActivity.metrics } };
  }

  /**
   * Check if a story has a paused session that can be resumed.
   */
  public hasPausedSession(storyId: string): boolean {
    const progress = this.executionProgress.stories.find(
      s => s.storyId === storyId && s.paused && s.sessionId,
    );
    return !!progress;
  }

  /**
   * Check if a story is too complex and should be broken down
   */
  public checkStoryComplexity(story: UserStory): ComplexityWarning {
    return analyzeStoryComplexity(story);
  }

  public retryCurrentStory(): void {
    this.reclaimExternalSession();

    // Only retry if we're idle/paused and have a failed story
    if (this.state !== 'idle' && this.state !== 'paused') {
      this.outputCallback?.('[ERROR] Cannot retry: Ralph is not idle\n', 'stderr');
      return;
    }

    const prd = this.loadPRD();
    if (!prd) {
      this.outputCallback?.('[ERROR] No prd.json found\n', 'stderr');
      return;
    }

    // Find the last failed story (the one that would run next)
    const nextStory = this.getNextStory(prd);
    if (!nextStory) {
      this.outputCallback?.('[INFO] No failed stories to retry\n', 'stdout');
      return;
    }

    // Check if we've exceeded max retries for this story
    const currentRetries = this.storyRetryCount.get(nextStory.id) || 0;
    if (currentRetries >= MAX_RETRIES_PER_STORY) {
      this.outputCallback?.(
        `[WARN] Story ${nextStory.id} already exceeded max retries (${MAX_RETRIES_PER_STORY})\n`,
        'stderr',
      );
      return;
    }

    this.outputCallback?.(
      `[INFO] Manually retrying ${nextStory.id} (attempt ${currentRetries + 1}/${MAX_RETRIES_PER_STORY})\n`,
      'stdout',
    );

    // Run the story again
    this.run(this.projectPath).catch(err => {
      this.outputCallback?.(`[ERROR] Failed to retry story: ${err.message}\n`, 'stderr');
    });
  }

  private emitStatus(status: RalphStatus): void {
    // Debug logging for state changes
    if (this.debugMode) {
      const parts = [`State: ${status.state}`];
      if (status.currentStory) parts.push(`Story: ${status.currentStory}`);
      if (status.pid) parts.push(`PID: ${status.pid}`);
      if (status.retryCount) parts.push(`Retries: ${status.retryCount}`);
      if (status.duration) parts.push(`Duration: ${(status.duration / 1000).toFixed(2)}s`);
      this.log('DEBUG', `Status change - ${parts.join(', ')}`);
    }
    this.statusCallback?.(status);
  }

  private verifyAndContinue(
    story: UserStory,
    projectPath: string,
    duration: number,
    exitCode: number | null,
  ): void {
    this.log('INFO', `Verifying ${story.id} acceptance criteria...`);
    this.log('DEBUG', `Duration: ${(duration / 1000).toFixed(2)}s, Exit code: ${exitCode}`);
    this.outputCallback?.(`\n─── Verifying ${story.id} acceptance criteria... ───\n`, 'stdout');

    const onProgress = (result: ACTestResult, index: number, total: number) => {
      const icon = result.passes ? '✓' : '✗';
      const color = result.passes ? '' : '[FAIL] ';
      this.log(
        result.passes ? 'OK' : 'FAIL',
        `AC-${index + 1}/${total}: ${result.passes ? 'PASS' : 'FAIL'}`,
      );
      this.outputCallback?.(
        `  ${color}${icon} AC-${index + 1}/${total}: ${result.passes ? 'PASS' : 'FAIL'}`,
        'stdout',
      );
    };

    const testResults = runStoryTestsAndSave(projectPath, story.id, onProgress);

    // Non-testable AC (plain strings): successful implementation is sufficient
    if (
      testResults &&
      testResults.results.length === 0 &&
      !isTestableAC(story.acceptanceCriteria)
    ) {
      this.log('INFO', `${story.id} has non-testable AC — marking as complete`);
      this.outputCallback?.(
        `\n─── No automated tests defined — marking as complete ───\n`,
        'stdout',
      );
      const prdPath = join(projectPath, 'prd.json');
      const { projectComplete, archivedPath } = markStoryPassedInPRD(prdPath, story.id);
      testResults.allPassed = true;
      testResults.projectComplete = projectComplete;
      testResults.archivedPath = archivedPath;
    }

    // Extract token usage and end cost tracking
    let sessionLogContent = '';
    try {
      if (existsSync(this.sessionLogFile)) {
        sessionLogContent = readFileSync(this.sessionLogFile, 'utf-8');
      }
    } catch (err) {
      this.log('WARN', `Failed to read session log for token extraction: ${err}`);
    }

    const { inputTokens, outputTokens } = this.extractTokenUsage(sessionLogContent);
    const cli = this.detectAICLI() || 'claude';
    const { provider } = this.mapCLIToProviderModel(cli);
    const actualCost = this.calculateCost(provider, inputTokens, outputTokens);

    if (testResults) {
      const passedCount = testResults.results.filter(r => r.passes).length;
      const totalCount = testResults.results.length;

      if (totalCount > 0) {
        this.outputCallback?.(
          `\n─── Results: ${passedCount}/${totalCount} criteria passed ───\n`,
          'stdout',
        );
      }

      // End cost tracking with actual results
      const costRecord = this.costTracker.endStory(
        story.id,
        actualCost,
        inputTokens,
        outputTokens,
        testResults.allPassed,
      );

      if (costRecord) {
        this.log(
          'INFO',
          `Cost tracking completed: $${actualCost.toFixed(4)} (${inputTokens} in, ${outputTokens} out)`,
        );
      }

      // Record performance data for learning
      const prd = this.loadPRD();
      const executionPlan =
        this.executionPlan || (prd ? this.loadOrGenerateExecutionPlan(prd) : null);
      const storyAllocation = executionPlan?.stories.find(s => s.storyId === story.id);
      const taskType: TaskType = storyAllocation?.taskType || 'unknown';
      const { modelId } = this.mapCLIToProviderModel(cli);
      const retryCount = this.storyRetryCount.get(story.id) || 0;
      const durationMinutes = duration / (1000 * 60);
      // For non-testable AC, use story.acceptanceCriteria.length as the count
      const acCount = story.acceptanceCriteria.length;
      const effectiveTotal = totalCount > 0 ? totalCount : acCount;
      const effectivePassed = totalCount > 0 ? passedCount : testResults.allPassed ? acCount : 0;
      const acPassRate = effectiveTotal > 0 ? effectivePassed / effectiveTotal : 0;

      this.learningRecorder.recordRun({
        project: prd?.project || basename(this.projectPath),
        storyId: story.id,
        storyTitle: story.title,
        taskType,
        complexity: story.complexity,
        detectedCapabilities: storyAllocation?.recommendedModel ? [] : [], // TODO: Add capability detection
        provider,
        modelId,
        durationMinutes,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUSD: actualCost,
        success: testResults.allPassed,
        retryCount,
        acTotal: effectiveTotal,
        acPassed: effectivePassed,
        acPassRate,
      });

      this.log(
        'INFO',
        `Learning recorded: ${story.id} (${taskType}, ${testResults.allPassed ? 'success' : 'failed'}, ${retryCount} retries)`,
      );

      if (testResults.allPassed) {
        this.storyRetryCount.delete(story.id);
        this.storyIterationCount.delete(story.id);
        this.currentSessionId = undefined;
        this.lastStoryId = undefined;

        // Track successful story completion
        this.updateStoryProgress(story.id, true);

        this.log('OK', `${story.id} VERIFIED - all ${effectiveTotal} criteria pass`);
        this.outputCallback?.(`✓ ${story.id} VERIFIED - all acceptance criteria pass!\n`, 'stdout');

        if (testResults.projectComplete) {
          this.log('OK', `PROJECT COMPLETE - all stories verified`);
          this.outputCallback?.(`\n🎉 PROJECT COMPLETE! All stories verified.\n`, 'stdout');
          if (testResults.archivedPath) {
            this.outputCallback?.(`PRD archived to: ${testResults.archivedPath}\n`, 'stdout');
          }
          this.killCurrentSession();
          this.state = 'idle';
          this.currentStoryId = undefined;
          this.emitStatus({
            state: 'idle',
            exitCode: exitCode ?? undefined,
            duration,
            storyPassed: true,
            acTestsPassed: effectivePassed,
            acTestsTotal: effectiveTotal,
          });
        } else {
          this.outputCallback?.(`\n─── Moving to next story... ───\n`, 'stdout');
          this.killCurrentSession();
          this.currentStoryId = undefined;
          this.state = 'idle';

          setTimeout(() => {
            this.run(projectPath).catch(err => {
              this.outputCallback?.(`Error starting next story: ${err.message}`, 'stderr');
            });
          }, 1000);
        }
      } else {
        const currentRetries = this.storyRetryCount.get(story.id) || 0;
        const newRetryCount = currentRetries + 1;
        this.storyRetryCount.set(story.id, newRetryCount);

        const failureReason = `${totalCount - passedCount}/${totalCount} criteria failed`;

        // Track failed story attempt and save AC status for resume
        this.updateStoryProgress(story.id, false, failureReason);

        // Mark as paused with AC status so retry uses --resume
        const acStatus = this.getACStatus(story);
        const existingProgress = this.executionProgress.stories.find(s => s.storyId === story.id);
        if (existingProgress && this.currentSessionId) {
          existingProgress.sessionId = this.currentSessionId;
          existingProgress.paused = true;
          existingProgress.passingACs = acStatus.passingACs;
          existingProgress.failingACs = acStatus.failingACs;
          this.writeProgress();
        }

        this.log(
          'FAIL',
          `${story.id} FAILED - ${totalCount - passedCount}/${totalCount} criteria not met (attempt ${newRetryCount}/${MAX_RETRIES_PER_STORY})`,
        );
        this.outputCallback?.(
          `✗ ${story.id} FAILED - ${totalCount - passedCount} criteria not met (attempt ${newRetryCount}/${MAX_RETRIES_PER_STORY})\n`,
          'stdout',
        );

        if (newRetryCount >= MAX_RETRIES_PER_STORY) {
          this.log('WARN', `${story.id} exceeded max retries (${MAX_RETRIES_PER_STORY}), skipping`);
          this.outputCallback?.(
            `⚠ ${story.id} exceeded max retries (${MAX_RETRIES_PER_STORY}). Skipping to next story...\n`,
            'stderr',
          );

          // Persist skipped=true to PRD so story won't be retried on restart
          this.markStorySkipped(story.id);

          this.storyRetryCount.delete(story.id);
          this.storyIterationCount.delete(story.id);
          this.currentSessionId = undefined;
          this.lastStoryId = undefined;
          // Clear pause state for skipped story
          const skippedProgress = this.executionProgress.stories.find(s => s.storyId === story.id);
          if (skippedProgress) {
            skippedProgress.paused = false;
            skippedProgress.sessionId = undefined;
            this.writeProgress();
          }
          this.killCurrentSession();
          this.currentStoryId = undefined;
          this.state = 'idle';

          setTimeout(() => {
            this.run(projectPath).catch(err => {
              this.outputCallback?.(`Error starting next story: ${err.message}`, 'stderr');
            });
          }, 1000);
        } else {
          this.outputCallback?.(`Re-running ${story.id} to fix issues...\n`, 'stdout');

          this.killCurrentSession();
          this.currentStoryId = undefined;
          this.state = 'idle';

          setTimeout(() => {
            this.run(projectPath).catch(err => {
              this.outputCallback?.(`Error re-running story: ${err.message}`, 'stderr');
            });
          }, 2000);
        }
      }
    } else {
      this.outputCallback?.(`Warning: Could not run AC tests for ${story.id}\n`, 'stderr');
      this.killCurrentSession();
      this.state = 'idle';
      this.currentStoryId = undefined;
      this.emitStatus({
        state: 'idle',
        exitCode: exitCode ?? undefined,
        duration,
      });
    }
  }
}
