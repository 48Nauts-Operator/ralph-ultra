import { execSync } from 'child_process';
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import type { PRD, UserStory, AcceptanceCriterion } from '../types';
import { isTestableAC } from '../types';

export interface ACTestResult {
  criterionId: string;
  passes: boolean;
  error?: string;
  duration: number;
}

export interface StoryTestResults {
  storyId: string;
  results: ACTestResult[];
  allPassed: boolean;
}

export function runSingleACTest(
  criterion: AcceptanceCriterion,
  projectPath: string
): ACTestResult {
  const startTime = Date.now();
  
  if (!criterion.testCommand) {
    return {
      criterionId: criterion.id,
      passes: false,
      error: 'No test command defined',
      duration: 0,
    };
  }

  try {
    execSync(criterion.testCommand, {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 30000,
    });
    
    return {
      criterionId: criterion.id,
      passes: true,
      duration: Date.now() - startTime,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      criterionId: criterion.id,
      passes: false,
      error: error.slice(0, 200),
      duration: Date.now() - startTime,
    };
  }
}

export function runAcceptanceCriteriaTests(
  story: UserStory,
  projectPath: string,
  onProgress?: (result: ACTestResult, index: number, total: number) => void
): StoryTestResults {
  const results: ACTestResult[] = [];
  
  if (!isTestableAC(story.acceptanceCriteria)) {
    return {
      storyId: story.id,
      results: [],
      allPassed: false,
    };
  }

  const criteria = story.acceptanceCriteria;
  
  for (let i = 0; i < criteria.length; i++) {
    const criterion = criteria[i];
    if (!criterion) continue;
    
    const result = runSingleACTest(criterion, projectPath);
    results.push(result);
    
    if (onProgress) {
      onProgress(result, i, criteria.length);
    }
  }

  return {
    storyId: story.id,
    results,
    allPassed: results.every(r => r.passes),
  };
}

/** Write via temp file + rename for atomic replacement (no truncation window). */
function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = join(dirname(filePath), `.prd-${process.pid}.tmp`);
  writeFileSync(tmpPath, content, 'utf-8');
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function archiveCompletedPRD(prdPath: string, prd: PRD): string | null {
  const allStoriesPassed = prd.userStories.every(s => s.passes);
  if (!allStoriesPassed) return null;

  const dir = dirname(prdPath);
  const archiveDir = join(dir, '.archive');
  
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }

  const timestamp = formatTimestamp(new Date());
  const archiveName = `${timestamp}_completed_prd.json`;
  const archivePath = join(archiveDir, archiveName);

  copyFileSync(prdPath, archivePath);
  
  return archivePath;
}

export function updatePRDWithResults(
  prdPath: string,
  storyId: string,
  results: ACTestResult[]
): { prd: PRD; archivedPath: string | null } {
  const content = readFileSync(prdPath, 'utf-8');
  const prd: PRD = JSON.parse(content);
  
  const story = prd.userStories.find(s => s.id === storyId);
  if (!story || !isTestableAC(story.acceptanceCriteria)) {
    return { prd, archivedPath: null };
  }

  const now = new Date().toISOString();
  
  for (const result of results) {
    const criterion = story.acceptanceCriteria.find(ac => ac.id === result.criterionId);
    if (criterion) {
      criterion.passes = result.passes;
      criterion.lastRun = now;
    }
  }

  story.passes = story.acceptanceCriteria.every(ac => ac.passes);

  atomicWriteFileSync(prdPath, JSON.stringify(prd, null, 2));

  const archivedPath = archiveCompletedPRD(prdPath, prd);

  return { prd, archivedPath };
}

export function markStoryPassedInPRD(
  prdPath: string,
  storyId: string,
): { projectComplete: boolean; archivedPath: string | null } {
  const content = readFileSync(prdPath, 'utf-8');
  const prd: PRD = JSON.parse(content);
  const story = prd.userStories.find(s => s.id === storyId);
  if (!story) return { projectComplete: false, archivedPath: null };

  story.passes = true;
  // Also mark all individual ACs as passed so story-level and AC-level state agree
  if (isTestableAC(story.acceptanceCriteria)) {
    for (const ac of story.acceptanceCriteria) {
      ac.passes = true;
      ac.lastRun = ac.lastRun || new Date().toISOString();
    }
  }
  atomicWriteFileSync(prdPath, JSON.stringify(prd, null, 2));

  const archivedPath = archiveCompletedPRD(prdPath, prd);
  const projectComplete = prd.userStories.every(s => s.passes);
  return { projectComplete, archivedPath };
}

export interface ExtendedTestResults extends StoryTestResults {
  archivedPath: string | null;
  projectComplete: boolean;
}

export function runStoryTestsAndSave(
  projectPath: string,
  storyId: string,
  onProgress?: (result: ACTestResult, index: number, total: number) => void
): ExtendedTestResults | null {
  const prdPath = join(projectPath, 'prd.json');
  
  try {
    const content = readFileSync(prdPath, 'utf-8');
    const prd: PRD = JSON.parse(content);
    
    const story = prd.userStories.find(s => s.id === storyId);
    if (!story) {
      return null;
    }

    const results = runAcceptanceCriteriaTests(story, projectPath, onProgress);
    const { archivedPath } = updatePRDWithResults(prdPath, storyId, results.results);
    
    const updatedContent = readFileSync(prdPath, 'utf-8');
    const updatedPrd: PRD = JSON.parse(updatedContent);
    const projectComplete = updatedPrd.userStories.every(s => s.passes);
    
    return {
      ...results,
      archivedPath,
      projectComplete,
    };
  } catch {
    return null;
  }
}
