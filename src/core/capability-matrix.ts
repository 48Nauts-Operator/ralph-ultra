/**
 * Model Capability Matrix
 *
 * Maps models to their capabilities and provides task-to-model recommendations
 * based on required capabilities and quota availability.
 */

import type { TaskType, ModelCapability, Provider, ProviderQuota, ExecutionMode } from './types';

// =============================================================================
// MODEL CAPABILITIES
// =============================================================================

/**
 * Maps each model ID to its capability set.
 * This is the single source of truth for model capabilities.
 */
export const MODEL_CAPABILITIES: Record<string, ModelCapability[]> = {
  // Anthropic Models
  'claude-opus-4-20250514': ['deep-reasoning', 'mathematical', 'code-generation', 'long-context'],
  'claude-sonnet-4-20250514': ['code-generation', 'creative', 'deep-reasoning'],
  'claude-3-5-haiku-20241022': ['code-generation', 'fast', 'cheap'],

  // OpenAI Models (via OpenCode)
  'gpt-5.2-codex': ['code-generation', 'structured-output', 'deep-reasoning'],
  'gpt-5.1-codex-mini': ['code-generation', 'fast', 'cheap', 'structured-output'],
  'gpt-5.2': ['mathematical', 'deep-reasoning'],

  // Google Models
  'gemini-2.0-flash': ['fast', 'cheap', 'creative', 'long-context'],
  'gemini-1.5-pro': ['long-context', 'multimodal', 'code-generation'],

  // OpenRouter Models
  'deepseek-coder': ['code-generation', 'cheap'],

  // Local Models
  'llama-3.1-70b': ['code-generation', 'cheap'],
  'qwen-2.5-coder': ['code-generation', 'cheap'],
};

// =============================================================================
// TASK MODEL MAPPING
// =============================================================================

/**
 * Maps each TaskType to recommended models (primary and fallback).
 * Ordered by priority - first model is preferred if quota allows.
 */
export const TASK_MODEL_MAPPING: Record<
  TaskType,
  {
    primary: { modelId: string; provider: Provider };
    fallback: { modelId: string; provider: Provider };
  }
