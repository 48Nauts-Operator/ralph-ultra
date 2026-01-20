import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@hooks/useTheme';

/**
 * Status of an agent node in the execution tree
 */
export type AgentStatus = 'running' | 'done' | 'error';

/**
 * Represents a single agent node in the execution tree
 */
export interface AgentNode {
  /** Unique identifier for the node */
  id: string;
  /** Agent name (e.g., "oracle", "explorer", "main") */
  name: string;
  /** Current status of the agent */
  status: AgentStatus;
  /** Duration in milliseconds (null if still running) */
  duration: number | null;
  /** Child agent nodes */
  children: AgentNode[];
  /** Whether this node is expanded in the tree view */
  expanded: boolean;
  /** Depth level in the tree (for indentation) */
  depth: number;
  /** Brief description or task being performed */
  task?: string;
}

interface TracingPaneProps {
  /** Whether this pane is currently focused */
  isFocused: boolean;
  /** Available height for the pane content */
  height: number;
  /** Available width for the pane content */
  width: number;
  /** Root agent nodes (can have multiple roots for parallel execution) */
  agentTree?: AgentNode[];
}

/**
 * TracingPane - displays real-time hierarchy of nested agent calls
 * Key differentiator showing parent -> child agent relationships
 */
export const TracingPane: React.FC<TracingPaneProps> = ({
  isFocused,
  height,
  width,
  agentTree = [],
}) => {
  const { theme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Flatten tree into renderable list (respecting expanded/collapsed state)
  const flattenTree = (nodes: AgentNode[]): AgentNode[] => {
    const result: AgentNode[] = [];
    const traverse = (nodeList: AgentNode[]) => {
      for (const node of nodeList) {
        result.push(node);
        if (node.expanded && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return result;
  };

  const flatNodes = flattenTree(agentTree);

  // Handle keyboard input
  useInput(
    (input, key) => {
      // Navigation
      if (input === 'j' || key.downArrow) {
        setSelectedIndex(prev => Math.min(prev + 1, flatNodes.length - 1));
      }
      if (input === 'k' || key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      }

      // Toggle expand/collapse
      if (key.return && flatNodes[selectedIndex]) {
        const selectedNode = flatNodes[selectedIndex];
        if (selectedNode.children.length > 0) {
          toggleNodeExpansion(agentTree, selectedNode.id);
        }
      }
    },
    { isActive: isFocused },
  );

  // Toggle expansion state of a node by ID
  const toggleNodeExpansion = (nodes: AgentNode[], targetId: string): boolean => {
    for (const node of nodes) {
      if (node.id === targetId) {
        node.expanded = !node.expanded;
        return true;
      }
      if (node.children.length > 0) {
        if (toggleNodeExpansion(node.children, targetId)) {
          return true;
        }
      }
    }
    return false;
  };

  // Auto-scroll to keep selected item visible
  const visibleHeight = height - 3; // Subtract header and borders
  if (selectedIndex < scrollOffset) {
    setScrollOffset(selectedIndex);
  } else if (selectedIndex >= scrollOffset + visibleHeight) {
    setScrollOffset(selectedIndex - visibleHeight + 1);
  }

  // Get color based on agent status
  const getStatusColor = (status: AgentStatus): string => {
    switch (status) {
      case 'running':
        return theme.warning;
      case 'done':
        return theme.success;
      case 'error':
        return theme.error;
    }
  };

  // Get status symbol
  const getStatusSymbol = (status: AgentStatus): string => {
    switch (status) {
      case 'running':
        return '⟳';
      case 'done':
        return '✓';
      case 'error':
        return '✗';
    }
  };

  // Format duration
  const formatDuration = (ms: number | null): string => {
    if (ms === null) return '...';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Render a single tree node
  const renderNode = (node: AgentNode, index: number): React.ReactNode => {
    const isSelected = index === selectedIndex;
    const indent = '  '.repeat(node.depth);
    const expandSymbol = node.children.length > 0 ? (node.expanded ? '▼' : '▶') : ' ';
    const statusSymbol = getStatusSymbol(node.status);
    const statusColor = getStatusColor(node.status);
    const duration = formatDuration(node.duration);

    return (
      <Box key={node.id} flexDirection="row">
        <Text backgroundColor={isSelected ? theme.borderFocused : undefined}>
          <Text dimColor>{indent}</Text>
          <Text color={theme.muted}>{expandSymbol} </Text>
          <Text color={statusColor}>{statusSymbol} </Text>
          <Text bold color={theme.accent}>
            {node.name}
          </Text>
          {node.task && <Text dimColor> - {node.task}</Text>}
          <Text color={theme.muted}> ({duration})</Text>
        </Text>
      </Box>
    );
  };

  const borderColor = isFocused ? theme.borderFocused : theme.border;
  const visibleNodes = flatNodes.slice(scrollOffset, scrollOffset + visibleHeight);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      width={width}
      height={height}
    >
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderColor={borderColor}>
        <Text bold color={theme.accent}>
          Agent Tracing
        </Text>
        <Text dimColor> [Enter: expand/collapse]</Text>
      </Box>

      {/* Tree content */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {visibleNodes.length > 0 ? (
          visibleNodes.map((node, idx) => renderNode(node, scrollOffset + idx))
        ) : (
          <Box flexDirection="column">
            <Text dimColor>No active agent execution.</Text>
            <Text> </Text>
            <Text dimColor>When Ralph runs, you&apos;ll see:</Text>
            <Text color={theme.success}>✓ Completed agents (green)</Text>
            <Text color={theme.warning}>⟳ Running agents (yellow)</Text>
            <Text color={theme.error}>✗ Failed agents (red)</Text>
            <Text> </Text>
            <Text dimColor>This view shows the hierarchical structure of nested agent calls.</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
