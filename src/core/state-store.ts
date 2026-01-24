import type { RalphCoreState, ProviderQuotas, ExecutionPlan, ModelLearningDB } from './types';
import { ralphEvents } from './event-bus';

type StateListener = (state: RalphCoreState) => void;

function createInitialState(): RalphCoreState {
  return {
    connected: true,
    quotas: {} as ProviderQuotas,
    quotasLastUpdated: null,
    currentProject: null,
    executionPlan: null,
    executionStatus: 'idle',
    currentStoryIndex: 0,
    currentStoryId: null,
    currentModel: null,
    completedStories: [],
    totalCost: 0,
    totalDuration: 0,
    learnings: {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      runs: [],
      learnings: {},
      recommendations: {} as Record<string, never>,
    } as ModelLearningDB,
  };
}

class StateStore {
  private state: RalphCoreState;
  private listeners: Set<StateListener> = new Set();

  constructor() {
    this.state = createInitialState();
  }

  getState(): RalphCoreState {
    return this.state;
  }

  update(partial: Partial<RalphCoreState>): void {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
    ralphEvents.emit({ type: 'state-snapshot', data: this.state });
  }

  updateQuotas(quotas: ProviderQuotas): void {
    this.update({
      quotas,
      quotasLastUpdated: new Date().toISOString(),
    });
    ralphEvents.emit({ type: 'quota-update', data: quotas });
  }

  updateExecutionPlan(plan: ExecutionPlan): void {
    this.update({ executionPlan: plan });
    ralphEvents.emit({ type: 'plan-ready', data: plan });
  }

  updateLearnings(learnings: ModelLearningDB): void {
    this.update({ learnings });
  }

  recordStoryCompletion(
    storyId: string,
    success: boolean,
    model: string,
    cost: number,
    duration: number,
  ): void {
    const completed = [...this.state.completedStories, { storyId, success, model, cost, duration }];
    this.update({
      completedStories: completed,
      totalCost: this.state.totalCost + cost,
      totalDuration: this.state.totalDuration + duration,
      currentStoryIndex: this.state.currentStoryIndex + 1,
    });
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notifyListeners(): void {
    this.listeners.forEach(fn => fn(this.state));
  }

  reset(): void {
    this.state = createInitialState();
    this.notifyListeners();
  }
}

export const store = new StateStore();
