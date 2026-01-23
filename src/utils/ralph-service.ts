import { spawn, execSync, type ChildProcess } from 'child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { homedir, tmpdir } from 'os';
import type { PRD, UserStory } from '../types';
import { isTestableAC } from '../types';
import { runStoryTestsAndSave, type ACTestResult } from './ac-runner';
import { checkApiStatus, shouldWarnAboutStatus } from './status-check';

export type ProcessState = 'idle' | 'running' | 'stopping' | 'external';

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
}

const MAX_RETRIES_PER_STORY = 3;
const MAX_ITERATIONS = 10; // Maximum iterations to prevent runaway execution

export class RalphService {
  private process: ChildProcess | null = null;
  private state: ProcessState = 'idle';
  private startTime?: number;
  private currentStoryId?: string;
  private outputCallback?: (line: string, type: 'stdout' | 'stderr') => void;
  private statusCallback?: (status: RalphStatus) => void;
  private projectPath: string;
  private externalCheckInterval?: ReturnType<typeof setInterval>;
  private storyRetryCount: Map<string, number> = new Map();
  private storyIterationCount: Map<string, number> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.checkExternalProcess();
    this.startExternalProcessMonitor();
  }

  private getTmuxSessionName(): string {
    const prdPath = join(this.projectPath, 'prd.json');
    try {
      const prdContent = readFileSync(prdPath, 'utf-8');
      const prd = JSON.parse(prdContent);
      const branchName = prd.branchName || `ralph/${prd.project || basename(this.projectPath)}`;
      const sessionName = branchName.replace(/\//g, '-');
      return `ralph-${sessionName}`;
    } catch {
      return `ralph-${basename(this.projectPath)}`;
    }
  }

  private checkExternalProcess(): boolean {
    if (this.process) return false;

    try {
      const sessionName = this.getTmuxSessionName();
      execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`);

      if (this.state !== 'external') {
        this.state = 'external';
        this.emitStatus({ state: 'external' });
      }
      return true;
    } catch {
      if (this.state === 'external') {
        this.state = 'idle';
        this.emitStatus({ state: 'idle' });
      }
      return false;
    }
  }

  private startExternalProcessMonitor(): void {
    this.externalCheckInterval = setInterval(() => {
      if (!this.process) {
        this.checkExternalProcess();
      }
    }, 3000);
  }

  public dispose(): void {
    if (this.externalCheckInterval) {
      clearInterval(this.externalCheckInterval);
    }
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
    return prd.userStories.find(s => !s.passes) || null;
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

  private detectAICLI(): string | null {
    const cliOptions = ['claude', 'opencode', 'codex', 'gemini', 'aider', 'cody'];

    for (const cli of cliOptions) {
      try {
        execSync(`which ${cli}`, { stdio: 'pipe' });
        return cli;
      } catch {
        continue;
      }
    }
    return null;
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

  /**
   * Clean up temp prompt file if it exists.
   */
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

  private getCLIConfig(
    cli: string,
    prompt: string,
  ): { args: string[]; useStdin: boolean; parseJson: boolean; shell: boolean } {
    // Write prompt to temp file to avoid arg length limits and escaping issues
    const promptFile = this.writePromptToFile(prompt);

    switch (cli) {
      case 'claude':
        // Use shell to read from file, exactly like ralph-nano does
        return {
          args: ['--print', '--dangerously-skip-permissions', `"$(cat ${promptFile})"`],
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

  private parseStreamJson(text: string): string[] {
    const lines: string[] = [];
    const jsonLines = text.split('\n').filter(l => l.trim());

    for (const jsonLine of jsonLines) {
      try {
        const parsed = JSON.parse(jsonLine);
        if (parsed.type === 'assistant' && parsed.message?.content) {
          for (const block of parsed.message.content) {
            if (block.type === 'text' && block.text) {
              lines.push(block.text);
            } else if (block.type === 'tool_use') {
              lines.push(`[Tool: ${block.name}]`);
            }
          }
        } else if (parsed.type === 'result' && parsed.result) {
          lines.push(`[Result: ${parsed.subtype || 'done'}]`);
        }
      } catch {
        if (jsonLine.trim()) {
          lines.push(jsonLine);
        }
      }
    }
    return lines;
  }

  /**
   * Run a specific story by its ID, skipping any uncompleted stories before it.
   * This allows jumping directly to a specific story for debugging or resuming work.
   */
  public async runStory(projectPath: string, storyId: string, options?: { ignoreApiStatus?: boolean }): Promise<void> {
    if (this.state !== 'idle') {
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

  public async run(projectPath: string, options?: { ignoreApiStatus?: boolean }): Promise<void> {
    if (this.state !== 'idle') {
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

  private async runStoryInternal(projectPath: string, story: UserStory, prd: PRD, options?: { ignoreApiStatus?: boolean }): Promise<void> {
    // Check API status unless bypassed
    if (!options?.ignoreApiStatus) {
      const apiStatus = await checkApiStatus();
      if (shouldWarnAboutStatus(apiStatus)) {
        const statusMessage = `⚠️  Warning: Claude API status is '${apiStatus.status}' - ${apiStatus.message}\n`;
        this.outputCallback?.(statusMessage, 'stderr');

        // Give user 3 seconds to cancel before proceeding
        this.outputCallback?.('   Starting in 3 seconds... Press Ctrl+C to cancel or set RALPH_IGNORE_API_STATUS=true\n', 'stdout');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const cli = this.detectAICLI();
    if (!cli) {
      const error = 'No AI CLI found. Install: claude, opencode, codex, gemini, aider, or cody';
      this.emitStatus({ state: 'idle', error });
      throw new Error(error);
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
    const retryCount = this.storyRetryCount.get(story.id) || 0;
    this.emitStatus({
      state: 'running',
      startTime: this.startTime,
      currentStory: story.id,
      retryCount
    });

    const prompt = this.buildPrompt(story, prd);
    const { args, useStdin, parseJson, shell } = this.getCLIConfig(cli, prompt);

    this.outputCallback?.(`\n═══ Starting ${story.id}: ${story.title} ═══\n`, 'stdout');
    this.outputCallback?.(`Using CLI: ${cli}\n`, 'stdout');
    this.outputCallback?.(`Complexity: ${story.complexity}\n`, 'stdout');
    this.outputCallback?.(`Iteration: ${newIterationCount}/${MAX_ITERATIONS}\n\n`, 'stdout');

    try {
      const command = shell ? `${cli} ${args.join(' ')}` : cli;
      const spawnArgs = shell ? [] : args;

      this.process = spawn(command, spawnArgs, {
        cwd: projectPath,
        env: { ...process.env },
        shell: shell,
        stdio: useStdin ? ['pipe', 'pipe', 'pipe'] : ['inherit', 'pipe', 'pipe'],
      });

      if (useStdin && this.process.stdin) {
        this.process.stdin.write(prompt);
        this.process.stdin.end();
      }

      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = parseJson ? this.parseStreamJson(text) : text.split('\n');
        lines.forEach((line, idx) => {
          if (idx === lines.length - 1 && line === '') return;
          this.outputCallback?.(line, 'stdout');
        });
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n');
        lines.forEach((line, idx) => {
          if (idx === lines.length - 1 && line === '') return;
          this.outputCallback?.(line, 'stderr');
        });
      });

      this.process.on('exit', (code: number | null) => {
        const duration = this.startTime ? Date.now() - this.startTime : 0;
        this.process = null;
        this.cleanupPromptFile();

        const exitMessage = `\n═══ ${story.id} completed (exit: ${code ?? 'unknown'}, ${(duration / 1000).toFixed(1)}s) ═══\n`;
        this.outputCallback?.(exitMessage, 'stdout');

        if (code === 0) {
          this.verifyAndContinue(story, projectPath, duration, code);
        } else {
          this.state = 'idle';
          this.currentStoryId = undefined;
          this.emitStatus({
            state: 'idle',
            exitCode: code ?? undefined,
            duration,
          });
        }
      });

      this.process.on('error', (err: Error) => {
        this.state = 'idle';
        this.process = null;
        this.cleanupPromptFile();
        const error = `Failed to start: ${err.message}`;
        this.emitStatus({ state: 'idle', error });
        this.outputCallback?.(error, 'stderr');
        this.currentStoryId = undefined;
      });
    } catch (err) {
      this.state = 'idle';
      this.process = null;
      this.currentStoryId = undefined;
      this.cleanupPromptFile();
      const error = err instanceof Error ? err.message : String(err);
      this.emitStatus({ state: 'idle', error });
      throw err;
    }
  }

  public stop(): void {
    if (this.state !== 'running' || !this.process) {
      return;
    }

    this.state = 'stopping';
    this.emitStatus({ state: 'stopping' });
    this.outputCallback?.('\n─── Stopping process... ───\n', 'stdout');

    this.process.kill('SIGTERM');

    setTimeout(() => {
      if (this.process && !this.process.killed) {
        this.outputCallback?.('\n─── Force killing process ───\n', 'stderr');
        this.process.kill('SIGKILL');
      }
    }, 5000);
  }

  public getStatus(): RalphStatus {
    const retryCount = this.currentStoryId
      ? this.storyRetryCount.get(this.currentStoryId) || 0
      : 0;
    return {
      state: this.state,
      startTime: this.startTime,
      currentStory: this.currentStoryId,
      pid: this.process?.pid,
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

  public getCurrentRetryCount(): number {
    if (!this.currentStoryId) return 0;
    return this.storyRetryCount.get(this.currentStoryId) || 0;
  }

  public retryCurrentStory(): void {
    // Only retry if we're idle and have a failed story
    if (this.state !== 'idle') {
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
    this.statusCallback?.(status);
  }

  private verifyAndContinue(
    story: UserStory,
    projectPath: string,
    duration: number,
    exitCode: number | null,
  ): void {
    this.outputCallback?.(`\n─── Verifying ${story.id} acceptance criteria... ───\n`, 'stdout');

    const onProgress = (result: ACTestResult, index: number, total: number) => {
      const icon = result.passes ? '✓' : '✗';
      const color = result.passes ? '' : '[FAIL] ';
      this.outputCallback?.(
        `  ${color}${icon} AC-${index + 1}/${total}: ${result.passes ? 'PASS' : 'FAIL'}`,
        'stdout',
      );
    };

    const testResults = runStoryTestsAndSave(projectPath, story.id, onProgress);

    if (testResults) {
      const passedCount = testResults.results.filter(r => r.passes).length;
      const totalCount = testResults.results.length;

      this.outputCallback?.(
        `\n─── Results: ${passedCount}/${totalCount} criteria passed ───\n`,
        'stdout',
      );

      if (testResults.allPassed) {
        this.storyRetryCount.delete(story.id);
        this.storyIterationCount.delete(story.id);
        this.outputCallback?.(`✓ ${story.id} VERIFIED - all acceptance criteria pass!\n`, 'stdout');

        if (testResults.projectComplete) {
          this.outputCallback?.(`\n🎉 PROJECT COMPLETE! All stories verified.\n`, 'stdout');
          if (testResults.archivedPath) {
            this.outputCallback?.(`PRD archived to: ${testResults.archivedPath}\n`, 'stdout');
          }
          this.state = 'idle';
          this.currentStoryId = undefined;
          this.emitStatus({
            state: 'idle',
            exitCode: exitCode ?? undefined,
            duration,
            storyPassed: true,
            acTestsPassed: passedCount,
            acTestsTotal: totalCount,
          });
        } else {
          this.outputCallback?.(`\n─── Moving to next story... ───\n`, 'stdout');
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

        this.outputCallback?.(
          `✗ ${story.id} FAILED - ${totalCount - passedCount} criteria not met (attempt ${newRetryCount}/${MAX_RETRIES_PER_STORY})\n`,
          'stdout',
        );

        if (newRetryCount >= MAX_RETRIES_PER_STORY) {
          this.outputCallback?.(
            `⚠ ${story.id} exceeded max retries (${MAX_RETRIES_PER_STORY}). Skipping to next story...\n`,
            'stderr',
          );
          this.storyRetryCount.delete(story.id);
          this.storyIterationCount.delete(story.id);
          this.currentStoryId = undefined;
          this.state = 'idle';

          setTimeout(() => {
            this.run(projectPath).catch(err => {
              this.outputCallback?.(`Error starting next story: ${err.message}`, 'stderr');
            });
          }, 1000);
        } else {
          this.outputCallback?.(`Re-running ${story.id} to fix issues...\n`, 'stdout');

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
