import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export type ProcessState = 'idle' | 'running' | 'stopping';

export interface RalphStatus {
  state: ProcessState;
  startTime?: number;
  exitCode?: number;
  duration?: number;
  error?: string;
}

/**
 * RalphService manages Ralph Nano execution as a child process.
 * Handles starting, stopping, and monitoring Ralph Nano bash scripts.
 */
export class RalphService {
  private process: ChildProcess | null = null;
  private state: ProcessState = 'idle';
  private startTime?: number;
  private outputCallback?: (line: string, type: 'stdout' | 'stderr') => void;
  private statusCallback?: (status: RalphStatus) => void;
  private ralphPath: string;

  constructor(projectPath: string) {
    // Try to detect Ralph Nano path from environment or default location
    const envPath = process.env['RALPH_NANO_PATH'];
    if (envPath) {
      this.ralphPath = envPath;
    } else {
      // Check if ralph.sh exists in current project directory
      const localPath = join(projectPath, 'ralph.sh');
      if (existsSync(localPath)) {
        this.ralphPath = localPath;
      } else {
        // Default to assuming ralph-nano is in PATH or sibling directory
        this.ralphPath = 'ralph.sh';
      }
    }
  }

  /**
   * Register callback for receiving process output lines
   */
  public onOutput(callback: (line: string, type: 'stdout' | 'stderr') => void): void {
    this.outputCallback = callback;
  }

  /**
   * Register callback for status changes
   */
  public onStatusChange(callback: (status: RalphStatus) => void): void {
    this.statusCallback = callback;
  }

  /**
   * Start Ralph Nano process
   */
  public async run(projectPath: string): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start: process is ${this.state}`);
    }

    // Verify ralph.sh exists
    if (!existsSync(this.ralphPath)) {
      const error = `Ralph Nano not found at: ${this.ralphPath}\n\nPlease:\n1. Set RALPH_NANO_PATH environment variable, or\n2. Install Ralph Nano in your project directory`;
      this.emitStatus({ state: 'idle', error });
      throw new Error(error);
    }

    this.state = 'running';
    this.startTime = Date.now();
    this.emitStatus({ state: 'running', startTime: this.startTime });

    try {
      // Spawn ralph.sh with the project path as argument
      this.process = spawn('bash', [this.ralphPath], {
        cwd: projectPath,
        env: { ...process.env },
      });

      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
          this.outputCallback?.(line, 'stdout');
        });
      });

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
          this.outputCallback?.(line, 'stderr');
        });
      });

      // Handle process exit
      this.process.on('exit', (code: number | null) => {
        const duration = this.startTime ? Date.now() - this.startTime : 0;
        this.state = 'idle';
        this.process = null;

        this.emitStatus({
          state: 'idle',
          exitCode: code ?? undefined,
          duration,
        });

        this.outputCallback?.(
          `\n─── Process exited with code ${code ?? 'unknown'} (${(duration / 1000).toFixed(1)}s) ───\n`,
          'stdout'
        );
      });

      // Handle process errors
      this.process.on('error', (err: Error) => {
        this.state = 'idle';
        this.process = null;
        const error = `Failed to start Ralph: ${err.message}`;
        this.emitStatus({ state: 'idle', error });
        this.outputCallback?.(error, 'stderr');
      });
    } catch (err) {
      this.state = 'idle';
      this.process = null;
      const error = err instanceof Error ? err.message : String(err);
      this.emitStatus({ state: 'idle', error });
      throw err;
    }
  }

  /**
   * Stop the running Ralph process
   */
  public stop(): void {
    if (this.state !== 'running' || !this.process) {
      return;
    }

    this.state = 'stopping';
    this.emitStatus({ state: 'stopping' });
    this.outputCallback?.('\n─── Stopping Ralph process... ───\n', 'stdout');

    // Send SIGTERM for graceful shutdown
    this.process.kill('SIGTERM');

    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (this.process && !this.process.killed) {
        this.outputCallback?.('\n─── Force killing Ralph process ───\n', 'stderr');
        this.process.kill('SIGKILL');
      }
    }, 5000);
  }

  /**
   * Get current process status
   */
  public getStatus(): RalphStatus {
    return {
      state: this.state,
      startTime: this.startTime,
    };
  }

  /**
   * Check if Ralph Nano is available
   */
  public isRalphAvailable(): boolean {
    return existsSync(this.ralphPath);
  }

  /**
   * Get the Ralph path being used
   */
  public getRalphPath(): string {
    return this.ralphPath;
  }

  private emitStatus(status: RalphStatus): void {
    this.statusCallback?.(status);
  }
}
