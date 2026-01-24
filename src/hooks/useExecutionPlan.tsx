import { useState, useCallback, useEffect } from 'react';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PRD } from '../types';
import type { ExecutionPlan, ExecutionMode } from '../core/types';
import { generateExecutionPlan } from '../core/execution-planner';
import { learningRecorder } from '../core/learning-recorder';
import { useQuotas } from './useQuotas';
import { loadSettings, saveSettings } from '../utils/config';

/**
 * Hook to load PRD and generate execution plan with quota-aware model selection
 *
 * Features:
 * - Loads PRD from project directory
 * - Generates execution plan with model recommendations
 * - Integrates with quota system for model availability
 * - Provides refresh capability
 * - Supports execution mode selection
 * - Tracks loading and error states
 *
 * @param projectPath - Path to the project directory containing prd.json
 *
 * @example
 * ```tsx
 * const { plan, loading, error, refresh, currentMode, setMode } = useExecutionPlan('/path/to/project');
 *
 * if (loading) return <Text>Loading execution plan...</Text>;
 * if (error) return <Text color="red">{error}</Text>;
 * if (!plan) return <Text>No PRD found</Text>;
 *
 * return <ExecutionPlanDisplay plan={plan} onRefresh={refresh} mode={currentMode} onModeChange={setMode} />;
 * ```
 */
export function useExecutionPlan(projectPath: string) {
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<ExecutionMode>('balanced');

  // Get current quota data for model availability
  const { quotas } = useQuotas();

  /**
   * Load persisted execution mode from settings on mount
   */
  useEffect(() => {
    const settings = loadSettings();
    if (settings.executionMode) {
      setCurrentMode(settings.executionMode as ExecutionMode);
    }
  }, []);

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

      // Generate execution plan with quota-aware model selection and learning data
      const learningData = learningRecorder.getAllLearnings();
      const executionPlan = generateExecutionPlan(prd, quotas, projectPath, learningData, currentMode);
      setPlan(executionPlan);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate execution plan';
      setError(errorMessage);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [projectPath, quotas, loadPRD, currentMode]);

  /**
   * Refresh the execution plan
   */
  const refresh = useCallback(() => {
    generatePlan();
  }, [generatePlan]);

  /**
   * Set execution mode, persist to settings, and regenerate plan
   */
  const setMode = useCallback((mode: ExecutionMode) => {
    setCurrentMode(mode);
    // Persist the mode to settings
    const settings = loadSettings();
    settings.executionMode = mode;
    saveSettings(settings);
  }, []);

  /**
   * Auto-generate plan when projectPath, quotas, or mode changes
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
    currentMode,
    setMode,
  };
}
