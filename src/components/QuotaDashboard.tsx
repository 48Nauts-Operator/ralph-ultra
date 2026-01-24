import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@hooks/useTheme';
import { useQuotas } from '@hooks/useQuotas';
import type { Provider, ProviderQuota, ModelInfo } from '../core/types';

interface QuotaDashboardProps {
  /** Width available for the dashboard */
  width?: number;
}

/**
 * QuotaDashboard component displays quota information for all providers
 * Shows provider name, quota progress bar, usage details, and reset time
 */
export const QuotaDashboard: React.FC<QuotaDashboardProps> = memo(({ width = 80 }) => {
  const { theme } = useTheme();
  const { quotas, isLoading, error } = useQuotas();
  // Models are always expanded for simplicity - can add toggle later if needed
  const showModels = true;

  /**
   * Generate a Unicode progress bar
   * @param percent - Progress percentage (0-100)
   * @param barWidth - Width of the progress bar in characters
   */
  const generateProgressBar = (percent: number, barWidth: number): string => {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filled = Math.floor((clampedPercent / 100) * barWidth);
    const empty = barWidth - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  const getStatusColor = (quota: ProviderQuota): string => {
    switch (quota.status) {
      case 'available':
        return theme.success;
      case 'limited':
        return theme.warning;
      case 'exhausted':
      case 'unavailable':
      case 'error':
        return theme.error;
      case 'unknown':
      default:
        return theme.muted;
    }
  };

  const getUsagePercent = (quota: ProviderQuota): number => {
    switch (quota.quotaType) {
      case 'percentage':
        return quota.usagePercent ?? 0;
      case 'credits':
        if (quota.creditsTotal && quota.creditsTotal > 0) {
          const remaining = quota.creditsRemaining ?? 0;
          return (remaining / quota.creditsTotal) * 100;
        }
        return 0;
      case 'rate-limit':
        if (quota.tokensLimit && quota.tokensLimit > 0 && quota.tokensRemaining !== undefined) {
          return (quota.tokensRemaining / quota.tokensLimit) * 100;
        }
        if (quota.requestsLimit && quota.requestsLimit > 0) {
          return ((quota.requestsRemaining ?? 0) / quota.requestsLimit) * 100;
        }
        return 0;
      case 'local':
        return quota.status === 'available' ? 100 : 0;
      case 'subscription':
        return 100 - (quota.usagePercent ?? 0);
      case 'unlimited':
        return 100;
      default:
        return 0;
    }
  };

  const getQuotaDetails = (quota: ProviderQuota): string => {
    switch (quota.quotaType) {
      case 'percentage':
        return `${Math.round(quota.usagePercent ?? 0)}% used`;
      case 'credits':
        return `${quota.creditsRemaining?.toFixed(2) ?? 0}/${quota.creditsTotal ?? 0} credits`;
      case 'rate-limit':
        if (quota.tokensLimit && quota.tokensRemaining !== undefined) {
          const remainingK = quota.tokensRemaining / 1000;
          const limitK = quota.tokensLimit / 1000;
          return `${remainingK.toFixed(0)}K/${limitK.toFixed(0)}K tokens remaining`;
        }
        if (quota.requestsLimit) {
          return `${quota.requestsRemaining ?? 0}/${quota.requestsLimit} requests`;
        }
        return 'rate-limited';
      case 'subscription':
        if (quota.tokensLimit && quota.tokensRemaining !== undefined) {
          const remainingK = Math.round(quota.tokensRemaining / 1000);
          const limitK = Math.round(quota.tokensLimit / 1000);
          const pct = Math.round(quota.usagePercent ?? 0);
          return `Max Plan: ${pct}% used (${remainingK}K/${limitK}K daily)`;
        }
        return 'Max Plan (usage-based)';
      case 'local':
        return quota.status === 'available'
          ? `${quota.models.length} models loaded`
          : 'Not running';
      case 'unlimited':
        return 'Max Plan (unlimited)';
      default:
        return 'unknown';
    }
  };

  /**
   * Format reset time
   */
  const formatResetTime = (resetTime?: string): string => {
    if (!resetTime) return '';

    // If it's an ISO timestamp
    if (resetTime.includes('T') || resetTime.includes('Z')) {
      try {
        const resetDate = new Date(resetTime);
        const now = new Date();
        const diffMs = resetDate.getTime() - now.getTime();

        if (diffMs < 0) return 'expired';

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) return `resets in ${hours}h ${minutes}m`;
        return `resets in ${minutes}m`;
      } catch {
        return resetTime;
      }
    }

    // Otherwise assume it's a duration string
    return `resets in ${resetTime}`;
  };

  /**
   * Get cost information for models under this provider
   */
  const getCostSummary = (quota: ProviderQuota): string => {
    if (quota.models.length === 0) return '';

    const costs = quota.models.filter(m => m.available).map(m => m.inputCostPer1M);

    if (costs.length === 0) return '';

    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);

    if (minCost === maxCost) {
      return `$${minCost.toFixed(2)}/1M`;
    }

    return `$${minCost.toFixed(2)}-$${maxCost.toFixed(2)}/1M`;
  };

  const renderModel = (model: ModelInfo, isLast: boolean, isLocal: boolean): React.ReactNode => {
    const prefix = isLast ? '└─ ' : '├─ ';

    if (isLocal) {
      return (
        <Box key={model.id} marginLeft={2}>
          <Text color={theme.muted}>{prefix}</Text>
          <Text color={theme.foreground}>{model.name}</Text>
          <Text color={theme.success}> (loaded)</Text>
        </Box>
      );
    }

    const inputCost = `$${model.inputCostPer1M.toFixed(2)}`;
    const outputCost = `$${model.outputCostPer1M.toFixed(2)}`;

    return (
      <Box key={model.id} marginLeft={2}>
        <Text color={theme.muted}>{prefix}</Text>
        <Text color={model.available ? theme.foreground : theme.muted}>{model.name}</Text>
        <Text color={theme.muted}>
          {' '}
          • in: {inputCost}/1M • out: {outputCost}/1M
        </Text>
        {!model.available && <Text color={theme.warning}> (unavailable)</Text>}
      </Box>
    );
  };

  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.muted}>Loading quota information...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.error}>Error loading quotas: {error}</Text>
      </Box>
    );
  }

  const providers: Provider[] = ['anthropic', 'openai', 'openrouter', 'gemini', 'local'];
  const barWidth = 20;

  return (
    <Box flexDirection="column" width={width} padding={1}>
      <Box marginBottom={1}>
        <Text bold color={theme.accent}>
          Provider Quotas
        </Text>
      </Box>

      {providers.map(provider => {
        const quota = quotas[provider];
        if (!quota) return null;

        const usagePercent = getUsagePercent(quota);
        const statusColor = getStatusColor(quota);
        const progressBar = generateProgressBar(usagePercent, barWidth);
        const details = getQuotaDetails(quota);
        const resetInfo = formatResetTime(quota.resetTime);
        const costInfo = getCostSummary(quota);
        const hasModels = quota.models.length > 0;

        return (
          <Box key={provider} flexDirection="column" marginBottom={1}>
            {/* Provider name line */}
            <Box>
              <Box width={12}>
                <Text bold color={theme.accent}>
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                </Text>
              </Box>
              <Box marginLeft={1}>
                <Text color={statusColor}>{quota.status}</Text>
              </Box>
            </Box>

            {/* Progress bar and details line */}
            <Box>
              <Box width={barWidth}>
                <Text color={statusColor}>{progressBar}</Text>
              </Box>
              <Box marginLeft={1}>
                <Text color={theme.foreground}>{details}</Text>
              </Box>
              {resetInfo && (
                <Box marginLeft={2}>
                  <Text color={theme.muted}>({resetInfo})</Text>
                </Box>
              )}
            </Box>

            {/* Cost information line */}
            {costInfo && (
              <Box marginLeft={barWidth + 1}>
                <Text color={theme.muted}>Cost: {costInfo}</Text>
              </Box>
            )}

            {/* Error message if present */}
            {quota.error && (
              <Box marginLeft={barWidth + 1}>
                <Text color={theme.error}>⚠ {quota.error}</Text>
              </Box>
            )}

            {/* Model list with tree-style display */}
            {showModels && hasModels && (
              <Box flexDirection="column" marginTop={1}>
                {quota.models.map((model, idx) =>
                  renderModel(model, idx === quota.models.length - 1, provider === 'local'),
                )}
              </Box>
            )}
          </Box>
        );
      })}

      {/* Last updated timestamp */}
      <Box marginTop={1}>
        <Text color={theme.muted} dimColor>
          Last updated: {new Date().toLocaleTimeString()}
        </Text>
      </Box>
    </Box>
  );
});
