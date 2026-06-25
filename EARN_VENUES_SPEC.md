# Atelier Earn -- Multi-Venue Router Spec

Status: Phase 1a + 1b implemented (compile-verified; Solend needs a mainnet smoke-test)
Owner: Atelier
Last updated: 2026-06-25
Supersedes the single-venue assumption in PARQUET_EARN_SPEC.md (Parquet stays as
venue #1; this doc is the abstraction that lets other venues sit beside it).

> IMPLEMENTATION NOTE: the lending venue shipped is **Solend (Save Finance) USDC**,
> NOT Kamino. Kamino's klend-sdk is `@solana/kit` (web3.js 2.x) only and is
> incompatible with this web3.js-1.98 repo. Solend's SDK is web3.js 1.x but drags
> 385 conflicting transitive packages (44 high vulns) and a broken `rpc-websockets`
> resolution, so the adapter is **hand-rolled** on the repo's web3.js 1.x (no SDK
> runtime dep): deposit/redeem/refresh instructions + a minimal reserve decode,
> both taken verbatim from `@solendprotocol/solend-sdk@0.14.27` source as a
> verified spec (RESERVE_SIZE=619). Section 7 below still describes the Kamino
> evaluation for the record. Venue enable is direct in code (no env switch);
> deposits stay behind the global `EARN_DEPOSITS_OPEN` gate.

Turn Earn from "a Parquet vault" into a router over many investable venues.
Layer 1 ships USDC lending (Kamino) beside the existing Parquet LP pools, reusing
the entire ledger. Layer 2 (later) adds directional asset exposure (LSTs, spot,
baskets) as more venues behind the same interface.

---

## 1. Thesis

Agents and users hold idle USDC. Today the only place to put it is one Parquet
category pool. That is a single venue, a single risk profile, and a single APR.
Opening Earn to more venues lets capital chase the best risk-adjusted yield
(lending, fee-LP) and, in Layer 2, take real positions (SOL, BTC, LSTs).

The unlock is that almost none of Earn is Parquet-specific. The ledger is a
generic ERC4626 share book; only one file (`src/lib/parquet-earn.ts`) knows what
the underlying venue is. Add an interface between the flows and that file and any
number of venues plug in -- exactly the shape of the existing AI provider
registry (`src/lib/providers/types.ts` + `registry.ts`).

---

## 2. Scope

### In scope -- Layer 1 (this spec, build now)
- `EarnVenue` interface + venue registry.
- Refactor `parquet-earn.ts` into `venues/parquet.ts` (no behaviour change).
- Generalize the vault key from a bare market to `venue:market`.
- Routes + cron dispatch by venue.
- Venue #1 (new): **Kamino USDC lending**. USDC in, USDC + supply yield out.

### In scope -- Layer 2 (this spec, build later, same interface)
- Directional venues: LSTs (JitoSOL/mSOL), spot (SOL/BTC/ETH), baskets.
- Adds two dependencies that live ONLY inside those adapters: a swap util
  (Jupiter) and a price oracle (Pyth). The interface does not change.

### Non-goals
- No change to share math, the replay guard, auto-refund, or the admin deposit
  gate. Those are venue-agnostic and stay exactly as they are.
- No cross-venue share fungibility. Each `venue:market` is its own vault with its
  own share price.
- No new treasury. All venues share the one Earn treasury wallet.

---

## 3. Architecture -- the seam

### What is already generic (do not touch the logic)
- `parquet-earn-db.ts` -- `parquet_earn_vault` / `parquet_earn_positions` /
  `parquet_earn_movements`. Shares are ERC4626. The vault tracks `totalLpTokens`
  (treasury position units), `totalShares`, `totalPrincipalUsdc`. `lpDelta` on
  movements is just "units in/out". None of this names Parquet.
- `parquet-earn-flows.ts` -- deposit / withdraw / settle / reconcile. It already
  orchestrates generically; it only imports the Parquet adapter directly. Swap
  that import for `getVenue(venue)` and the file is venue-agnostic.

### The interface (new: `src/lib/earn/venue-types.ts`)

