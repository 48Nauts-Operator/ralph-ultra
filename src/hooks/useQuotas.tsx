import { useState, useEffect, useCallback } from 'react';
import type { ProviderQuotas } from '../core/types';
import { store } from '../core/state-store';
import { refreshAllQuotas } from '../core/quota-manager';

/**
 * Hook to subscribe to quota updates from the core state store
 *
 * Features:
 * - Subscribes to quota updates from state store
 * - Provides refresh function to manually update quotas
 * - Tracks loading and error states
 * - Auto-refreshes on mount if quotas are stale
 *
 * @example
 * ```tsx
 * const { quotas, isLoading, error, refresh } = useQuotas();
 *
 * if (isLoading) return <Text>Loading quotas...</Text>;
 * if (error) return <Text color="red">{error}</Text>;
 *
 * return <QuotaDisplay quotas={quotas} onRefresh={refresh} />;
 * ```
 */
export function useQuotas() {
  const [quotas, setQuotas] = useState<ProviderQuotas>(() => store.getState().quotas);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Refresh all provider quotas
   */
  const refresh = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const updatedQuotas = await refreshAllQuotas(force);
      setQuotas(updatedQuotas);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh quotas';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Subscribe to state store updates
   */
  useEffect(() => {
    const unsubscribe = store.subscribe(state => {
      setQuotas(state.quotas);
    });

    // Auto-refresh on mount if quotas are empty or stale (older than 5 minutes)
    const quotasLastUpdated = store.getState().quotasLastUpdated;
    const isStale =
      !quotasLastUpdated ||
      Date.now() - new Date(quotasLastUpdated).getTime() > 5 * 60 * 1000;

    if (isStale) {
      refresh();
    }

    return unsubscribe;
  }, [refresh]);

  return {
    quotas,
    isLoading,
    error,
    refresh,
  };
}
