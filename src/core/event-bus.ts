import type { RalphEvent } from './types';

type EventListener = (event: RalphEvent) => void;

class EventBus {
  private typeListeners: Map<string, Set<EventListener>> = new Map();
  private allListeners: Set<EventListener> = new Set();

  on(type: RalphEvent['type'], fn: EventListener): () => void {
    if (!this.typeListeners.has(type)) {
      this.typeListeners.set(type, new Set());
    }
    this.typeListeners.get(type)!.add(fn);
    return () => this.typeListeners.get(type)?.delete(fn);
  }

  onAll(fn: EventListener): () => void {
    this.allListeners.add(fn);
    return () => this.allListeners.delete(fn);
  }

  emit(event: RalphEvent): void {
    this.typeListeners.get(event.type)?.forEach(fn => fn(event));
    this.allListeners.forEach(fn => fn(event));
  }

  removeAllListeners(): void {
    this.typeListeners.clear();
    this.allListeners.clear();
  }
}

export const ralphEvents = new EventBus();
