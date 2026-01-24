import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

const CLAUDE_PROJECTS_DIR = join(os.homedir(), '.claude', 'projects');
const CLAUDE_COST_PER_1K_INPUT = 0.003;
const CLAUDE_COST_PER_1K_OUTPUT = 0.015;
const ANTHROPIC_USAGE_API = 'https://api.anthropic.com/api/oauth/usage';

export interface QuotaInfo {
  fiveHour: {
    utilization: number;
    resetsAt: string | null;
  };
  sevenDay: {
    utilization: number;
    resetsAt: string | null;
  };
}

export interface ContextBudget {
  /** 5-hour utilization percentage */
  fiveHourPercent: number;
  /** 7-day utilization percentage */
  sevenDayPercent: number;
  /** Time until 5-hour reset */
  fiveHourResetsAt: string | null;
  /** Time until 7-day reset */
  sevenDayResetsAt: string | null;
  /** Whether approaching limit (>80%) */
  approaching: boolean;
  /** Whether at or exceeding limit (>95%) */
  exceeded: boolean;
}

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
  contextBudget: ContextBudget;
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

function getOAuthToken(): string | null {
  try {
    const creds = execSync(
      `security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || security find-generic-password -s "Claude Code" -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();

    if (!creds) return null;
    const parsed = JSON.parse(creds);
    return parsed?.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

let cachedQuota: { data: QuotaInfo; timestamp: number } | null = null;
const QUOTA_CACHE_MS = 30000; // Cache for 30 seconds

export function getQuotaInfo(): QuotaInfo | null {
  // Return cached if fresh
  if (cachedQuota && Date.now() - cachedQuota.timestamp < QUOTA_CACHE_MS) {
    return cachedQuota.data;
  }

  const token = getOAuthToken();
  if (!token) return null;

  try {
    const response = execSync(
      `curl -s -H "Authorization: Bearer ${token}" -H "anthropic-beta: oauth-2025-04-20" "${ANTHROPIC_USAGE_API}"`,
      { encoding: 'utf-8', timeout: 10000 },
    );

    const data = JSON.parse(response);
    const quota: QuotaInfo = {
      fiveHour: {
        utilization: data?.five_hour?.utilization ?? 0,
        resetsAt: data?.five_hour?.resets_at ?? null,
      },
      sevenDay: {
        utilization: data?.seven_day?.utilization ?? 0,
        resetsAt: data?.seven_day?.resets_at ?? null,
      },
    };

    cachedQuota = { data: quota, timestamp: Date.now() };
    return quota;
  } catch {
    return null;
  }
}

export function getContextBudget(): ContextBudget {
  const quota = getQuotaInfo();

  if (!quota) {
    return {
      fiveHourPercent: 0,
      sevenDayPercent: 0,
      fiveHourResetsAt: null,
      sevenDayResetsAt: null,
      approaching: false,
      exceeded: false,
    };
  }

  const fiveHour = quota.fiveHour.utilization;
  const sevenDay = quota.sevenDay.utilization;
  const approaching = fiveHour > 80 || sevenDay > 80;
  const exceeded = fiveHour > 95 || sevenDay > 95;

  return {
    fiveHourPercent: Math.round(fiveHour * 10) / 10,
    sevenDayPercent: Math.round(sevenDay * 10) / 10,
    fiveHourResetsAt: quota.fiveHour.resetsAt,
    sevenDayResetsAt: quota.sevenDay.resetsAt,
    approaching,
    exceeded,
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

  return processes;
}

export function getSessionInfo(projectPath: string): SessionInfo {
  const model = getClaudeModel(projectPath);
  const cost = getClaudeSessionCost(projectPath);
  const contextBudget = getContextBudget();

  return {
    model,
    cost,
    contextBudget,
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
