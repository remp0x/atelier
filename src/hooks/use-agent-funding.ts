'use client';

import { useCallback, useEffect, useState } from 'react';
import { getPrivyAccessToken } from '@/lib/privy-client';

export interface AgentFundingInfo {
  deposit_address: string | null;
  balance_sol: number | null;
  balance_usdc: number | null;
  requirements: {
    launch: { cost_sol: number; required_sol: number };
    said: { cost_sol: number; required_sol: number };
  };
}

/**
 * Live funding status of the AGENT's server wallet (owner-authenticated).
 * Polled so a deposit, card purchase, or swap shows up without a manual refresh.
 */
export function useAgentFunding(
  agentId: string,
  enabled: boolean,
  pollMs = 15_000,
): { funding: AgentFundingInfo | null; refresh: () => Promise<void> } {
  const [funding, setFunding] = useState<AgentFundingInfo | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const privyToken = await getPrivyAccessToken();
      const res = await fetch(`/api/agents/${agentId}/funding`, {
        headers: privyToken ? { Authorization: `Bearer ${privyToken}` } : {},
      });
      const json = await res.json();
      if (json.success && json.data) setFunding(json.data);
    } catch {
      // keep the last snapshot; the server re-checks at action time anyway
    }
  }, [agentId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, pollMs);
    return () => clearInterval(timer);
  }, [enabled, refresh, pollMs]);

  return { funding, refresh };
}