> = {
  'complex-integration': {
    primary: { modelId: 'claude-opus-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
  },
  mathematical: {
    primary: { modelId: 'gpt-5.2', provider: 'openai' },
    fallback: { modelId: 'claude-opus-4-20250514', provider: 'anthropic' },
  },
  'backend-api': {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  'backend-logic': {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  'frontend-ui': {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gemini-2.0-flash', provider: 'gemini' },
  },
  'frontend-logic': {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  database: {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  testing: {
    primary: { modelId: 'gpt-5.2-codex', provider: 'openai' },
    fallback: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
  },
  documentation: {
    primary: { modelId: 'gemini-2.0-flash', provider: 'gemini' },
    fallback: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
  },
  refactoring: {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  bugfix: {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  devops: {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  config: {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  unknown: {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
};

// =============================================================================
// MODE-SPECIFIC MODEL MAPPINGS
// =============================================================================

/**
 * SUPER SAVER mode: Prioritize cheapest models that can still handle the task.
 * Uses haiku, gpt-5.1-codex-mini, gemini-flash, and local models.
 */
export const SUPER_SAVER_MAPPING: Record<
  TaskType,
  {
    primary: { modelId: string; provider: Provider };
    fallback: { modelId: string; provider: Provider };
  }
> = {
  'complex-integration': {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' }, // Complex tasks need quality
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  mathematical: {
    primary: { modelId: 'gpt-5.2', provider: 'openai' }, // Math needs reasoning
    fallback: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
  },
  'backend-api': {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  'backend-logic': {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  'frontend-ui': {
    primary: { modelId: 'gemini-2.0-flash', provider: 'gemini' },
    fallback: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
  },
  'frontend-logic': {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  database: {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  testing: {
    primary: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
    fallback: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
  },
  documentation: {
    primary: { modelId: 'gemini-2.0-flash', provider: 'gemini' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  refactoring: {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  bugfix: {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  devops: {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  config: {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
  unknown: {
    primary: { modelId: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.1-codex-mini', provider: 'openai' },
  },
};

/**
 * FAST DELIVERY mode: Prioritize premium models for speed and quality.
 * Uses opus, sonnet, gpt-5.2-codex for best results.
 */
export const FAST_DELIVERY_MAPPING: Record<
  TaskType,
  {
    primary: { modelId: string; provider: Provider };
    fallback: { modelId: string; provider: Provider };
  }
> = {
  'complex-integration': {
    primary: { modelId: 'claude-opus-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
  },
  mathematical: {
    primary: { modelId: 'gpt-5.2', provider: 'openai' },
    fallback: { modelId: 'claude-opus-4-20250514', provider: 'anthropic' },
  },
  'backend-api': {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  'backend-logic': {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  'frontend-ui': {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  'frontend-logic': {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  database: {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  testing: {
    primary: { modelId: 'gpt-5.2-codex', provider: 'openai' },
    fallback: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
  },
  documentation: {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  refactoring: {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  bugfix: {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  devops: {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  config: {
    primary: { modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
  unknown: {
    primary: { modelId: 'claude-opus-4-20250514', provider: 'anthropic' },
    fallback: { modelId: 'gpt-5.2-codex', provider: 'openai' },
  },
};

// =============================================================================
// RECOMMENDATION LOGIC
// =============================================================================

/**
 * Get recommended model for a task type based on available quotas and execution mode.
 *
 * @param taskType - The type of task to perform
 * @param quotas - Current provider quotas (optional, for quota-aware selection)
 * @param mode - Execution mode (optional, defaults to 'balanced')
 * @returns The best available model ID and provider
 */
export function getRecommendedModel(
  taskType: TaskType,
  quotas?: Record<Provider, ProviderQuota>,
  mode?: ExecutionMode,
): { modelId: string; provider: Provider; reason: string } {
  // Select the appropriate mapping based on execution mode
  let mapping: (typeof TASK_MODEL_MAPPING)[TaskType];

  switch (mode) {
    case 'super-saver':
      mapping = SUPER_SAVER_MAPPING[taskType];
      break;
    case 'fast-delivery':
      mapping = FAST_DELIVERY_MAPPING[taskType];
      break;
    case 'balanced':
    default:
      mapping = TASK_MODEL_MAPPING[taskType];
      break;
  }

  // If no quotas provided, return primary model
  if (!quotas) {
    return {
      modelId: mapping.primary.modelId,
      provider: mapping.primary.provider,
      reason: 'Primary model for task type',
    };
  }

  // Check if primary model's provider has quota available
  const primaryQuota = quotas[mapping.primary.provider];
  if (primaryQuota && isQuotaAvailable(primaryQuota)) {
    return {
      modelId: mapping.primary.modelId,
      provider: mapping.primary.provider,
      reason: 'Primary model with available quota',
    };
  }

  // Check fallback model's provider quota
  const fallbackQuota = quotas[mapping.fallback.provider];
  if (fallbackQuota && isQuotaAvailable(fallbackQuota)) {
    return {
      modelId: mapping.fallback.modelId,
      provider: mapping.fallback.provider,
      reason: 'Fallback model (primary quota exhausted)',
    };
  }

  // If both are exhausted, try to find any available provider with matching capabilities
  const requiredCapabilities = getRequiredCapabilities(taskType);
  for (const [provider, quota] of Object.entries(quotas)) {
    if (isQuotaAvailable(quota)) {
      // Find a model from this provider that has the required capabilities
      const model = findModelWithCapabilities(provider as Provider, requiredCapabilities, quota);
      if (model) {
        return {
          modelId: model,
          provider: provider as Provider,
          reason: `Alternative ${provider} model (both primary and fallback exhausted)`,
        };
      }
    }
  }

  // Last resort: return primary model even if quota is exhausted
  // (caller should handle quota errors)
  return {
    modelId: mapping.primary.modelId,
    provider: mapping.primary.provider,
    reason: 'Primary model (warning: all quotas may be exhausted)',
  };
}

/**
 * Check if a provider quota is available for use
 */
function isQuotaAvailable(quota: ProviderQuota): boolean {
  return quota.status === 'available' || quota.status === 'limited';
}

/**
 * Get required capabilities for a task type
 */
function getRequiredCapabilities(taskType: TaskType): ModelCapability[] {
  const mapping = TASK_MODEL_MAPPING[taskType];
  return MODEL_CAPABILITIES[mapping.primary.modelId] || ['code-generation'];
}

/**
 * Find a model from a provider that has the required capabilities
 */
function findModelWithCapabilities(
  _provider: Provider,
  requiredCapabilities: ModelCapability[],
  quota: ProviderQuota,
): string | null {
  // Get all models for this provider from the quota object
  const models = quota.models || [];

  // Find a model that has all required capabilities
  for (const model of models) {
    const modelCapabilities = MODEL_CAPABILITIES[model.id] || [];
    const hasAllCapabilities = requiredCapabilities.every(cap => modelCapabilities.includes(cap));

    if (hasAllCapabilities) {
      return model.id;
    }
  }

  // If no exact match, return the first available model from the provider
  return models.length > 0 ? (models[0]?.id ?? null) : null;
}
