/**
 * Execution Plan Generator
 *
 * Generates an optimized execution plan from a PRD, assigning models to stories
 * based on task type, complexity, and quota availability.
 */

import type { PRD, UserStory, Complexity } from '../types';
import type {
  ExecutionPlan,
  StoryAllocation,
  ProviderQuotas,
  TaskType,
  Provider,
} from './types';
import { detectTaskType } from './task-detector';
import { getRecommendedModel, TASK_MODEL_MAPPING } from './capability-matrix';
import { estimateCost } from './quota-manager';

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

/**
 * Estimated token usage by complexity level.
 * Based on historical data from typical story implementations.
 */
export const TOKEN_ESTIMATES: Record<
  Complexity,
  { input: number; output: number; durationMinutes: number }
> = {
  simple: {
    input: 5_000, // Reading existing code, understanding context
    output: 2_000, // Writing implementation
    durationMinutes: 15,
  },
  medium: {
    input: 15_000, // More context needed, multiple files
    output: 6_000, // Larger implementation
    durationMinutes: 30,
  },
  complex: {
    input: 40_000, // Extensive codebase analysis
    output: 15_000, // Complex multi-file implementation
    durationMinutes: 60,
  },
};

// =============================================================================
// MODEL PRICING (re-export for consistency)
// =============================================================================

/**
 * Get model pricing information from quota manager.
 * This provides access to MODEL_CATALOG pricing for cost calculations.
 */
export { estimateCost };

// =============================================================================
// PLAN GENERATION
// =============================================================================

/**
 * Generate an execution plan from a PRD.
 *
 * @param prd - The Product Requirements Document
 * @param quotas - Current provider quotas (optional, for quota-aware model selection)
 * @param projectPath - Path to the project directory
 * @returns An optimized execution plan with model allocations and cost estimates
 */
export function generateExecutionPlan(
  prd: PRD,
  quotas?: ProviderQuotas,
  projectPath = ''
): ExecutionPlan {
  const generatedAt = new Date().toISOString();
  const stories: StoryAllocation[] = [];

  // Analyze each user story and assign models
  for (const story of prd.userStories) {
    const allocation = createStoryAllocation(story, quotas);
    stories.push(allocation);
  }

  // Calculate summary statistics
  const uniqueModels = new Set(stories.map(s => s.recommendedModel.modelId));
  const modelsUsed: string[] = [];
  uniqueModels.forEach(model => modelsUsed.push(model));

  const summary = {
    totalStories: stories.length,
    estimatedTotalCost: stories.reduce((sum, s) => sum + s.estimatedCost, 0),
    estimatedTotalDuration: stories.reduce((sum, s) => sum + s.estimatedDuration, 0),
    modelsUsed,
    canCompleteWithCurrentQuotas: checkQuotaSufficiency(stories, quotas),
    quotaWarnings: generateQuotaWarnings(stories, quotas),
  };

  // Generate cost comparisons
  const comparisons = {
    allClaude: calculateAllClaudeStrategy(prd.userStories),
    allLocal: calculateAllLocalStrategy(prd.userStories),
    optimized: {
      cost: summary.estimatedTotalCost,
      duration: summary.estimatedTotalDuration,
    },
  };

  return {
    projectPath,
    prdName: prd.project,
    generatedAt,
    stories,
    summary,
    comparisons,
  };
}

/**
 * Create a story allocation with model recommendation and cost estimates.
 */
function createStoryAllocation(story: UserStory, quotas?: ProviderQuotas): StoryAllocation {
  // Detect task type from story content
  const taskType = detectTaskType(story);

  // Get recommended model based on task type and quotas
  const recommended = getRecommendedModel(taskType, quotas);

  // Estimate tokens based on complexity
  const tokenEstimate = TOKEN_ESTIMATES[story.complexity];
  const estimatedTokens = tokenEstimate.input + tokenEstimate.output;

  // Calculate cost using the recommended model
  const estimatedCost = estimateCost(
    recommended.modelId,
    tokenEstimate.input,
    tokenEstimate.output
  );

  // Generate alternative model options
  const alternativeModels = generateAlternatives(
    taskType,
    recommended.modelId,
    tokenEstimate.input,
    tokenEstimate.output
  );

  return {
    storyId: story.id,
    title: story.title,
    taskType,
    complexity: story.complexity,
    recommendedModel: {
      provider: recommended.provider,
      modelId: recommended.modelId,
      reason: recommended.reason,
      confidence: 0.8, // Default confidence, will be updated by learning system
    },
    estimatedTokens,
    estimatedCost,
    estimatedDuration: tokenEstimate.durationMinutes,
    alternativeModels,
  };
}

/**
 * Generate alternative model options for a story.
 */