```ts
export interface EarnMarket {
  venue: string;        // 'parquet' | 'kamino'
  market: string;       // 'equity-us' | 'usdc'
  key: string;          // 'parquet:equity-us'  (the vault key)
  label: string;        // human label for UI
  asset: 'USDC';        // deposit asset; Layer 1 is always USDC
}

export interface EarnVenueHealth {
  availableUsdc: bigint;   // immediately withdrawable from the venue
  isPaused: boolean;
  aprBps?: number;         // for the UI; optional
}

export type EarnWithdrawOutcome =
  | { status: 'settled'; txHash: string; received: bigint }
  | { status: 'illiquid'; estimateUsdc: bigint };   // flows earmark estimateUsdc
                                                    // in the cron queue

export interface EarnVenue {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  listMarkets(): EarnMarket[];
  isMarketEnabled(market: string): boolean;

  // Treasury's current position units in this market (cToken / LP / shares).
  // Used by reconcile and by deposit/withdraw to measure deltas internally --
  // the flow never assumes a transferable ATA exists (account-based venues).
  readPositionUnits(market: string): Promise<bigint>;

  // USDC NAV of `units` in this market.
  valueUnits(market: string, units: bigint): Promise<bigint>;

  // Liquidity + pause + APR, for withdraw gating and the UI.
  readHealth(market: string): Promise<EarnVenueHealth>;

  // Deposit micro-USDC ALREADY in the treasury; returns the units minted
  // (adapter measures the delta -- this is what moves into the share book).
  deposit(market: string, amountUsdc: bigint, slippageBps: number):
    Promise<{ txHash: string; unitsMinted: bigint }>;

  // Redeem `units` to treasury USDC. Settles when liquid, else reports illiquid
  // and the flow earmarks it for the existing cron queue.
  withdraw(market: string, units: bigint, slippageBps: number):
    Promise<EarnWithdrawOutcome>;
}
```

Design note: `deposit`/`withdraw` return the measured unit/USDC delta themselves
(not the flow reading an ATA before/after). This is deliberate -- Kamino and
MarginFi are obligation/account based with no freely-held LP token. Putting the
measurement inside the adapter makes the abstraction correct on the very first
non-Parquet venue, and keeps minOut/slippage math where venue pricing lives.

### The registry (new: `src/lib/earn/registry.ts`)

```ts
const VENUES: Record<string, EarnVenue> = {
  parquet: parquetVenue,
  kamino: kaminoVenue,
};

export function getVenue(id: string): EarnVenue;            // throws on unknown
export function getEnabledVenueMarkets(): EarnMarket[];     // from EARN_VENUES
export function getDefaultVenueMarket(): EarnMarket;
export function parseVenueKey(key: string):                 // 'kamino:usdc'
  { venue: string; market: string };
```

`EARN_VENUES` is one composite list: `parquet:equity-us,parquet:crypto-usd,kamino:usdc`.
Back-compat: when `EARN_VENUES` is unset, derive `parquet:*` from the existing
`PARQUET_EARN_CATEGORY` / `PARQUET_EARN_CATEGORIES` vars so nothing breaks.

---

## 4. Vault key generalization + migration

> Phase 1a shipped WITHOUT this migration. Bare keys (`equity-us`) are treated as
> the Parquet venue implicitly (`parseVenueKey` defaults a colon-less key to
> parquet), so existing vault rows, routes, and the frontend are untouched and
> Parquet stays byte-identical. New venues use explicit `venue:market` keys
> (`kamino:usdc`). The cosmetic migration below is OPTIONAL and can run later if
> we want uniform `parquet:*` keys.

Today `parquet_earn_vault.pool_market` is a bare string (`equity-us`) with a
UNIQUE constraint. Generalize it to the composite key (`parquet:equity-us`).

- `getOrCreateVault(key, treasury)` is called with the full `venue:market` key.
- Positions reference `vault_id`, NOT the market string, so existing positions
  are untouched by the rename.

One-time migration in `initParquetEarnDb()` (idempotent):

```sql
UPDATE parquet_earn_vault
SET pool_market = 'parquet:' || pool_market
WHERE pool_market NOT LIKE '%:%';
```

No column rename. `total_lp_tokens` / `lp_delta` stay -- documented as generic
"position units" rather than literally Parquet LP.

---

## 5. File-by-file change map

