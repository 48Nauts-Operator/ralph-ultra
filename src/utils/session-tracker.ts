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
      .sort()
      .reverse();

    for (const file of files) {
      const filePath = join(projectDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i] || '{}');
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
  try {
    const output = execSync('tmux list-sessions 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const lines = output.split('\n').filter(l => l.includes('ralph-') || l.includes('tui-'));

    return lines.map(line => {
      const parts = line.split(':');
      const name = parts[0] || 'unknown';
      const isAttached = line.includes('(attached)');

      let project = name;
      if (name.startsWith('ralph-')) {
        project = name.replace('ralph-', '').replace(/-/g, '/');
      } else if (name.startsWith('tui-')) {
        project = name.replace('tui-', '');
      }

      return {
        name,
        project,
        status: isAttached ? 'attached' : 'running',
      };
    });
  } catch {
    return [];
  }
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
