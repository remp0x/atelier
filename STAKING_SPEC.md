# Atelier Staking -- Spec

On-chain, revenue-share staking for $ATELIER. Stake $ATELIER into a lock tier,
earn a pro-rata share of platform revenue paid in SOL. Non-custodial: the
program holds funds, not Atelier.

## Decisions (how we got here)

| Decision | Choice | Why |
|---|---|---|
| Reward type | Real yield (SOL from platform fees) | Non-inflationary; $ATELIER mint authority is revoked so emissions are impossible anyway. Ties staking to the flywheel. RESOLVED in v2: creator fees arrive in SOL, so paying rewards in SOL removes the SOL->USDC conversion, the price oracle, and any swap from the funding pipeline entirely (v1 paid USDC). |
| Custody | On-chain Solana program (non-custodial) | User-chosen. Trustless; program-owned vaults; no "trust Atelier" with staked funds. |
| Base | Clean-room Anchor program | The only audited program with the right shape (`mithraiclabs/spl-token-staking`) is BUSL-1.1 (deploy-blocked to 2027); nothing audited supports Token-2022. So we build fresh, using its architecture as reference. |
| Lock model | 4 discrete tiers (Parquet-style), continuous accrual | Discrete tiers = a lookup table, not an interpolation curve. Continuous accrual + claim-anytime = simpler than epochs and matches the accumulator. |
| Multipliers | 15d 1x / 30d 4x / 60d 10x / 180d 20x | User-chosen (v2 ladder; v1 was doubling 1x/2x/4x/8x). Rewards commitment without nuking casual stakers; bounded enough to keep expiry handling simple. |
| Chain | Solana only | Token stays on Solana (Base migration shelved). Rewards paid in native SOL on Solana. |

## Architecture

```
on-chain (solana/programs/atelier-staking)   <- source of truth
  StakePool (per mint + pool_id u8): accumulator, totals, tier config, vault authority
  StakePosition (per owner+tier): amount, weight, reward_debt, pending, lock_until
  vaults: staked_vault (ATELIER), reward_vault (wSOL), both owned by pool PDA

backend (src/lib/staking-rewards.ts, /api/cron/staking-rewards)
  weekly: tally revenue share (lamports) -> native-transfer SOL to the wSOL
  reward_vault + SyncNative -> crank_sync, all in one tx
  read model: /api/staking/stats (aggregate getProgramAccounts, cached)

frontend (/stake)
  reads pool + position via client SDK; stake/unstake/claim signed by the
  Privy embedded Solana wallet or an external Wallet Standard wallet
  (Phantom, Solflare, ...); external wallets pay their own tx fee, the
  embedded wallet stays gas-sponsored
```

The pool PDA is `[b"pool", staked_mint, pool_id]` (`pool_id` is a `u8` stored in
`StakePool`), so a new pool can be created for the same mint; retired pools keep
their address. Production runs `pool_id = 1`; the v1 USDC pool
(`H4XFUj2kSVq5r48LAbJtaS5BVBzCVMS5S2z8GPSPFknm`) is retired and unreachable by
the upgraded program.

## Reward math (MasterChef / Synthetix accumulator)

```
weight              = amount * tier.multiplier_bps / 10_000
total_weight        = sum of position weights
# funded SOL (lamports) drips linearly over reward_duration (Synthetix), not all at once:
reward_rate         = funded * ACC_SCALE / reward_duration    (on crank/notify)
acc_reward_per_weight += reward_rate * elapsed / total_weight (on each touch)
position pending    += weight * acc / ACC_SCALE - reward_debt (settle)
reward_debt          = weight * acc / ACC_SCALE               (re-anchor)
```

Rewards accrue over real time, so a position must be staked across the window to
earn -- a one-slot (JIT) position earns ~0. This is the fix for the lump-vs-drip
HIGH finding (see `solana/SECURITY.md`). Principal is returned 1:1 (never
revalued); only the SOL reward is weighted. `ACC_SCALE = 1e18`; `reward_duration`
is set at init (production: e.g. 7 days).

