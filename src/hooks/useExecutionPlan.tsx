import { useState, useCallback, useEffect } from 'react';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PRD } from '../types';
import type { ExecutionPlan } from '../core/types';
import { generateExecutionPlan } from '../core/execution-planner';
import { useQuotas } from './useQuotas';

/**
 * Hook to load PRD and generate execution plan with quota-aware model selection
 *
 * Features:
 * - Loads PRD from project directory
 * - Generates execution plan with model recommendations
 * - Integrates with quota system for model availability
 * - Provides refresh capability
 * - Tracks loading and error states
 *
 * @param projectPath - Path to the project directory containing prd.json
 *
 * @example
 * ```tsx
 * const { plan, loading, error, refresh } = useExecutionPlan('/path/to/project');
 *
 * if (loading) return <Text>Loading execution plan...</Text>;
 * if (error) return <Text color="red">{error}</Text>;
 * if (!plan) return <Text>No PRD found</Text>;
 *
 * return <ExecutionPlanDisplay plan={plan} onRefresh={refresh} />;
 * ```
 */
export function useExecutionPlan(projectPath: string) {
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get current quota data for model availability
  const { quotas } = useQuotas();

  /**
   * Load PRD from project directory
   */
  const loadPRD = useCallback((): PRD | null => {
    try {
      const prdPath = join(projectPath, 'prd.json');
      if (!existsSync(prdPath)) {
        return null;
      }
      const content = readFileSync(prdPath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load PRD';
      throw new Error(errorMessage);
    }
  }, [projectPath]);

  /**
   * Generate execution plan from PRD
   */
  const generatePlan = useCallback(() => {
    setLoading(true);
    setError(null);

    try {
      const prd = loadPRD();
      if (!prd) {
        setPlan(null);
        setError('No prd.json found in project directory');
        return;
      }

      // Generate execution plan with quota-aware model selection
      const executionPlan = generateExecutionPlan(prd, quotas, projectPath);
      setPlan(executionPlan);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate execution plan';
      setError(errorMessage);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [projectPath, quotas, loadPRD]);

  /**
   * Refresh the execution plan
   */
  const refresh = useCallback(() => {
    generatePlan();
  }, [generatePlan]);

  /**
   * Auto-generate plan when projectPath or quotas change
   */
  useEffect(() => {
    if (projectPath) {
      generatePlan();
    }
  }, [projectPath, generatePlan]);

  return {
    plan,
    loading,
    error,
    refresh,
  };
}
