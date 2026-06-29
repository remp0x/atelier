# Atelier Staking -- Spec

On-chain, revenue-share staking for $ATELIER. Stake $ATELIER into a lock tier,
earn a pro-rata share of platform revenue paid in USDC. Non-custodial: the
program holds funds, not Atelier.

## Decisions (how we got here)

| Decision | Choice | Why |
|---|---|---|
| Reward type | Real yield (USDC from platform fees) | Non-inflationary; $ATELIER mint authority is revoked so emissions are impossible anyway. Ties staking to the flywheel. |
| Custody | On-chain Solana program (non-custodial) | User-chosen. Trustless; program-owned vaults; no "trust Atelier" with staked funds. |
| Base | Clean-room Anchor program | The only audited program with the right shape (`mithraiclabs/spl-token-staking`) is BUSL-1.1 (deploy-blocked to 2027); nothing audited supports Token-2022. So we build fresh, using its architecture as reference. |
| Lock model | 3 discrete tiers (Parquet-style), continuous accrual | Discrete tiers = a lookup table, not an interpolation curve. Continuous accrual + claim-anytime = simpler than epochs and matches the accumulator. |
| Multipliers | Moderate: flexible 1x / 90d 4x / 180d 8x | User-chosen. Rewards commitment without nuking casual stakers; bounded enough to keep expiry handling simple. |
| Chain | Solana only | Token stays on Solana (Base migration shelved). Rewards paid in USDC on Solana. |

## Architecture

```
on-chain (solana/programs/atelier-staking)   <- source of truth
  StakePool (per mint): accumulator, totals, tier config, vault authority
  StakePosition (per owner+tier): amount, weight, reward_debt, pending, lock_until
  vaults: staked_vault (ATELIER), reward_vault (USDC), both owned by pool PDA

backend (src/lib/staking-rewards.ts, /api/cron/staking-rewards)
  weekly: tally revenue share -> transfer USDC to reward_vault -> crank_sync
  read model: /api/staking/stats (aggregate getProgramAccounts, cached)

frontend (/stake)
  reads pool + position via client SDK; stake/unstake/claim signed by the
  Privy embedded Solana wallet
```

## Reward math (MasterChef / Synthetix accumulator)

```
weight              = amount * tier.multiplier_bps / 10_000
total_weight        = sum of position weights
# funded USDC drips linearly over reward_duration (Synthetix), not all at once:
reward_rate         = funded * ACC_SCALE / reward_duration    (on crank/notify)
acc_reward_per_weight += reward_rate * elapsed / total_weight (on each touch)
position pending    += weight * acc / ACC_SCALE - reward_debt (settle)
reward_debt          = weight * acc / ACC_SCALE               (re-anchor)
```

Rewards accrue over real time, so a position must be staked across the window to
earn -- a one-slot (JIT) position earns ~0. This is the fix for the lump-vs-drip
HIGH finding (see `solana/SECURITY.md`). Principal is returned 1:1 (never
revalued); only the USDC reward is weighted. `ACC_SCALE = 1e18`; `reward_duration`
is set at init (production: e.g. 7 days).

## Instructions

| Instruction | Who | Effect |
|---|---|---|
| `initialize_pool(tiers, reward_duration)` | upgrade authority (once) | Create pool + vaults; set immutable tiers + reward-drip window; reject unsafe Token-2022 extensions. Gated to the program upgrade authority (anti front-run). |
| `stake(tier_index, amount)` | user | Deposit $ATELIER into a tier; create/extend position; re-lock. |
| `unstake(amount)` | user | Withdraw principal after lock expiry. |
| `claim()` | user | Withdraw accrued USDC. |
| `crank_sync()` | anyone | Drip accrued rewards up to now, then fold any new deposit into a fresh linear drip window (backend cranks after funding). |
| `set_paused(paused)` | admin | Pause NEW stakes only -- never unstake/claim. |

No instruction can move vault funds except the owner's own `unstake`/`claim`.
This is the core anti-rug property. See SECURITY.md.

## Tiers

| Index | Lock | Multiplier | Unstake |
|---|---|---|---|
| 0 | Flexible | 1x | anytime |
| 1 | 90 days | 4x | after term |
| 2 | 180 days | 8x | after term |

## Worked example

1.5M total weight in the pool, $2,000 USDC funded that week. A 180d staker with
10,000 $ATELIER = 80,000 weight = 5.3% share = ~$107. The same 10,000 left
flexible (10,000 weight) earns ~$13. The 8x spread is the incentive.

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
- Full web app passes `tsc`; client SDK discriminators match the generated IDL
  byte-for-byte. Generated IDL committed at `solana/idl/atelier_staking.json`.
- Committed to branch `staking`.
- **NOT deployed. NOT audited.** Mainnet is gated on a professional audit, the
  $ATELIER extension check, and securing the upgrade authority (runbook section 4).

## Explicitly v2 (kept out of v1)

Token emissions, stake-to-save fee discounts, referrals, burn / early-exit
penalty, lock-weight decay-on-expiry.