| Today | Change |
|-------|--------|
| `src/lib/parquet-earn.ts` | Move to `src/lib/earn/venues/parquet.ts`, implement `EarnVenue`. Wrap existing functions (`buildTreasuryDeposit/Withdraw`, `readPoolHealth`, `availableLiquidity`, `valueLpInUsdc`, category enable/default). Zero behaviour change. |
| (new) | `src/lib/earn/venue-types.ts`, `src/lib/earn/registry.ts`, `src/lib/earn/venues/kamino.ts` |
| `src/lib/parquet-earn-flows.ts` | Rename to `src/lib/earn/flows.ts`. Replace direct `parquet-earn` imports with `getVenue(venue)`. Keep all treasury USDC handling (`verifyIncomingUsdc`, `sendTreasuryUsdc`), the replay guard, and the queue/settle logic -- they are venue-agnostic. |
| `src/lib/parquet-earn-db.ts` | Add the migration. Optionally re-export under `src/lib/earn/ledger.ts`. No schema change beyond the data migration. |
| `src/app/api/earn/parquet/*` | Accept `venue` in the body (default `'parquet'`); validate via `getVenue(venue).isMarketEnabled(market)`. Keep the paths as back-compat aliases. |
| `src/app/api/cron/parquet-earn/route.ts` | Iterate `getEnabledVenueMarkets()` instead of `getEnabledCategories()`. KEEP the path (Vercel cron schedule references it). |
| `src/lib/earn-access.ts` | Unchanged. The deposit gate and admin check are global, not per-venue. |
| `src/components/atelier/earn/*` | Venue badge + per-venue APR in MarketGrid; venue-aware PoolPanel/DepositPanel. (Delegate to atelier-frontend.) |

---

## 6. API surface

Recommended: keep the existing routes, add a `venue` field (default `parquet`).

- `POST /api/earn/parquet/deposit` -- body gains `venue`. Still admin-gated by
  `isEarnDepositsOpen()`. `market` validated against the chosen venue.
- `POST /api/earn/parquet/withdraw` -- body gains `venue`. Ungated (caller burns
  only their own shares).
- `GET /api/earn/parquet/markets` -- returns ALL enabled `EarnMarket`s across
  venues (was Parquet categories only).
- `GET /api/earn/parquet/pools` -- per `venue:market` health/APR via
  `venue.readHealth`.
- `GET /api/earn/parquet/positions` -- already aggregates a user's own + their
  agents' positions; now spans venues because positions are keyed by vault.

Optional later: mirror these under `/api/earn/[venue]/*` and make `/parquet/*`
thin re-exports. Not required for Layer 1.

---

## 7. Venue #1 -- Kamino USDC lending (`venues/kamino.ts`)

Goal: supply USDC to a Kamino lend reserve, earn variable supply APY, redeem to
USDC. Same risk shape as today (USDC-denominated), different counterparty.

SDK: `@kamino-finance/klend-sdk`. Use the **reserve-liquidity collateral**
primitive so the treasury holds a transferable cToken (mirrors the Parquet
LP-balance model and the share book exactly):

- `deposit(market, amountUsdc, slippageBps)` -- deposit reserve liquidity, mint
  collateral cTokens to the treasury. `unitsMinted` = treasury cToken balance
  delta. Sign with the Earn treasury keypair via `sendAndConfirmServerTx`.
- `withdraw(market, units, slippageBps)` -- redeem cTokens for USDC liquidity.
  `received` = treasury USDC balance delta. If the reserve lacks free liquidity
  (high utilization), return `{ status:'illiquid' }`.
- `readPositionUnits` -- treasury cToken balance for the reserve.
- `valueUnits(units)` -- `units * collateralExchangeRate(reserve)`. cToken value
  rises with accrued interest -> shares appreciate. No oracle needed.
- `readHealth` -- `availableUsdc` = reserve available liquidity (cash);
  `aprBps` = reserve supply APR; `isPaused` = reserve frozen/stale.

Open item: confirm exact `klend-sdk` calls for cToken mint/redeem vs. the
obligation flow. Reserve-liquidity (cToken) is preferred; obligation deposit is
the fallback (then `readPositionUnits` reads the obligation, which the interface
already allows since the flow does not assume an ATA).

