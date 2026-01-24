import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type {
  ModelPerformanceRecord,
  ModelLearningDB,
  ModelLearning,
  TaskType,
  Provider,
} from './types';
import { ralphEvents } from './event-bus';

/**
 * Configuration directory path (~/.config/ralph-ultra/)
 */
const CONFIG_DIR = join(homedir(), '.config', 'ralph-ultra');

/**
 * Learning data file path
 */
const LEARNING_FILE = join(CONFIG_DIR, 'learning.json');

/**
 * LearningRecorder - Records model performance data for future recommendations
 *
 * Tracks model performance across different task types and calculates:
 * - Efficiency scores (cost vs quality)
 * - Speed scores (duration performance)
 * - Reliability scores (success rate)
 */
export class LearningRecorder {
  private db: ModelLearningDB;

  constructor() {
    this.db = this.loadLearningDB();
  }

  /**
   * Ensure the config directory exists
   */
  private ensureConfigDir(): void {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  /**
   * Load learning database from disk
   */
  private loadLearningDB(): ModelLearningDB {
    this.ensureConfigDir();

    try {
      if (existsSync(LEARNING_FILE)) {
        const content = readFileSync(LEARNING_FILE, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to load learning database:', error);
    }

    // Return empty database if file doesn't exist or failed to load
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      runs: [],
      learnings: {},
      recommendations: {} as Record<string, never>,
    };
  }

  /**
   * Save learning database to disk
   */
  private saveLearningDB(): void {
    this.ensureConfigDir();

    try {
      const updated = {
        ...this.db,
        lastUpdated: new Date().toISOString(),
      };
      writeFileSync(LEARNING_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save learning database:', error);
    }
  }

  /**
   * Calculate efficiency score (0-100)
   * Higher score = better value (quality per dollar)
   *
   * Formula: (acPassRate / costUSD) * normalizationFactor
   */
  private calculateEfficiencyScore(record: ModelPerformanceRecord): number {
    if (record.costUSD === 0) return 100; // Free models get max efficiency
    if (record.acPassRate === 0) return 0; // Failed runs get 0

    // Normalize: $0.01 with 100% pass rate = score of 100
    const rawScore = (record.acPassRate * 100) / (record.costUSD * 100);
    return Math.min(100, Math.max(0, rawScore));
  }

  /**
   * Calculate speed score (0-100)
   * Higher score = faster completion
   *
   * Formula: Inverse of duration, normalized
   */
  private calculateSpeedScore(record: ModelPerformanceRecord): number {
    if (record.durationMinutes <= 0) return 100;

    // Normalize: 1 minute = score of 100, 10 minutes = score of 10
    const rawScore = 100 / record.durationMinutes;
    return Math.min(100, Math.max(0, rawScore));
  }

  /**
   * Calculate reliability score (0-100)
   * Higher score = more reliable (success + pass rate)
   *
   * Formula: Combines success status and AC pass rate
   */
  private calculateReliabilityScore(record: ModelPerformanceRecord): number {
    const successWeight = record.success ? 1.0 : 0.5; // Failed runs get half score
    const retryPenalty = Math.max(0, 1 - record.retryCount * 0.1); // -10% per retry

    return record.acPassRate * 100 * successWeight * retryPenalty;
  }

  /**
   * Record a completed story run
   *
   * @param record - Performance record for the completed run
   */
  recordRun(record: Omit<ModelPerformanceRecord, 'id' | 'timestamp' | 'efficiencyScore' | 'speedScore' | 'reliabilityScore'>): ModelPerformanceRecord {
    // Generate ID and timestamp
    const completeRecord: ModelPerformanceRecord = {
      ...record,
      id: `${record.storyId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      efficiencyScore: this.calculateEfficiencyScore(record as ModelPerformanceRecord),
      speedScore: this.calculateSpeedScore(record as ModelPerformanceRecord),
      reliabilityScore: this.calculateReliabilityScore(record as ModelPerformanceRecord),
    };

    // Add to runs
    this.db.runs.push(completeRecord);

    // Update aggregated learnings
    this.updateLearnings(completeRecord);

    // Save to disk
    this.saveLearningDB();

    // Emit event
    ralphEvents.emit({ type: 'learning-recorded', data: completeRecord });

    return completeRecord;
  }

  /**
   * Update aggregated learning stats for a model + taskType combination
   */
  private updateLearnings(record: ModelPerformanceRecord): void {
    const modelKey = `${record.provider}:${record.modelId}`;
    const taskType = record.taskType;

    // Initialize model entry if needed
    if (!this.db.learnings[modelKey]) {
      this.db.learnings[modelKey] = {} as Record<TaskType, ModelLearning>;
    }

    // Get all runs for this model + taskType
    const relevantRuns = this.db.runs.filter(
      r => r.provider === record.provider && r.modelId === record.modelId && r.taskType === taskType,
    );

    if (relevantRuns.length === 0) return;

    // Calculate aggregated stats
    const totalRuns = relevantRuns.length;
    const successfulRuns = relevantRuns.filter(r => r.success).length;
    const successRate = successfulRuns / totalRuns;

    const avgDurationMinutes =
      relevantRuns.reduce((sum, r) => sum + r.durationMinutes, 0) / totalRuns;
    const avgCostUSD = relevantRuns.reduce((sum, r) => sum + r.costUSD, 0) / totalRuns;
    const avgTokens = relevantRuns.reduce((sum, r) => sum + r.totalTokens, 0) / totalRuns;
    const avgAcPassRate = relevantRuns.reduce((sum, r) => sum + r.acPassRate, 0) / totalRuns;

    const avgEfficiencyScore =
      relevantRuns.reduce((sum, r) => sum + r.efficiencyScore, 0) / totalRuns;
    const avgSpeedScore = relevantRuns.reduce((sum, r) => sum + r.speedScore, 0) / totalRuns;
    const avgReliabilityScore =
      relevantRuns.reduce((sum, r) => sum + r.reliabilityScore, 0) / totalRuns;

    // Overall score: weighted combination
    // Weights: reliability (40%), efficiency (35%), speed (25%)
    const overallScore =
      avgReliabilityScore * 0.4 + avgEfficiencyScore * 0.35 + avgSpeedScore * 0.25;

    // Update learnings
    this.db.learnings[modelKey][taskType] = {
      modelId: record.modelId,
      provider: record.provider,
      taskType,
      totalRuns,
      successfulRuns,
      successRate,
      avgDurationMinutes,
      avgCostUSD,
      avgTokens,
      avgAcPassRate,
      efficiencyScore: avgEfficiencyScore,
      speedScore: avgSpeedScore,
      reliabilityScore: avgReliabilityScore,
      overallScore,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get aggregated stats for a specific model and task type
   *
   * @param provider - Model provider
   * @param modelId - Model identifier
   * @param taskType - Type of task
   * @returns ModelLearning stats or null if no data
   */
  getModelStats(provider: Provider, modelId: string, taskType: TaskType): ModelLearning | null {
    const modelKey = `${provider}:${modelId}`;
    const modelLearnings = this.db.learnings[modelKey];
    if (!modelLearnings) return null;
    return modelLearnings[taskType] || null;
  }

  /**
   * Get the best performing model for a specific task type
   *
   * @param taskType - Type of task
   * @param minRuns - Minimum number of runs required (default: 3)
   * @returns Best model or null if no data
   */
  getBestModelForTask(taskType: TaskType, minRuns: number = 3): ModelLearning | null {
    const candidates: ModelLearning[] = [];

    // Collect all models that have enough runs for this task type
    for (const modelKey in this.db.learnings) {
      const modelLearnings = this.db.learnings[modelKey];
      if (!modelLearnings) continue;

      const learning = modelLearnings[taskType];
      if (learning && learning.totalRuns >= minRuns) {
        candidates.push(learning);
      }
    }

    if (candidates.length === 0) return null;

    // Sort by overall score (descending)
    candidates.sort((a, b) => b.overallScore - a.overallScore);

    return candidates[0] ?? null;
  }

  /**
   * Get all learning stats (for debugging/export)
   */
  getAllLearnings(): ModelLearningDB {
    return this.db;
  }

  /**
   * Clear all learning data (use with caution!)
   */
  clearAllLearnings(): void {
    this.db = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      runs: [],
      learnings: {},
      recommendations: {} as Record<string, never>,
    };
    this.saveLearningDB();
  }
}

/**
 * Singleton instance
 */
export const learningRecorder = new LearningRecorder();
