/**
 * Task Type Detector
 *
 * Analyzes user story content to automatically detect the task type
 * based on keyword matching in title, description, and acceptance criteria.
 */

import type { UserStory } from '../types';
import type { TaskType } from './types';

/**
 * Keywords mapped to task types for detection.
 * Order matters - more specific patterns should come first.
 */
export const TASK_KEYWORDS: Record<TaskType, string[]> = {
  'complex-integration': [
    'integration',
    'multi-system',
    'architecture',
    'orchestration',
    'microservice',
    'end-to-end',
    'full-stack',
    'cross-cutting',
  ],
  'mathematical': [
    'algorithm',
    'calculation',
    'formula',
    'optimization',
    'compute',
    'math',
    'statistics',
    'probability',
  ],
  'backend-api': [
    'endpoint',
    'rest',
    'graphql',
    'api',
    'route',
    'controller',
    'request',
    'response',
    'http',
  ],
  'backend-logic': [
    'service',
    'business logic',
    'validation',
    'processing',
    'workflow',
    'domain logic',
    'data processing',
  ],
  'frontend-ui': [
    'component',
    'ui',
    'style',
    'css',
    'layout',
    'design',
    'visual',
    'responsive',
    'theme',
    'button',
    'form',
    'modal',
    'dashboard',
  ],
  'frontend-logic': [
    'hook',
    'state',
    'context',
    'reducer',
    'effect',
    'react',
    'vue',
    'store',
    'state management',
  ],
  'database': [
    'schema',
    'migration',
    'query',
    'database',
    'sql',
    'table',
    'index',
    'relation',
    'model',
  ],
  'testing': [
    'test',
    'spec',
    'mock',
    'jest',
    'vitest',
    'cypress',
    'e2e',
    'unit test',
    'integration test',
    'coverage',
  ],
  'documentation': [
    'documentation',
    'readme',
    'docs',
    'guide',
    'tutorial',
    'comment',
    'jsdoc',
    'api docs',
  ],
  'refactoring': [
    'refactor',
    'cleanup',
    'reorganize',
    'restructure',
    'simplify',
    'optimize',
    'improve',
  ],
  'bugfix': [
    'fix',
    'bug',
    'issue',
    'error',
    'crash',
    'defect',
    'problem',
    'broken',
  ],
  'devops': [
    'docker',
    'ci/cd',
    'pipeline',
    'deploy',
    'deployment',
    'kubernetes',
    'container',
    'build',
  ],
  'config': [
    'configuration',
    'config',
    'setup',
    'environment',
    'settings',
    'env',
    'dotenv',
  ],
  'unknown': [], // Default fallback
};

/**
 * Detects the task type from a user story by analyzing its content.
 *
 * @param story - The user story to analyze
 * @returns The detected TaskType based on keyword matching
 */
export function detectTaskType(story: UserStory): TaskType {
  // Combine all text content for analysis
  const title = story.title.toLowerCase();
  const description = story.description.toLowerCase();

  // Handle both string[] and AcceptanceCriterion[] formats
  const acText = Array.isArray(story.acceptanceCriteria)
    ? story.acceptanceCriteria
        .map(ac => (typeof ac === 'string' ? ac : ac.text))
        .join(' ')
        .toLowerCase()
    : '';

  const combinedText = `${title} ${description} ${acText}`;

  // Score each task type based on keyword matches
  const scores: Record<TaskType, number> = {} as Record<TaskType, number>;

  for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
    if (taskType === 'unknown') continue;

    let score = 0;
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = combinedText.match(regex);
      if (matches) {
        // Weight title matches higher than description/AC matches
        if (title.includes(keyword.toLowerCase())) {
          score += 3 * matches.length;
        } else {
          score += matches.length;
        }
      }
    }

    scores[taskType as TaskType] = score;
  }

  // Find the task type with the highest score
  let maxScore = 0;
  let detectedType: TaskType = 'unknown';

  for (const [taskType, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedType = taskType as TaskType;
    }
  }

  return detectedType;
}
