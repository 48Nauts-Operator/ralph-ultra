import type { Provider, ProviderQuota, ProviderQuotas, ModelInfo, ModelCapability } from './types';
import { ralphEvents } from './event-bus';
import { store } from './state-store';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const QUOTA_CACHE_TTL_MS = 5 * 60 * 1000;

const MODEL_CATALOG: Record<string, Omit<ModelInfo, 'available'>> = {
  'claude-opus-4-20250514': {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    inputCostPer1M: 15.0,
    outputCostPer1M: 75.0,
    contextWindow: 200000,
    capabilities: ['deep-reasoning', 'mathematical', 'code-generation', 'long-context'],
  },
  'claude-sonnet-4-20250514': {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindow: 200000,
    capabilities: ['code-generation', 'creative', 'deep-reasoning'],
  },
  'claude-3-5-haiku-20241022': {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude Haiku 3.5',
    provider: 'anthropic',
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
    contextWindow: 200000,
    capabilities: ['code-generation', 'fast', 'cheap'],
  },
  'gpt-5.2-codex': {
    id: 'gpt-5.2-codex',
    name: 'GPT-4o',
    provider: 'openai',
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    contextWindow: 128000,
    capabilities: ['code-generation', 'structured-output', 'multimodal'],
  },
  'gpt-5.1-codex-mini': {
    id: 'gpt-5.1-codex-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    contextWindow: 128000,
    capabilities: ['code-generation', 'fast', 'cheap', 'structured-output'],
  },
  'gpt-5.2': {
    id: 'gpt-5.2',
    name: 'gpt-5.2',
    provider: 'openai',
    inputCostPer1M: 1.1,
    outputCostPer1M: 4.4,
    contextWindow: 128000,
    capabilities: ['mathematical', 'deep-reasoning'],
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'gemini',
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    contextWindow: 1000000,
    capabilities: ['fast', 'cheap', 'creative', 'long-context'],
  },
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'gemini',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    contextWindow: 2000000,
    capabilities: ['long-context', 'multimodal', 'code-generation'],
  },
  'deepseek-coder': {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    provider: 'openrouter',
    inputCostPer1M: 0.14,
    outputCostPer1M: 0.28,
    contextWindow: 128000,
    capabilities: ['code-generation', 'cheap'],
  },
  'llama-3.1-70b': {
    id: 'llama-3.1-70b',
    name: 'Llama 3.1 70B',
    provider: 'local',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    contextWindow: 128000,
    capabilities: ['code-generation', 'cheap'],
  },
  'qwen-2.5-coder': {
    id: 'qwen-2.5-coder',
    name: 'Qwen 2.5 Coder',
    provider: 'local',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    contextWindow: 128000,
    capabilities: ['code-generation', 'cheap'],
  },
};

function getModelsForProvider(provider: Provider): ModelInfo[] {
  return Object.values(MODEL_CATALOG)
    .filter(m => m.provider === provider)
    .map(m => ({ ...m, available: true }));
}

interface AuthEntry {
  type?: 'oauth' | 'api';
  access?: string;
  key?: string;
  apiKey?: string;
}

function readAuthToken(provider: string): string | null {
  const authFile = join(homedir(), '.local', 'share', 'opencode', 'auth.json');
  if (!existsSync(authFile)) return null;

  try {
    const auth = JSON.parse(readFileSync(authFile, 'utf-8')) as Record<string, AuthEntry>;
    const entry = auth[provider];
    if (!entry) return null;

    if (entry.type === 'oauth' && entry.access) {
      return entry.access;
    }
    if (entry.type === 'api' && entry.key) {
      return entry.key;
    }
    return entry.apiKey || entry.key || null;
  } catch {
    return null;
  }
}

function isOAuthAuth(provider: string): boolean {
  const authFile = join(homedir(), '.local', 'share', 'opencode', 'auth.json');
  if (!existsSync(authFile)) return false;

  try {
    const auth = JSON.parse(readFileSync(authFile, 'utf-8')) as Record<string, AuthEntry>;
    const entry = auth[provider];
    return entry?.type === 'oauth' && !!entry?.access;
  } catch {
    return false;
  }
}

const LM_STUDIO_URL = process.env['LM_STUDIO_URL'] || 'http://192.168.74.179:1238/v1';

const CLAUDE_MAX_DAILY_TOKENS = 5_000_000;
const CLAUDE_MAX_WEEKLY_TOKENS = 30_000_000;

interface ClaudeUsage {
  dailyInput: number;
  dailyOutput: number;
  weeklyInput: number;
  weeklyOutput: number;
  dailyPercent: number;
  weeklyPercent: number;
}

