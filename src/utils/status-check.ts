import { request as httpsRequest } from 'https';
import { loadSettings, saveSettings } from './config';

export type ApiStatus = 'operational' | 'degraded' | 'outage' | 'unknown';

export interface AnthropicStatus {
  status: ApiStatus;
  message: string;
  lastChecked: number;
  incidents?: string[];
}

interface StatusCache {
  status: AnthropicStatus;
  timestamp: number;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const STATUS_API_URL = 'https://status.claude.com/api/v2/status.json';
const INCIDENTS_API_URL = 'https://status.claude.com/api/v2/incidents.json';

/**
 * Get cached status from settings
 */
function getCachedStatus(): StatusCache | null {
  const settings = loadSettings();
  const cache = settings['anthropicStatusCache'] as StatusCache | undefined;

  if (cache && Date.now() - cache.timestamp < CACHE_DURATION) {
    return cache;
  }

  return null;
}

/**
 * Cache status in settings
 */
function setCachedStatus(status: AnthropicStatus): void {
  const settings = loadSettings();
  settings['anthropicStatusCache'] = {
    status,
    timestamp: Date.now(),
  };
  saveSettings(settings);
}

/**
 * Fetch JSON from URL using native https module
 */
function fetchJSON<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'ralph-ultra/2.0.0',
      },
      timeout: 5000,
    }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Check Anthropic API status
 * Uses caching to avoid excessive API calls
 */
export async function checkApiStatus(forceRefresh = false): Promise<AnthropicStatus> {
  // Check cache first unless forcing refresh
  if (!forceRefresh) {
    const cached = getCachedStatus();
    if (cached) {
      return cached.status;
    }
  }

  try {
    // Fetch main status
    const statusResponse = await fetchJSON<{
      status: {
        indicator: string;
        description: string;
      };
    }>(STATUS_API_URL);

    // Fetch current incidents
    const incidentsResponse = await fetchJSON<{
      incidents: Array<{
        name: string;
        status: string;
        impact: string;
      }>;
    }>(INCIDENTS_API_URL).catch(() => ({ incidents: [] }));

    // Map status indicator to our ApiStatus type
    let status: ApiStatus;
    switch (statusResponse.status.indicator) {
      case 'none':
        status = 'operational';
        break;
      case 'minor':
      case 'major':
        status = 'degraded';
        break;
      case 'critical':
        status = 'outage';
        break;
      default:
        status = 'unknown';
    }

    // Get active incidents
    const activeIncidents = incidentsResponse.incidents
      .filter(incident => incident.status !== 'resolved')
      .map(incident => `${incident.name}: ${incident.impact}`);

    const result: AnthropicStatus = {
      status,
      message: statusResponse.status.description,
      lastChecked: Date.now(),
      incidents: activeIncidents.length > 0 ? activeIncidents : undefined,
    };

    // Cache the result
    setCachedStatus(result);

    return result;
  } catch (error) {
    // Return unknown status on error
    const fallback: AnthropicStatus = {
      status: 'unknown',
      message: 'Unable to check API status',
      lastChecked: Date.now(),
    };

    // Cache even the error state to avoid hammering the API
    setCachedStatus(fallback);

    return fallback;
  }
}

/**
 * Format status for display
 */
export function formatStatusMessage(status: AnthropicStatus): {
  icon: string;
  color: string;
  message: string;
} {
  const icons: Record<ApiStatus, string> = {
    operational: '✓',
    degraded: '⚠',
    outage: '✗',
    unknown: '?',
  };

  const colors: Record<ApiStatus, string> = {
    operational: 'green',
    degraded: 'yellow',
    outage: 'red',
    unknown: 'gray',
  };

  let message = `Claude API: ${status.message}`;
  if (status.incidents && status.incidents.length > 0) {
    message += `\nActive incidents: ${status.incidents.join(', ')}`;
  }

  return {
    icon: icons[status.status],
    color: colors[status.status],
    message,
  };
}

/**
 * Check if we should warn the user about API status
 */
export function shouldWarnAboutStatus(status: AnthropicStatus): boolean {
  return status.status === 'degraded' || status.status === 'outage';
}