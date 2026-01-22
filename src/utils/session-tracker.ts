import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

const CLAUDE_PROJECTS_DIR = join(os.homedir(), '.claude', 'projects');
const CLAUDE_COST_PER_1K_INPUT = 0.003;
const CLAUDE_COST_PER_1K_OUTPUT = 0.015;

export interface SessionCost {
  cost: number;
  tokens: {
    input: number;
    output: number;
  };
}

export interface RalphProcess {
  name: string;
  project: string;
  status: 'running' | 'attached' | 'detached';
}

export interface SessionInfo {
  model: string | null;
  cost: SessionCost;
  processes: RalphProcess[];
}

function getClaudeProjectDir(projectPath: string): string {
  const encoded = projectPath.replace(/\//g, '-').replace(/_/g, '-');
  return join(CLAUDE_PROJECTS_DIR, encoded);
}

export function getClaudeModel(projectPath: string): string | null {
  const projectDir = getClaudeProjectDir(projectPath);

  if (!existsSync(projectDir)) {
    return null;
  }

  try {
    const files = readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, path: join(projectDir, f) }))
      .sort((a, b) => {
        try {
          const aStat = require('fs').statSync(a.path);
          const bStat = require('fs').statSync(b.path);
          return bStat.mtime.getTime() - aStat.mtime.getTime();
        } catch {
          return 0;
        }
      });

    for (const file of files) {
      const content = readFileSync(file.path, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i] || '{}');
          if (parsed.message?.model) {
            return parsed.message.model;
          }
          if (parsed.model) {
            return parsed.model;
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function getClaudeSessionCost(projectPath: string): SessionCost {
  const projectDir = getClaudeProjectDir(projectPath);

  if (!existsSync(projectDir)) {
    return { cost: 0, tokens: { input: 0, output: 0 } };
  }

  let totalInput = 0;
  let totalOutput = 0;

  try {
    const files = readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = join(projectDir, file);
      const content = readFileSync(filePath, 'utf-8');

      const inputMatches = content.match(/"input_tokens":(\d+)/g) || [];
      const outputMatches = content.match(/"output_tokens":(\d+)/g) || [];

      for (const match of inputMatches) {
        const num = match.match(/(\d+)/);
        if (num) totalInput += parseInt(num[1] || '0');
      }

      for (const match of outputMatches) {
        const num = match.match(/(\d+)/);
        if (num) totalOutput += parseInt(num[1] || '0');
      }
    }
  } catch {
    return { cost: 0, tokens: { input: 0, output: 0 } };
  }

  const cost =
    (totalInput * CLAUDE_COST_PER_1K_INPUT) / 1000 +
    (totalOutput * CLAUDE_COST_PER_1K_OUTPUT) / 1000;

  return {
    cost: Math.round(cost * 10000) / 10000,
    tokens: { input: totalInput, output: totalOutput },
  };
}

export function getRalphProcesses(): RalphProcess[] {
  const processes: RalphProcess[] = [];

  try {
    const tmuxOutput = execSync('tmux list-sessions 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const tmuxLines = tmuxOutput
      .split('\n')
      .filter(l => l.includes('ralph-') || l.includes('tui-'));

    for (const line of tmuxLines) {
      const parts = line.split(':');
      const name = parts[0] || 'unknown';
      const isAttached = line.includes('(attached)');

      let project = name;
      if (name.startsWith('ralph-')) {
        project = name.replace('ralph-', '').replace(/-/g, '/');
      } else if (name.startsWith('tui-')) {
        project = name.replace('tui-', '');
      }

      processes.push({
        name,
        project,
        status: isAttached ? 'attached' : 'running',
      });
    }
  } catch (_) {
    void _;
  }

  try {
    const psOutput = execSync('pgrep -fl "claude|opencode|aider" 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const psLines = psOutput.split('\n').filter(l => l.trim());

    for (const line of psLines) {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (match) {
        const pid = match[1];
        const cmd = match[2] || '';
        const cliName = cmd.includes('claude')
          ? 'claude'
          : cmd.includes('opencode')
            ? 'opencode'
            : 'aider';
        processes.push({
          name: `${cliName} (PID ${pid})`,
          project: 'active',
          status: 'running',
        });
      }
    }
  } catch (_) {
    void _;
  }

  return processes;
}

export function getSessionInfo(projectPath: string): SessionInfo {
  return {
    model: getClaudeModel(projectPath),
    cost: getClaudeSessionCost(projectPath),
    processes: getRalphProcesses(),
  };
}

export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}