function getClaudeUsageFromSessions(): ClaudeUsage {
  const claudeDir = join(homedir(), '.claude', 'projects');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  let dailyInput = 0;
  let dailyOutput = 0;
  let weeklyInput = 0;
  let weeklyOutput = 0;

  try {
    if (!existsSync(claudeDir)) {
      return {
        dailyInput: 0,
        dailyOutput: 0,
        weeklyInput: 0,
        weeklyOutput: 0,
        dailyPercent: 0,
        weeklyPercent: 0,
      };
    }

    const projectDirs = readdirSync(claudeDir);
    for (const projectDir of projectDirs) {
      const projectPath = join(claudeDir, projectDir);
      try {
        const files = readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          const filePath = join(projectPath, file);
          try {
            const content = readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').filter(l => l.includes('"usage"'));

            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                const timestamp = data.timestamp;
                if (!timestamp) continue;

                const msgDate = new Date(timestamp);
                const usage = data.message?.usage;
                if (!usage) continue;

                const inputTokens = usage.input_tokens || 0;
                const outputTokens = usage.output_tokens || 0;

                if (msgDate >= today) {
                  dailyInput += inputTokens;
                  dailyOutput += outputTokens;
                }
                if (msgDate >= weekAgo) {
                  weeklyInput += inputTokens;
                  weeklyOutput += outputTokens;
                }
              } catch {
                continue;
              }
            }
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    return {
      dailyInput: 0,
      dailyOutput: 0,
      weeklyInput: 0,
      weeklyOutput: 0,
      dailyPercent: 0,
      weeklyPercent: 0,
    };
  }

  const dailyTotal = dailyInput + dailyOutput;
  const weeklyTotal = weeklyInput + weeklyOutput;
  const dailyPercent = Math.min(100, (dailyTotal / CLAUDE_MAX_DAILY_TOKENS) * 100);
  const weeklyPercent = Math.min(100, (weeklyTotal / CLAUDE_MAX_WEEKLY_TOKENS) * 100);

  return { dailyInput, dailyOutput, weeklyInput, weeklyOutput, dailyPercent, weeklyPercent };
}

async function checkAnthropicQuota(): Promise<ProviderQuota> {
  const apiKey = readAuthToken('anthropic') || process.env['ANTHROPIC_API_KEY'];
  const isOAuth = isOAuthAuth('anthropic');

  if (!apiKey) {
    return {
      provider: 'anthropic',
      status: 'unknown',
      quotaType: 'rate-limit',
      models: getModelsForProvider('anthropic'),
      lastUpdated: new Date().toISOString(),
      error: 'No API key found',
    };
  }

  // For OAuth (Max Plan), use session data directly - no API call needed
  if (isOAuth) {
    const usage = getClaudeUsageFromSessions();
    const higherUsage = Math.max(usage.dailyPercent, usage.weeklyPercent);

    return {
      provider: 'anthropic',
      status: higherUsage > 90 ? 'limited' : 'available',
      quotaType: 'subscription',
      usagePercent: higherUsage,
      tokensRemaining: Math.round(CLAUDE_MAX_DAILY_TOKENS * (1 - usage.dailyPercent / 100)),
      tokensLimit: CLAUDE_MAX_DAILY_TOKENS,
      models: getModelsForProvider('anthropic'),
      lastUpdated: new Date().toISOString(),
    };
  }

  // For API keys, check rate limits via API call
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2024-01-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    const inputRemaining = response.headers.get('anthropic-ratelimit-input-tokens-remaining');
    const inputLimit = response.headers.get('anthropic-ratelimit-input-tokens-limit');
    const resetTime = response.headers.get('anthropic-ratelimit-input-tokens-reset');

    const remaining = inputRemaining ? parseInt(inputRemaining, 10) : undefined;
    const limit = inputLimit ? parseInt(inputLimit, 10) : undefined;

    if (remaining !== undefined && limit !== undefined) {
      return {
        provider: 'anthropic',
        status: remaining > 10000 ? 'available' : 'limited',
        quotaType: 'rate-limit',
        tokensRemaining: remaining,
        tokensLimit: limit,
        resetTime: resetTime ?? undefined,
        models: getModelsForProvider('anthropic'),
        lastUpdated: new Date().toISOString(),
      };
    }

    return {
      provider: 'anthropic',
      status: response.ok ? 'available' : 'limited',
      quotaType: 'rate-limit',
      models: getModelsForProvider('anthropic'),
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    return {
      provider: 'anthropic',
      status: 'error',
      quotaType: 'rate-limit',
      models: getModelsForProvider('anthropic'),
      lastUpdated: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkOpenRouterQuota(): Promise<ProviderQuota> {
  const apiKey = readAuthToken('openrouter') || process.env['OPENROUTER_API_KEY'];

  if (!apiKey) {
    return {
      provider: 'openrouter',
      status: 'unknown',
      quotaType: 'credits',
      models: getModelsForProvider('openrouter'),
      lastUpdated: new Date().toISOString(),
      error: 'No API key found',
    };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const data = (await response.json()) as {
      data?: { total_credits?: number; total_usage?: number };
    };

    if (data.data) {
      const total = data.data.total_credits ?? 0;
      const used = data.data.total_usage ?? 0;
      const remaining = total - used;

      return {
        provider: 'openrouter',
        status: remaining > 1 ? 'available' : remaining > 0 ? 'limited' : 'exhausted',
        quotaType: 'credits',
        creditsRemaining: remaining,
        creditsTotal: total,
        models: getModelsForProvider('openrouter'),
        lastUpdated: new Date().toISOString(),
      };
    }

    throw new Error('Invalid response from OpenRouter');
  } catch (error) {
    return {
      provider: 'openrouter',
      status: 'error',
      quotaType: 'credits',
      models: getModelsForProvider('openrouter'),
      lastUpdated: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkOpenAIQuota(): Promise<ProviderQuota> {
  const apiKey = readAuthToken('openai') || process.env['OPENAI_API_KEY'];

  if (!apiKey) {
    return {
      provider: 'openai',
      status: 'unknown',
      quotaType: 'subscription',
      models: getModelsForProvider('openai'),
      lastUpdated: new Date().toISOString(),
      error: 'No API key found',
    };
  }

  return {
    provider: 'openai',
    status: 'available',
    quotaType: 'subscription',
    models: getModelsForProvider('openai'),
    lastUpdated: new Date().toISOString(),
  };
}

async function checkGeminiQuota(): Promise<ProviderQuota> {
  const apiKey =
    readAuthToken('google') || process.env['GOOGLE_API_KEY'] || process.env['GEMINI_API_KEY'];

  if (!apiKey) {
    return {
      provider: 'gemini',
      status: 'unknown',
      quotaType: 'rate-limit',
      models: getModelsForProvider('gemini'),
      lastUpdated: new Date().toISOString(),
      error: 'No API key found',
    };
  }

  return {
    provider: 'gemini',
    status: 'available',
    quotaType: 'rate-limit',
    usagePercent: 0,
    models: getModelsForProvider('gemini'),
    lastUpdated: new Date().toISOString(),
  };
}

async function checkLocalQuota(): Promise<ProviderQuota> {
  try {
    const response = await fetch(`${LM_STUDIO_URL}/models`, {
      signal: AbortSignal.timeout(2000),
    });

    if (response.ok) {
      const data = (await response.json()) as { data?: { id: string }[] };
      const loadedModels = data.data ?? [];

      const models: ModelInfo[] = loadedModels.map(m => ({
        id: m.id,
        name: m.id.split('/').pop() ?? m.id,
        provider: 'local' as const,
        inputCostPer1M: 0,
        outputCostPer1M: 0,
        contextWindow: 128000,
        capabilities: ['code-generation', 'cheap'] as ModelCapability[],
        available: true,
      }));

      return {
        provider: 'local',
        status: 'available',
        quotaType: 'local',
        models,
        lastUpdated: new Date().toISOString(),
      };
    }
    throw new Error('LM Studio not responding');
  } catch {
    return {
      provider: 'local',
      status: 'unavailable',
      quotaType: 'local',
      models: [],
      lastUpdated: new Date().toISOString(),
      error: 'LM Studio not running',
    };
  }
}

let lastQuotaCheck: number = 0;
let cachedQuotas: ProviderQuotas | null = null;

export async function refreshAllQuotas(force = false): Promise<ProviderQuotas> {
  const now = Date.now();

  if (!force && cachedQuotas && now - lastQuotaCheck < QUOTA_CACHE_TTL_MS) {
    return cachedQuotas;
  }

  const [anthropic, openrouter, openai, gemini, local] = await Promise.all([
    checkAnthropicQuota(),
    checkOpenRouterQuota(),
    checkOpenAIQuota(),
    checkGeminiQuota(),
    checkLocalQuota(),
  ]);

  const quotas = {
    anthropic,
    openrouter,
    openai,
    gemini,
    local,
  } as ProviderQuotas;

  cachedQuotas = quotas;
  lastQuotaCheck = now;

  store.updateQuotas(quotas);

  for (const [provider, quota] of Object.entries(quotas)) {
    if (quota.status === 'limited' || quota.status === 'exhausted') {
      ralphEvents.emit({
        type: 'quota-warning',
        data: {
          provider: provider as Provider,
          message: `${provider} quota is ${quota.status}`,
        },
      });
    }
  }

  return quotas;
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  const model = MODEL_CATALOG[modelId];
  if (!model) return undefined;
  return { ...model, available: true };
}

export function getModelsByCapability(capability: ModelCapability): ModelInfo[] {
  return Object.values(MODEL_CATALOG)
    .filter(m => m.capabilities.includes(capability))
    .map(m => ({ ...m, available: true }));
}

export function getAllModels(): ModelInfo[] {
  return Object.values(MODEL_CATALOG).map(m => ({ ...m, available: true }));
}

export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = MODEL_CATALOG[modelId];
  if (!model) return 0;

  const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;

  return Math.round((inputCost + outputCost) * 100) / 100;
}