## Instructions

| Instruction | Who | Effect |
|---|---|---|
| `initialize_pool(pool_id, tiers, reward_duration_secs, funder)` | upgrade authority (per pool_id) | Create pool + vaults; set immutable tiers + reward-drip window; reject unsafe Token-2022 extensions. Gated to the program upgrade authority (anti front-run). A new `pool_id` creates a fresh pool for the same mint. |
| `stake(tier_index, amount)` | user | Deposit $ATELIER into a tier; create/extend position; re-lock. |
| `unstake(amount)` | user | Withdraw principal after lock expiry. |
| `claim()` | user | Withdraw accrued SOL (the wSOL reward is unwrapped to native SOL in the same tx). |
| `crank_sync()` | `pool.funder` | Drip accrued rewards up to now, then fold any new deposit into a fresh linear drip window (backend cranks after funding). |
| `set_paused(paused)` | admin | Pause NEW stakes only -- never unstake/claim. |

No instruction can move vault funds except the owner's own `unstake`/`claim`.
This is the core anti-rug property. See SECURITY.md.

## Tiers

| Index | Lock | Multiplier | Unstake |
|---|---|---|---|
| 0 | 15 days | 1x | after term |
| 1 | 30 days | 4x | after term |
| 2 | 60 days | 10x | after term |
| 3 | 180 days | 20x | after term |

`multiplier_bps`: 10000 / 40000 / 100000 / 200000.

## Worked example

1.5M total weight in the pool, 10 SOL funded that week. A 180d staker with
10,000 $ATELIER = 200,000 weight = 13.3% share = ~1.33 SOL. The same 10,000 in
the 15-day tier (10,000 weight) earns ~0.067 SOL. The 20x spread is the
incentive.

## File map

| Purpose | Path |
|---|---|
| Anchor program | `solana/programs/atelier-staking/src/` |
| Security review | `solana/SECURITY.md` |
| Deploy/audit runbook | `solana/DEPLOY_AUDIT_RUNBOOK.md` |
| Client config + PDAs + reward math | `src/lib/staking-config.ts` |
| Client SDK (ix builders, decoders) | `src/lib/staking-program.ts` |
| Reward funding (server) | `src/lib/staking-rewards.ts` |
| Funding cron | `src/app/api/cron/staking-rewards/route.ts` |
| Stats read model | `src/app/api/staking/stats/route.ts` |
| Stake page | `src/app/stake/` |

## Status

- Program builds to BPF; **8/8 on-chain tests pass** on a local validator; host
  `cargo check` clean.
- Two independent security reviews (2026-06-29). First: init front-run (MED-1)
  fixed via an upgrade-authority gate; reward-mint extension check (LOW-1) added.
  Second: found a **HIGH** lump-distribution flaw (a JIT/monopoly staker could
  scoop a funding tranche) -- fixed by switching to a Synthetix-style linear
  reward drip; plus checks-effects-interactions ordering. See `solana/SECURITY.md`.
- Full web app passes `tsc`; client SDK verified against the generated IDL
  byte-for-byte (discriminators + every builder's account order/signer/writable
  flags). Generated IDL committed at `solana/idl/atelier_staking.json`.
- Committed to branch `staking`.
- **LIVE ON MAINNET (2026-07-21).** Professionally audited (user-confirmed
  2026-07-21) after three internal reviews + the Codex automated audit. Program
  `5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq`; live pool
  `F4mnn2WiHNMpWU8Y6hE8LasroS1MbskQLRbLCfynPgaa` (pool_id 1, SOL rewards,
  15d 1x / 30d 4x / 60d 10x / 180d 20x, 7d drip, funder = treasury). The v1
  USDC pool (H4XFU...) is retired. Remaining ops item: move the upgrade
  authority to a multisig (runbook section 4).

## Explicitly deferred (kept out of v1 and the v2 SOL-rewards revision)

Token emissions, stake-to-save fee discounts, referrals, burn / early-exit
penalty, lock-weight decay-on-expiry.
