/**
 * Single source of truth for the agent token-launch provider + fee economics.
 *
 * The active provider is driven by NEXT_PUBLIC_TOKEN_LAUNCH_PROVIDER so that the
 * server launch route and the client UI/copy flip together. Default is 'pumpfun'
 * (the legacy direct rail); set to 'clawpump' at cutover once the partner key is live.
 *
 * NEXT_PUBLIC_* is inlined at build time by Next, so reading it at module scope is safe
 * on both server and client (matches the AskAtelierWidget pattern).
 *
 * NOTE: the token CREATOR-FEE split below is distinct from the marketplace ORDER fee
 * (90% agent / 10% platform), which is unrelated and never changes here.
 */

export type TokenLaunchProvider = 'pumpfun' | 'clawpump';

export const TOKEN_LAUNCH_PROVIDER: TokenLaunchProvider =
  process.env.NEXT_PUBLIC_TOKEN_LAUNCH_PROVIDER === 'clawpump' ? 'clawpump' : 'pumpfun';

export const IS_CLAWPUMP = TOKEN_LAUNCH_PROVIDER === 'clawpump';

/** Display label for the active launch provider. */
export const providerLabel: 'PumpFun' | 'ClawPump' = IS_CLAWPUMP ? 'ClawPump' : 'PumpFun';

/** Active token creator-fee split. */
export const tokenFeeSplit = IS_CLAWPUMP
  ? { agentPct: 65, clawpumpPct: 23.3, buybackPct: 11.67 }
  : { agentPct: 90, buybackPct: 10 };

/** Convenience: the agent's share of creator fees under the active provider. */
export const agentFeePct = tokenFeeSplit.agentPct;

interface FeeSlice {
  label: string;
  pct: number;
  color: string;
  desc: string;
}

/** Slices for the token-fee FeeBar on /token. */
export const tokenFeeSlices: FeeSlice[] = IS_CLAWPUMP
  ? [
      { label: 'Agent Creator', pct: 65, color: 'bg-atelier', desc: 'Creator keeps 65% of ClawPump fees' },
      { label: 'ClawPump', pct: 23.3, color: 'bg-atelier-bright', desc: 'Partner distribution & tooling' },
      { label: '$ATELIER Buyback', pct: 11.67, color: 'bg-orange', desc: 'Remitted to $ATELIER buybacks' },
    ]
  : [
      { label: 'Agent Creator', pct: 90, color: 'bg-atelier', desc: 'Creator keeps 90% of PumpFun fees' },
      { label: '$ATELIER Buyback', pct: 10, color: 'bg-orange', desc: '10% of creator fees go to buybacks' },
    ];

/** Title for the token-fee FeeBar. */
export const tokenFeeBarTitle = `Agent Token Fees (${providerLabel})`;

/**
 * Badge label for a stored token_mode. Legacy 'pumpfun' rows always render "PumpFun"
 * regardless of the active flag — they must not be relabeled.
 */
export function badgeLabelForMode(
  mode: 'pumpfun' | 'clawpump' | 'byot' | null,
): 'PumpFun' | 'ClawPump' | 'BYOT' {
  if (mode === 'clawpump') return 'ClawPump';
  if (mode === 'byot') return 'BYOT';
  return 'PumpFun';
}
