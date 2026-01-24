import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Provider } from './types';

/**
 * Configuration directory path (~/.config/ralph-ultra/)
 */
const CONFIG_DIR = join(homedir(), '.config', 'ralph-ultra');

/**
 * Cost history file path
 */
const COST_HISTORY_FILE = join(CONFIG_DIR, 'cost-history.json');

/**
 * Record of a single story execution with cost tracking
 */
export interface StoryExecutionRecord {
  storyId: string;
  modelId: string;
  provider: Provider;
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  estimatedCost: number; // USD
  actualCost: number; // USD
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  retryCount: number;
}

/**
 * Cost history database structure
 */
interface CostHistoryDB {
  version: '1.0';
  lastUpdated: string;
  records: StoryExecutionRecord[];
}

/**
 * In-progress story tracking
 */
interface InProgressStory {
  storyId: string;
  modelId: string;
  provider: Provider;
  startTime: string;
  estimatedCost: number;
  retryCount: number;
}

/**
 * Cost tracking for story executions
 *
 * Tracks estimated vs actual costs, persists to ~/.config/ralph-ultra/cost-history.json
 */
export class CostTracker {
  private inProgressStories: Map<string, InProgressStory> = new Map();
  private sessionRecords: StoryExecutionRecord[] = [];

  /**
   * Ensure the config directory exists
   */
  private ensureConfigDir(): void {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  /**
   * Load cost history from disk
   */
  private loadHistory(): CostHistoryDB {
    this.ensureConfigDir();

    try {
      if (existsSync(COST_HISTORY_FILE)) {
        const content = readFileSync(COST_HISTORY_FILE, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to load cost history:', error);
    }

    // Return empty history if file doesn't exist or failed to load
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      records: [],
    };
  }

  /**
   * Save cost history to disk
   */
  private saveHistory(history: CostHistoryDB): void {
    this.ensureConfigDir();

    try {
      const updated = {
        ...history,
        lastUpdated: new Date().toISOString(),
      };
      writeFileSync(COST_HISTORY_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save cost history:', error);
    }
  }

  /**
   * Start tracking a story execution
   *
   * @param storyId - Unique identifier for the story
   * @param modelId - Model being used
   * @param provider - Provider for the model
   * @param estimatedCost - Estimated cost in USD
   * @param retryCount - Number of retries (0 for first attempt)
   */
  startStory(
    storyId: string,
    modelId: string,
    provider: Provider,
    estimatedCost: number,
    retryCount: number = 0,
  ): void {
    this.inProgressStories.set(storyId, {
      storyId,
      modelId,
      provider,
      startTime: new Date().toISOString(),
      estimatedCost,
      retryCount,
    });
  }

  /**
   * End tracking for a story execution
   *
   * @param storyId - Story identifier
   * @param actualCost - Actual cost in USD
   * @param inputTokens - Input tokens used
   * @param outputTokens - Output tokens used
   * @param success - Whether the story completed successfully
   * @returns The completed execution record, or null if story wasn't started
   */
  endStory(
    storyId: string,
    actualCost: number,
    inputTokens: number,
    outputTokens: number,
    success: boolean,
  ): StoryExecutionRecord | null {
    const inProgress = this.inProgressStories.get(storyId);

    if (!inProgress) {
      console.warn(`No in-progress story found for storyId: ${storyId}`);
      return null;
    }

    const record: StoryExecutionRecord = {
      storyId: inProgress.storyId,
      modelId: inProgress.modelId,
      provider: inProgress.provider,
      startTime: inProgress.startTime,
      endTime: new Date().toISOString(),
      estimatedCost: inProgress.estimatedCost,
      actualCost,
      inputTokens,
      outputTokens,
      success,
      retryCount: inProgress.retryCount,
    };

    // Add to session records
    this.sessionRecords.push(record);

    // Persist to disk
    const history = this.loadHistory();
    history.records.push(record);
    this.saveHistory(history);

    // Remove from in-progress
    this.inProgressStories.delete(storyId);

    return record;
  }

  /**
   * Get cost summary for the current session
   *
   * @returns Summary of session costs
   */
  getSessionCosts(): {
    totalEstimated: number;
    totalActual: number;
    storiesCompleted: number;
    storiesSuccessful: number;
    records: StoryExecutionRecord[];
  } {
    const totalEstimated = this.sessionRecords.reduce(
      (sum, record) => sum + record.estimatedCost,
      0,
    );
    const totalActual = this.sessionRecords.reduce(
      (sum, record) => sum + record.actualCost,
      0,
    );
    const storiesSuccessful = this.sessionRecords.filter(r => r.success).length;

    return {
      totalEstimated,
      totalActual,
      storiesCompleted: this.sessionRecords.length,
      storiesSuccessful,
      records: [...this.sessionRecords],
    };
  }

  /**
   * Get all historical cost records
   *
   * @returns All persisted execution records
   */
  getAllHistory(): StoryExecutionRecord[] {
    const history = this.loadHistory();
    return history.records;
  }

  /**
   * Clear session records (doesn't affect persisted history)
   */
  clearSession(): void {
    this.sessionRecords = [];
    this.inProgressStories.clear();
  }
}

/**
 * Singleton instance
 */
export const costTracker = new CostTracker();
