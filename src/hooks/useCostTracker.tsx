import { useState, useEffect } from 'react';
import { costTracker, type StoryExecutionRecord } from '../core';

/**
 * Session cost data returned by the hook
 */
export interface SessionCostData {
  totalEstimated: number;
  totalActual: number;
  storiesCompleted: number;
  storiesSuccessful: number;
  records: StoryExecutionRecord[];
}

/**
 * Hook to subscribe to cost tracker updates and provide session cost data
 *
 * Features:
 * - Provides current session costs and historical records
 * - Auto-updates every second for real-time cost tracking
 * - Tracks whether cost tracking is active (has recorded stories)
 *
 * @example
 * ```tsx
 * const { sessionCosts, historicalCosts, isTracking } = useCostTracker();
 *
 * return (
 *   <Box>
 *     <Text>Total Cost: ${sessionCosts.totalActual.toFixed(4)}</Text>
 *     <Text>Stories: {sessionCosts.storiesCompleted}</Text>
 *   </Box>
 * );
 * ```
 */
export function useCostTracker() {
  const [sessionCosts, setSessionCosts] = useState<SessionCostData>(() =>
    costTracker.getSessionCosts()
  );
  const [historicalCosts, setHistoricalCosts] = useState<StoryExecutionRecord[]>(() =>
    costTracker.getAllHistory()
  );

  /**
   * Subscribe to cost updates via polling
   *
   * Note: CostTracker doesn't emit events yet, so we poll for updates.
   * This matches the pattern used by CostDashboard component.
   * Future enhancement: Add event emission to CostTracker for push-based updates.
   */
  useEffect(() => {
    const updateCosts = () => {
      setSessionCosts(costTracker.getSessionCosts());
      setHistoricalCosts(costTracker.getAllHistory());
    };

    // Poll for updates every second to keep costs in sync
    const interval = setInterval(updateCosts, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  /**
   * Determine if cost tracking is active
   * Active when there are recorded stories in the current session
   */
  const isTracking = sessionCosts.records.length > 0;

  return {
    sessionCosts,
    historicalCosts,
    isTracking,
  };
}
