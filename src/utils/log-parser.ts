/**
 * Log parser for extracting agent execution hierarchy from Ralph logs
 */

import type { AgentNode } from '@components/TracingPane';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  agentName?: string;
  agentId?: string;
  action?: 'start' | 'complete' | 'error';
  duration?: number;
}

/**
 * Parse a single log line to extract structured information
 */
const parseLogLine = (line: string): LogEntry | null => {
  if (!line.trim()) return null;

  // Pattern: [TIMESTAMP] LEVEL: AGENT_NAME (AGENT_ID) - ACTION - MESSAGE
  const patterns = [
    // Match: "Agent 'oracle' started" or "Calling sub-agent: oracle"
    /Agent ['"]?(\w+)['"]? (started|called|invoked)/i,
    // Match: "Agent 'oracle' completed in 1234ms"
    /Agent ['"]?(\w+)['"]? (completed|finished) in (\d+)ms/i,
    // Match: "Agent 'oracle' failed: error message"
    /Agent ['"]?(\w+)['"]? (failed|error)/i,
    // Match: "→ oracle" (simplified notation)
    /^[→›▸]\s*(\w+)/,
    // Match: "← oracle (1234ms)" (completion notation)
    /^[←‹◂]\s*(\w+)\s*\((\d+)ms\)/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: line,
      };

      entry.agentName = match[1];
      entry.agentId = `${match[1]}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (match[2] === 'started' || match[2] === 'called' || match[2] === 'invoked') {
        entry.action = 'start';
      } else if (match[2] === 'completed' || match[2] === 'finished') {
        entry.action = 'complete';
        entry.duration = parseInt(match[3] || '0', 10);
      } else if (match[2] === 'failed' || match[2] === 'error') {
        entry.action = 'error';
      } else if (line.startsWith('→')) {
        entry.action = 'start';
      } else if (line.startsWith('←')) {
        entry.action = 'complete';
        entry.duration = parseInt(match[2] || '0', 10);
      }

      return entry;
    }
  }

  return null;
};

/**
 * Build agent tree from log entries
 */
const buildAgentTree = (entries: LogEntry[]): AgentNode[] => {
  const nodeMap = new Map<string, AgentNode>();
  const roots: AgentNode[] = [];
  const stack: AgentNode[] = []; // Track nesting depth

  for (const entry of entries) {
    if (!entry.agentId || !entry.agentName) continue;

    if (entry.action === 'start') {
      // Create new node
      const node: AgentNode = {
        id: entry.agentId,
        name: entry.agentName,
        status: 'running',
        duration: null,
        children: [],
        expanded: true, // Auto-expand running branches
        depth: stack.length,
        task: extractTask(entry.message),
      };

      nodeMap.set(entry.agentId, node);

      // If we have a parent on the stack, add as child
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (parent) {
          parent.children.push(node);
        }
      } else {
        // Top-level node
        roots.push(node);
      }

      // Push onto stack for potential children
      stack.push(node);
    } else if (entry.action === 'complete' || entry.action === 'error') {
      // Pop from stack and update status
      if (stack.length > 0) {
        const currentNode = stack.pop();
        if (currentNode) {
          currentNode.status = entry.action === 'error' ? 'error' : 'done';
          currentNode.duration = entry.duration || null;
        }
      }
    }
  }

  return roots;
};

/**
 * Extract task description from log message
 */
const extractTask = (message: string): string | undefined => {
  // Look for patterns like "- task description" or ": task description"
  const match = message.match(/[-:]\s*(.+)/);
  if (match && match[1]) {
    return match[1].substring(0, 50); // Truncate long descriptions
  }
  return undefined;
};

/**
 * Parse log lines to build agent execution tree
 */
export const parseAgentTree = (logLines: string[]): AgentNode[] => {
  const entries: LogEntry[] = [];

  for (const line of logLines) {
    const entry = parseLogLine(line);
    if (entry) {
      entries.push(entry);
    }
  }

  return buildAgentTree(entries);
};

/**
 * Create mock agent tree for development/testing
 */
export const createMockAgentTree = (): AgentNode[] => {
  return [
    {
      id: 'main-1',
      name: 'main',
      status: 'running',
      duration: null,
      expanded: true,
      depth: 0,
      task: 'Implementing US-015',
      children: [
        {
          id: 'explorer-1',
          name: 'explorer',
          status: 'done',
          duration: 2340,
          expanded: true,
          depth: 1,
          task: 'Finding existing WorkPane patterns',
          children: [],
        },
        {
          id: 'oracle-1',
          name: 'oracle',
          status: 'running',
          duration: null,
          expanded: true,
          depth: 1,
          task: 'Designing tree component architecture',
          children: [
            {
              id: 'librarian-1',
              name: 'librarian',
              status: 'done',
              duration: 1200,
              expanded: false,
              depth: 2,
              task: 'Researching Ink tree components',
              children: [],
            },
          ],
        },
      ],
    },
  ];
};
