// The venue abstraction for Atelier Earn.
//
// Earn's ledger (parquet_earn_vault/positions/movements) is an ERC4626 share book
// that does not care WHAT the treasury's USDC is deployed into -- it only tracks
// "position units" the treasury holds and mints shares against them. An EarnVenue
// is the on-chain adapter that knows the underlying (a Parquet category pool, a
// Kamino lend reserve, ...). The flows layer orchestrates the ledger + treasury
// USDC and dispatches the on-chain leg to the venue selected by the vault key.
//
// This mirrors the AI provider registry (src/lib/providers/types.ts): one
// interface, many implementations, picked at the registry.

// A single depositable market within a venue. `key` is the vault key threaded
// through the ledger/routes (`venue:market`); a bare key with no colon is treated
// as Parquet for back-compat with the pre-venue vault rows.
export interface EarnMarket {
  venue: string;
  market: string;
  key: string;
  label: string;
  asset: 'USDC';
}

// Liquidity + status for withdraw gating and the UI. `availableUsdc` is the
// amount immediately withdrawable from the venue (not gross TVL).
export interface EarnVenueHealth {
  availableUsdc: bigint;
  isPaused: boolean;
  aprBps?: number;
}

// Result of a venue withdraw of `units`:
//  - settled: the venue redeemed to treasury USDC (`received`); the flow forwards
//    it to the depositor and records the settlement.
//  - illiquid: the venue could not redeem now (paused / insufficient free
//    liquidity / a reverted attempt); the flow earmarks `estimateUsdc` in the
//    deferred queue and the cron retries. `txHash` is the on-chain redeem leg.
export type EarnWithdrawOutcome =
  | { status: 'settled'; txHash: string; received: bigint }
  | { status: 'illiquid'; estimateUsdc: bigint };

export interface EarnVenue {
  readonly id: string;
  readonly label: string;

  // Whether this venue is configured/enabled for the deployment.
  isConfigured(): boolean;

  // The depositable markets this venue exposes.
  listMarkets(): EarnMarket[];
  isMarketEnabled(market: string): boolean;

  // Treasury's current position units in `market` (LP / cToken / shares). Used by
  // reconcile, and measured internally by deposit/withdraw -- the flow never
  // assumes a transferable ATA exists, so account-based venues fit too.
  readPositionUnits(market: string): Promise<bigint>;

  // USDC NAV of `units` in `market`.
  valueUnits(market: string, units: bigint): Promise<bigint>;

  // Liquidity / pause / APR for `market`.
  readHealth(market: string): Promise<EarnVenueHealth>;

  // Deposit micro-USDC ALREADY sitting in the treasury into `market`, returning
  // the units minted (the treasury position delta) for the share book.
  deposit(
    market: string,
    amountUsdc: bigint,
    slippageBps: number,
  ): Promise<{ txHash: string; unitsMinted: bigint }>;

  // Redeem `units` from `market` to treasury USDC, or report illiquid so the flow
  // can defer. The venue owns the liquidity decision and the slippage/minOut math.
  withdraw(
    market: string,
    units: bigint,
    slippageBps: number,
  ): Promise<EarnWithdrawOutcome>;
}
