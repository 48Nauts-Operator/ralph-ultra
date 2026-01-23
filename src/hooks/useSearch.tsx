import { useState, useCallback, useMemo } from 'react';
import type { SearchState } from '@types';

/**
 * Hook for managing search functionality in log views
 *
 * Features:
 * - Case-insensitive search by default
 * - Track current match position
 * - Navigate between matches
 * - Highlight matching lines
 */
export const useSearch = (lines: string[]) => {
  const [searchState, setSearchState] = useState<SearchState>({
    searchQuery: '',
    searchMode: false,
    currentMatchIndex: 0,
    totalMatches: 0,
    matchingLines: [],
  });

  /**
   * Find all lines that match the search query
   */
  const findMatches = useCallback((query: string, lines: string[]): number[] => {
    if (!query) return [];

    const lowerQuery = query.toLowerCase();
    const matches: number[] = [];

    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(lowerQuery)) {
        matches.push(index);
      }
    });

    return matches;
  }, []);

  /**
   * Activate search mode with a query
   */
  const startSearch = useCallback((query: string = '') => {
    const matches = findMatches(query, lines);
    setSearchState({
      searchQuery: query,
      searchMode: true,
      currentMatchIndex: matches.length > 0 ? 0 : -1,
      totalMatches: matches.length,
      matchingLines: matches,
    });
  }, [lines, findMatches]);

  /**
   * Update search query and refresh matches
   */
  const updateSearchQuery = useCallback((query: string) => {
    const matches = findMatches(query, lines);
    setSearchState(prev => ({
      ...prev,
      searchQuery: query,
      currentMatchIndex: matches.length > 0 ? 0 : -1,
      totalMatches: matches.length,
      matchingLines: matches,
    }));
  }, [lines, findMatches]);

  /**
   * Navigate to next match
   */
  const nextMatch = useCallback(() => {
    setSearchState(prev => {
      if (prev.totalMatches === 0) return prev;
      const nextIndex = (prev.currentMatchIndex + 1) % prev.totalMatches;
      return { ...prev, currentMatchIndex: nextIndex };
    });
  }, []);

  /**
   * Navigate to previous match
   */
  const previousMatch = useCallback(() => {
    setSearchState(prev => {
      if (prev.totalMatches === 0) return prev;
      const prevIndex = prev.currentMatchIndex === 0
        ? prev.totalMatches - 1
        : prev.currentMatchIndex - 1;
      return { ...prev, currentMatchIndex: prevIndex };
    });
  }, []);

  /**
   * Exit search mode
   */
  const exitSearch = useCallback(() => {
    setSearchState({
      searchQuery: '',
      searchMode: false,
      currentMatchIndex: 0,
      totalMatches: 0,
      matchingLines: [],
    });
  }, []);

  /**
   * Check if a line should be highlighted
   */
  const isLineMatch = useCallback((lineIndex: number): boolean => {
    return searchState.matchingLines.includes(lineIndex);
  }, [searchState.matchingLines]);

  /**
   * Check if a line is the current match
   */
  const isCurrentMatch = useCallback((lineIndex: number): boolean => {
    if (searchState.currentMatchIndex === -1) return false;
    return searchState.matchingLines[searchState.currentMatchIndex] === lineIndex;
  }, [searchState.matchingLines, searchState.currentMatchIndex]);

  /**
   * Get the line index of the current match (for scrolling)
   */
  const currentMatchLineIndex = useMemo(() => {
    if (searchState.currentMatchIndex === -1 || searchState.matchingLines.length === 0) {
      return -1;
    }
    return searchState.matchingLines[searchState.currentMatchIndex];
  }, [searchState.currentMatchIndex, searchState.matchingLines]);

  return {
    searchState,
    startSearch,
    updateSearchQuery,
    nextMatch,
    previousMatch,
    exitSearch,
    isLineMatch,
    isCurrentMatch,
    currentMatchLineIndex,
  };
};

export type UseSearchReturn = ReturnType<typeof useSearch>;