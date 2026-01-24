/**
 * Core types for Ralph Ultra Quota Manager & Dashboard-Ready Architecture
 *
 * These types are shared between TUI and future Web Dashboard
 */

// =============================================================================
// PROVIDERS & MODELS
// =============================================================================

export type Provider = 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'local';

export interface ModelInfo {
  id: string;
  name: string;
  provider: Provider;
  inputCostPer1M: number; // USD per 1M tokens
  outputCostPer1M: number; // USD per 1M tokens
  contextWindow: number; // Max tokens
  capabilities: ModelCapability[];
  available: boolean;
}

export type ModelCapability =
  | 'deep-reasoning' // Complex multi-step logic
  | 'mathematical' // Math proofs, algorithms
  | 'code-generation' // General coding
  | 'structured-output' // JSON, tests, specs
  | 'creative' // UI/UX, prose, design
  | 'long-context' // Large file analysis
  | 'multimodal' // Images, diagrams
  | 'fast' // Quick responses
  | 'cheap'; // Low cost

// =============================================================================
// QUOTAS
// =============================================================================

export interface ProviderQuota {
  provider: Provider;
  status: 'available' | 'limited' | 'exhausted' | 'unavailable' | 'unknown' | 'error';

  // Different providers report quotas differently
  quotaType: 'percentage' | 'credits' | 'rate-limit' | 'unlimited' | 'local' | 'subscription';

  // For percentage-based (Anthropic, Gemini)
  usagePercent?: number;
  resetTime?: string; // ISO timestamp or duration string

  // For credit-based (OpenAI, OpenRouter)
  creditsRemaining?: number;
  creditsTotal?: number;

  // For rate-limit based
  requestsRemaining?: number;
  requestsLimit?: number;
  tokensRemaining?: number;
  tokensLimit?: number;

  // Models available under this provider
  models: ModelInfo[];

  // Last checked
  lastUpdated: string;
  error?: string;
}

export type ProviderQuotas = Record<Provider, ProviderQuota>;

// =============================================================================
// TASK ANALYSIS
// =============================================================================

export type TaskType =
  | 'complex-integration' // Multi-system, architectural
  | 'mathematical' // Algorithms, calculations
  | 'backend-api' // REST/GraphQL endpoints
  | 'backend-logic' // Business logic, services
  | 'frontend-ui' // Visual components, styling
  | 'frontend-logic' // Hooks, state management
  | 'database' // Schema, queries, migrations
  | 'testing' // Unit, integration, E2E
  | 'documentation' // README, API docs
  | 'refactoring' // Code cleanup
  | 'bugfix' // Issue resolution
  | 'devops' // CI/CD, Docker
  | 'config' // Setup, configuration
  | 'unknown';

export interface TaskAnalysis {
  storyId: string;
  detectedTaskType: TaskType;
  detectedCapabilities: ModelCapability[];
  confidence: number; // 0-1
  keywords: string[]; // What triggered the detection
}

// =============================================================================
// EXECUTION MODES
// =============================================================================

export type ExecutionMode = 'balanced' | 'super-saver' | 'fast-delivery';

export interface ExecutionModeConfig {
  mode: ExecutionMode;
  description: string;
  modelStrategy: 'recommended' | 'cheapest' | 'fastest' | 'most-reliable';
}

// =============================================================================
// EXECUTION PLAN
// =============================================================================

export interface StoryAllocation {
  storyId: string;
  title: string;
  taskType: TaskType;
  complexity: 'simple' | 'medium' | 'complex';

  // Recommended/Selected model (recommendedModel is alias for AC compatibility)
  recommendedModel: {
    provider: Provider;
    modelId: string;
    reason: string;
    confidence: number; // 0-1 based on learning data
  };

  // Estimates
  estimatedTokens: number;
  estimatedCost: number;
  estimatedDuration: number; // minutes

  // Alternative models (alternativeModels is the AC-compatible name)
  alternativeModels: {
    modelId: string;
    provider: Provider;
    estimatedCost: number;
    tradeoff: string; // e.g., "2x slower but 5x cheaper"
  }[];
}

export interface ExecutionPlan {
  projectPath: string;
  prdName: string;
  generatedAt: string;
  selectedMode?: ExecutionMode;

  stories: StoryAllocation[];

  summary: {
    totalStories: number;
    estimatedTotalCost: number;
    estimatedTotalDuration: number; // minutes
    modelsUsed: string[];
    canCompleteWithCurrentQuotas: boolean;
    quotaWarnings: string[];
  };

  // Cost comparisons
  comparisons: {
    allClaude: { cost: number; duration: number };
    allLocal: { cost: number; duration: number };
    optimized: { cost: number; duration: number }; // Current plan
    superSaver: { cost: number; duration: number }; // Super Saver mode
    fastDelivery: { cost: number; duration: number }; // Fast Delivery mode
  };
}

// =============================================================================
// LEARNING & PERFORMANCE
// =============================================================================