Config: `KAMINO_MARKET_ADDRESS`, `KAMINO_USDC_RESERVE` (or derive from market +
USDC mint). Reuses the existing RPC and Earn treasury.

---

## 8. Venue semantics matrix

| Concern | Parquet (today) | Kamino (Layer 1) | Spot/LST (Layer 2) |
|---------|-----------------|------------------|--------------------|
| Deposit asset | USDC | USDC | USDC (swapped) |
| Position units | category LP token | reserve cToken | asset token balance |
| Valuation | pool equity / LP supply | cToken exchange rate | oracle price x balance |
| Yield source | perp trader fees | borrow interest | staking yield / price |
| Principal risk | pool drawdown | bad debt (rare) | market price |
| Withdraw | often deferred (queue) | usually instant | swap back (instant) |
| Extra deps | none | none | swap (Jupiter) + oracle (Pyth) |

The settle/queue + cron machinery covers all three: any venue that returns
`illiquid` gets earmarked and retried, exactly as Parquet's deferred path does
today.

---

## 9. Layer 2 seam -- directional venues (later)

A directional venue (`venues/spot.ts`, `venues/lst.ts`) is just another
`EarnVenue` where:

- `deposit` = swap treasury USDC -> target asset (Jupiter), hold the asset.
  `unitsMinted` = asset token delta.
- `valueUnits` = `units * pythPrice(asset)` -> micro-USDC.
- `withdraw` = swap asset -> USDC, return `received`.
- `readHealth` = swap-route liquidity + a paused flag.

This is why "both, layered" works cleanly: the interface is the contract, and
Layer 2 adds only adapters plus two adapter-local dependencies. The ledger,
routes, cron, share math, and refund logic do not change. Directional venues
carry price risk -- surface that explicitly in the UI and keep them
opt-in/clearly-labelled vs the USDC-yield venues.

---

## 10. Invariants to preserve (regression gate)

1. ERC4626 share price per vault is monotonic in venue value: `unitsMinted`
   feeds `computeSharesForDeposit`; `computeLpForShares` redeems them. Units must
   be a stable measure whose USDC value only rises with yield (cToken exchange
   rate, LP equity). Holds for Parquet and Kamino.
2. Replay guard (`parquet_earn_consumed_deposits`) unchanged -- one incoming
   transfer backs at most one deposit.
3. Auto-refund on failed deploy unchanged (push model: funds already in
   treasury).
4. Deposits admin-gated by `EARN_DEPOSITS_OPEN` until battle-tested; withdrawals
   never gated.
5. Per-venue reconcile: `venue.readPositionUnits` vs `vault.totalLpTokens`; drift
   only alerts, never auto-corrects.
6. Existing Parquet positions value identically before/after the refactor
   (drift = 0).

---

## 11. Build order (with verification gates)

- **1a. Abstraction + Parquet move.** Interface, registry, `venues/parquet.ts`,
  flows refactor, vault-key migration, routes accept `venue`.
  GATE: `lsp_diagnostics` clean; reconcile drift = 0 on existing vaults; a
  Parquet deposit + withdraw behaves exactly as before.
- **1b. Kamino adapter.** `venues/kamino.ts`, `EARN_VENUES` includes
  `kamino:usdc`.
  GATE: small mainnet deposit -> cTokens recorded as units; `valueUnits` rises
  over time; withdraw settles to treasury then to destination; admin-only.
- **1c. UI.** Venue badge + per-venue APR in MarketGrid; venue-aware deposit/
  withdraw. (atelier-frontend.)
  GATE: visual + a real deposit/withdraw through the UI on each venue.
- **2. Directional venues (separate work).** `venues/spot.ts` / `venues/lst.ts`
  with Jupiter + Pyth. New spec section / PR.

---

## 12. Open decisions

1. Route shape: `venue` in body + alias paths (recommended, low churn) vs new
   `/api/earn/[venue]/*`.
2. Kamino integration path: reserve-liquidity cToken (recommended) vs obligation
   deposit.
3. APR source per venue for the UI (on-chain reserve APR vs an indexer).
4. Whether to expose Kamino to the public the moment it lands or keep it
   admin-only for a bake-in period (recommend: admin-only first, same as
   Parquet's rollout).