function generateAlternatives(
  taskType: TaskType,
  currentModelId: string,
  inputTokens: number,
  outputTokens: number
): StoryAllocation['alternativeModels'] {
  const alternatives: StoryAllocation['alternativeModels'] = [];
  const mapping = TASK_MODEL_MAPPING[taskType];

  // Add primary and fallback if not already selected
  const candidateModels = [
    { ...mapping.primary, label: 'primary' },
    { ...mapping.fallback, label: 'fallback' },
  ];

  for (const candidate of candidateModels) {
    if (candidate.modelId === currentModelId) continue;

    const cost = estimateCost(candidate.modelId, inputTokens, outputTokens);
    const currentCost = estimateCost(currentModelId, inputTokens, outputTokens);

    let tradeoff = '';
    if (cost < currentCost) {
      const savings = ((1 - cost / currentCost) * 100).toFixed(0);
      tradeoff = `${savings}% cheaper`;
    } else if (cost > currentCost) {
      const premium = ((cost / currentCost - 1) * 100).toFixed(0);
      tradeoff = `${premium}% more expensive but ${candidate.label === 'primary' ? 'higher quality' : 'fallback option'}`;
    } else {
      tradeoff = 'Similar cost';
    }

    alternatives.push({
      modelId: candidate.modelId,
      provider: candidate.provider,
      estimatedCost: cost,
      tradeoff,
    });
  }

  return alternatives;
}

/**
 * Check if current quotas are sufficient to complete all stories.
 */
function checkQuotaSufficiency(stories: StoryAllocation[], quotas?: ProviderQuotas): boolean {
  if (!quotas) return true; // Can't check without quota info

  // Group stories by provider
  const providerCosts: Record<Provider, number> = {
    anthropic: 0,
    openai: 0,
    openrouter: 0,
    gemini: 0,
    local: 0,
  };

  for (const story of stories) {
    providerCosts[story.recommendedModel.provider] += story.estimatedCost;
  }

  // Check each provider's quota
  for (const [provider, totalCost] of Object.entries(providerCosts) as [Provider, number][]) {
    const quota = quotas[provider];
    if (!quota) continue;

    // For credit-based quotas, check if we have enough credits
    if (quota.quotaType === 'credits' && quota.creditsRemaining !== undefined) {
      if (quota.creditsRemaining < totalCost) {
        return false;
      }
    }

    // For exhausted quotas, we can't complete
    if (quota.status === 'exhausted' || quota.status === 'unavailable') {
      return false;
    }
  }

  return true;
}

/**
 * Generate warnings about quota issues.
 */
function generateQuotaWarnings(stories: StoryAllocation[], quotas?: ProviderQuotas): string[] {
  const warnings: string[] = [];
  if (!quotas) return warnings;

  // Group stories by provider
  const providerUsage: Record<Provider, { count: number; cost: number }> = {
    anthropic: { count: 0, cost: 0 },
    openai: { count: 0, cost: 0 },
    openrouter: { count: 0, cost: 0 },
    gemini: { count: 0, cost: 0 },
    local: { count: 0, cost: 0 },
  };

  for (const story of stories) {
    const provider = story.recommendedModel.provider;
    providerUsage[provider].count++;
    providerUsage[provider].cost += story.estimatedCost;
  }

  // Check each provider for issues
  for (const [provider, usage] of Object.entries(providerUsage) as [
    Provider,
    { count: number; cost: number }
  ][]) {
    if (usage.count === 0) continue;

    const quota = quotas[provider];
    if (!quota) {
      warnings.push(`${provider}: No quota information available (${usage.count} stories planned)`);
      continue;
    }

    if (quota.status === 'exhausted') {
      warnings.push(
        `${provider}: Quota exhausted but ${usage.count} stories planned ($${usage.cost.toFixed(2)})`
      );
    } else if (quota.status === 'limited') {
      warnings.push(
        `${provider}: Limited quota with ${usage.count} stories planned ($${usage.cost.toFixed(2)})`
      );
    } else if (quota.status === 'unavailable') {
      warnings.push(`${provider}: Unavailable (${usage.count} stories planned)`);
    }

    // Check credit-based quotas
    if (quota.quotaType === 'credits' && quota.creditsRemaining !== undefined) {
      if (quota.creditsRemaining < usage.cost) {
        warnings.push(
          `${provider}: Insufficient credits ($${quota.creditsRemaining.toFixed(2)} remaining, $${usage.cost.toFixed(2)} needed)`
        );
      }
    }
  }

  return warnings;
}

/**
 * Calculate cost for "all Claude" strategy using Sonnet for all stories.
 */
function calculateAllClaudeStrategy(stories: UserStory[]): { cost: number; duration: number } {
  const claudeModel = 'claude-sonnet-4-20250514';
  let totalCost = 0;
  let totalDuration = 0;

  for (const story of stories) {
    const tokenEstimate = TOKEN_ESTIMATES[story.complexity];
    totalCost += estimateCost(claudeModel, tokenEstimate.input, tokenEstimate.output);
    totalDuration += tokenEstimate.durationMinutes;
  }

  return { cost: totalCost, duration: totalDuration };
}

/**
 * Calculate cost for "all local" strategy (free but slower).
 */
function calculateAllLocalStrategy(stories: UserStory[]): { cost: number; duration: number } {
  let totalDuration = 0;

  for (const story of stories) {
    const tokenEstimate = TOKEN_ESTIMATES[story.complexity];
    // Local models are typically 1.5x slower
    totalDuration += tokenEstimate.durationMinutes * 1.5;
  }

  return { cost: 0, duration: totalDuration };
}