export interface ModelPerformanceRecord {
  id: string;
  timestamp: string;

  // Context
  project: string;
  storyId: string;
  storyTitle: string;
  taskType: TaskType;
  complexity: 'simple' | 'medium' | 'complex';
  detectedCapabilities: ModelCapability[];

  // Model used
  provider: Provider;
  modelId: string;

  // Performance metrics
  durationMinutes: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUSD: number;

  // Outcome
  success: boolean;
  retryCount: number;
  acTotal: number;
  acPassed: number;
  acPassRate: number;

  // Calculated scores (for ranking)
  efficiencyScore: number; // Higher = better value
  speedScore: number; // Higher = faster
  reliabilityScore: number; // Higher = more reliable
}

export interface ModelLearning {
  modelId: string;
  provider: Provider;
  taskType: TaskType;

  // Aggregated stats
  totalRuns: number;
  successfulRuns: number;
  successRate: number;

  avgDurationMinutes: number;
  avgCostUSD: number;
  avgTokens: number;
  avgAcPassRate: number;

  // Scores (0-100)
  efficiencyScore: number;
  speedScore: number;
  reliabilityScore: number;
  overallScore: number; // Weighted combination

  lastUpdated: string;
}

export interface ModelRecommendation {
  taskType: TaskType;
  requiredCapabilities: ModelCapability[];

  primary: {
    provider: Provider;
    modelId: string;
    confidence: number;
    reason: string;
  };

  fallback?: {
    provider: Provider;
    modelId: string;
    reason: string;
  };

  cheapest?: { modelId: string; avgCost: number };
  fastest?: { modelId: string; avgDuration: number };
  mostReliable?: { modelId: string; successRate: number };
}

export interface ModelLearningDB {
  version: '1.0';
  lastUpdated: string;

  // Individual run records
  runs: ModelPerformanceRecord[];

  // Aggregated learnings by model + taskType
  learnings: Record<string, Record<TaskType, ModelLearning>>;

  // Cached recommendations by taskType
  recommendations: Record<TaskType, ModelRecommendation>;
}

// =============================================================================
// APPLICATION STATE
// =============================================================================

export interface RalphCoreState {
  // Connection
  connected: boolean;

  // Quotas
  quotas: ProviderQuotas;
  quotasLastUpdated: string | null;

  // Current project
  currentProject: string | null;
  executionPlan: ExecutionPlan | null;

  // Execution state
  executionStatus: 'idle' | 'planning' | 'running' | 'paused' | 'stopped' | 'complete';
  currentStoryIndex: number;
  currentStoryId: string | null;
  currentModel: string | null;

  // Progress
  completedStories: {
    storyId: string;
    success: boolean;
    model: string;
    cost: number;
    duration: number;
  }[];
  totalCost: number;
  totalDuration: number;

  // Learning
  learnings: ModelLearningDB;
}

// =============================================================================
// EVENTS
// =============================================================================

export type RalphEvent =
  // Quota events
  | { type: 'quota-update'; data: ProviderQuotas }
  | { type: 'quota-warning'; data: { provider: Provider; message: string } }

  // Planning events
  | { type: 'plan-started'; data: { project: string } }
  | { type: 'plan-ready'; data: ExecutionPlan }
  | { type: 'plan-failed'; data: { error: string } }

  // Execution events
  | { type: 'execution-started'; data: { project: string; totalStories: number } }
  | {
      type: 'story-started';
      data: { storyId: string; model: string; estimatedCost: number };
    }
  | { type: 'story-progress'; data: { storyId: string; output: string } }
  | {
      type: 'story-completed';
      data: {
        storyId: string;
        success: boolean;
        cost: number;
        duration: number;
        acPassed: number;
        acTotal: number;
      };
    }
  | {
      type: 'story-failed';
      data: { storyId: string; error: string; retryCount: number };
    }
  | { type: 'execution-paused'; data: { storyId: string } }
  | { type: 'execution-resumed'; data: { storyId: string } }
  | { type: 'execution-stopped'; data: { reason: string } }
  | {
      type: 'execution-complete';
      data: { totalCost: number; duration: number; successRate: number };
    }

  // Learning events
  | { type: 'learning-recorded'; data: ModelPerformanceRecord }
  | {
      type: 'recommendation-updated';
      data: { taskType: TaskType; newModel: string };
    }

  // State sync (for dashboard)
  | { type: 'state-snapshot'; data: RalphCoreState };

// =============================================================================
// COMMANDS
// =============================================================================

export type RalphCommand =
  // Execution control
  | { action: 'start'; projectPath: string }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'stop' }
  | { action: 'skip-story' }
  | { action: 'restart-story'; storyId: string }

  // Model control
  | { action: 'override-model'; storyId: string; modelId: string; provider: Provider }
  | { action: 'refresh-quotas' }
  | { action: 'regenerate-plan' }

  // View control (TUI specific but included for consistency)
  | { action: 'switch-view'; view: number }
  | { action: 'switch-project'; projectPath: string };
