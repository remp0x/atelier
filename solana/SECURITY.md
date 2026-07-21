# atelier-staking -- Security Notes

Status: **UNAUDITED.** This program custodies user funds. It MUST NOT hold real
mainnet $ATELIER or SOL until a professional third-party audit is complete. See
`DEPLOY_AUDIT_RUNBOOK.md` for the gate.

This document maps the standard Solana/Anchor + Token-2022 vulnerability classes
to how this program addresses each. It is the self-review pass, not a substitute
for an audit.

## Trust model

- The pool PDA is the sole authority over both vaults (`staked_vault`,
  `reward_vault`). No private key controls vault funds.
- There is intentionally **no instruction that lets the admin move vault funds.**
  The only outflows are `unstake` (a user withdrawing their own principal) and
  `claim` (a user withdrawing their own accrued rewards). Grep the program: the
  only `transfer_checked` calls with the pool as `authority` are in `unstake`
  (to `owner_staked_ata`) and `claim` (to `owner_reward_ata`).
- `set_paused` gates `stake` only. `unstake` and `claim` never check `paused`,
  so a malicious or compromised admin cannot freeze user withdrawals.
- `initialize_pool` is gated to the **program upgrade authority** (an Anchor
  `ProgramData` constraint), so the deterministic pool PDA (per mint + `pool_id`)
  cannot be front-run and seized by an attacker. See "Init authorization" below.
- The program upgrade authority is the remaining centralization risk -- see
  "Upgrade authority" below.

## Account validation

| Class | Mitigation |
|---|---|
| Missing signer check | `owner: Signer`, `admin: Signer`. State-changing user actions require the owner's signature. |
| Missing owner/identity check | `position` carries `has_one = owner, has_one = pool`. Pool re-derived from `seeds = [POOL_SEED, staked_mint, pool_id]` with `bump = pool.bump`. |
| Account substitution (fake vault) | `staked_vault` / `reward_vault` pinned with `address = pool.staked_vault` / `address = pool.reward_vault`. User ATAs pinned with `token::mint` + `token::authority = owner` + `token::token_program`. |
| Type cosplay | Anchor 8-byte discriminators on every `#[account]`; `InterfaceAccount`/`Account` enforce them. |
| PDA / bump | All PDAs use canonical bumps; pool/position bumps are stored at init and reused via `bump = ...`, never re-grinded. |
| Reinitialization | `initialize_pool` uses `init` (fails if pool exists). `stake` uses `init_if_needed` for positions but never overwrites identity on an existing account -- identity fields are set only when `position.owner == Pubkey::default()`, and the seeds (`pool, owner, tier_index`) + discriminator make substitution impossible. |
| Init front-running | The pool PDA is deterministic per staked mint + `pool_id`, so anyone could otherwise create a canonical pool address first and become its permanent `admin`. `initialize_pool` therefore requires the signer to be the program's upgrade authority (`program.programdata_address()? == Some(program_data.key())` + `program_data.upgrade_authority_address == Some(admin.key())`, both -> `Unauthorized`). Initialize the pool BEFORE making the program immutable, or init becomes impossible. |
| Account closing / revival | No accounts are closed in v1, so there is no close-revival or rent-drain surface. (A future `close_position` must use Anchor `close =` with the standard zero-discriminator guard.) |
| Arbitrary CPI | Token CPIs go through `Interface<TokenInterface>`, which Anchor constrains to the real SPL Token / Token-2022 programs; the staked/reward token program must own the corresponding mint (enforced by `token::token_program`). |

## Accounting math

- **Overflow:** every arithmetic op uses `checked_*` and maps to
  `MathOverflow`. The accumulator products `weight * acc_reward_per_weight` and
  `reward_rate * elapsed` are computed via a 256-bit `mul_div_floor` (`math.rs`,
  unit-tested) so the intermediate can never overflow u128 -- a plain u128 product
  would revert once `acc_reward_per_weight` grew large and permanently cap future
  stake sizes (external-audit P1; see "External audit" below).
- **Accumulator pattern:** MasterChef/Synthetix `acc_reward_per_weight`. On every
  money operation the position is `settle`d against the current accumulator
  before its weight changes, then `reward_debt` is re-anchored to the new weight
  (`reset_reward_debt`). This is the canonical drain-safe ordering.
- **Time-drip distribution (not lump):** funded SOL is NOT folded into the
  accumulator at once. `crank` (`notify_reward`) sets a `reward_rate` and a
  `period_finish = now + reward_duration`; `update_rewards(now)` -- called at the
  start of every stake/unstake/claim/crank, before any settle or weight change --
  advances the accumulator by `reward_rate * elapsed / total_weight` up to
  `period_finish`. So rewards accrue over real time; a position must be staked
  across the window to earn (Synthetix `StakingRewards`). This is what defeats
  crank front-running / JIT capture (see Economic).
- **Empty-pool handling:** `update_rewards` advances `last_update_time` even when
  `total_weight == 0`, so reward time that elapses while the pool is empty is
  skipped -- NOT retroactively granted to the first staker (this closes the
  "fund empty pool then be first staker" capture). The funding cron additionally
  refuses to fund a pool with `total_weight == 0`, so that SOL is not wasted.
- **Claim accounting:** after paying out, `reward_vault_last_balance` is
  decremented by the payout so the next crank's deposit-delta is correct. A vault
  balance below the recorded last balance is treated as corruption
  (`RewardVaultBalanceMismatch`) rather than silently floored. Claim follows
  checks-effects-interactions: `pending_reward` is zeroed and balances updated
  BEFORE the payout CPI (defense-in-depth against a reentrant transfer hook,
  which is itself blocklisted).
- **Precision:** `ACC_SCALE = 1e18`. For any realistic `total_weight`
  (<= ~2e16 base units for a 1e9-supply, 6-decimal token at 20x), a 1-lamport
  deposit still advances the accumulator by >= 1, so no dust is lost on the
  distribution side; lamports (9-decimal SOL) are smaller base units than the
  previous micro-USDC, so the margin only improves. Rounding on the claim side
  truncates in the vault's favor.

## Lock enforcement

- `unstake` requires `now >= position.lock_until` (from the `Clock` sysvar).
  A zero-duration tier would keep `lock_until = 0` (always withdrawable); the
  production tier set is 15/30/60/180 days, so every position carries a lock.
- Adding to a locked position re-locks the **entire** position to
  `now + tier.duration` (never shortens an existing lock). Documented behavior.

## Token-2022 specifics

- **transfer_checked everywhere** (not `transfer`), with the mint's decimals, as
  Token-2022 requires.
- **Received-amount measurement:** `stake` credits the actual
  `staked_vault.amount` delta (post-transfer `reload()`), not the requested
  amount -- so even if a fee-bearing mint slipped through, the vault could not be
  credited more than it received.
- **Unsafe-extension blocklist** (`assert_safe_mint`, enforced at
  `initialize_pool` on **both** the staked and reward mints): rejects
  `TransferFeeConfig`, `TransferHook`, `PermanentDelegate`,
  `ConfidentialTransferMint`, `DefaultAccountState`, `NonTransferable`,
  `MintCloseAuthority`. This neutralizes the transfer-hook reentrancy/arbitrary-CPI
  vector and the transfer-fee insolvency vector at the source. Checking the reward
  mint as well prevents a fee/hook reward mint from underpaying or reverting
  claims. Legacy SPL mints (wSOL) pass trivially. **$ATELIER confirmed passing
  (2026-06-29):** it is a Token-2022 mint carrying only `MetadataPointer` +
  `TokenMetadata` (both authorities Disabled; mint/freeze authority revoked) --
  no blocklisted extension, so `assert_safe_mint` accepts it. Re-verify before
  mainnet init in case the mint changes.

## Economic

- **Reward-timing farming / JIT / crank front-running:** rewards drip linearly
  over `reward_duration` (see "Time-drip distribution"), so the share a position
  captures is proportional to weight x **time staked within the window**, not to
  who holds weight at the single instant of a crank. A zero-lock staker who stakes
  one slot before a crank and unstakes one slot after earns ~0 (their elapsed
  reward-time is ~0). This was NOT true of the original lump-on-crank design,
  which distributed the whole tranche to whoever held weight at crank time and
  was exploitable by a 1-atom monopolist (low TVL) or a JIT whale -- the HIGH
  finding from the 2026-06-29 second review, fixed by the drip. Choosing
  `reward_duration >>` slot time (and ideally >= the funding cadence) is what
  makes the window meaningful; a very short duration re-opens the JIT vector.
  Streaming the budget in smaller increments remains an optional extra smoother.
  A minimum `reward_duration` (`MIN_REWARD_DURATION_SECS = 60`) is now **enforced
  on-chain** at init so the security assumption no longer rests on an unchecked
  parameter (external-audit P3); the init tooling additionally refuses anything
  below 1 day for production.
- **First-staker inflation / donation attack:** not applicable -- this is a
  reward-accumulator design, not an ERC4626 share-price design, so there is no
  share price to manipulate by donating to the vault. Principal is tracked 1:1.

## Upgrade authority (the remaining centralization risk)

The deployed program is BPF-upgradeable. Whoever holds the upgrade authority can
replace the program and thus could introduce a draining instruction. Mitigation
(see runbook): move the upgrade authority to a multisig before mainnet and
publish a verifiable build; consider making it immutable after the audit.

## Init authorization

`initialize_pool` requires two accounts and rejects with `Unauthorized` unless
the signer holds the program upgrade authority:

```
program:      Program<AtelierStaking>   constraint = programdata_address()? == Some(program_data)
program_data: Account<ProgramData>      constraint = upgrade_authority_address == Some(admin)
```

Because the pool PDA is `[POOL_SEED, staked_mint, pool_id]` (one canonical
address per mint + `pool_id`), without this gate any account could create a real
$ATELIER pool first and hold `admin` permanently (then `set_paused(true)` to
brick new stakes; funds stay safe but that pool is unusable and unrecoverable
short of migrating to a new `pool_id`). Tying init to the upgrade authority needs no foreknowledge of
the admin key and reuses the trust root that already governs the program.
Operational note: initialize the pool **before** making the program immutable --
an immutable program has `upgrade_authority_address == None`, which makes
`initialize_pool` permanently uncallable.

## Independent review (2026-06-29)

An independent adversarial pass traced the full reward lifecycle, every account
constraint, the Token-2022 blocklist against the pinned `spl-token-2022 6.0.0`
enum, and the entire transfer surface. **No Critical and no High issues.** The
custody model holds: the only token outflows are user `unstake`/`claim`; there is
no admin/burn/mint/set_authority/close path to vault funds; `set_paused` does not
leak into `unstake`/`claim`; the accumulator cannot be over-drawn; principal is
1:1. Findings and resolution:

| ID | Issue | Resolution |
|---|---|---|
| MED-1 | Permissionless `initialize_pool` + deterministic PDA + immutable admin -> init front-run could permanently brick new stakes (availability, not funds). | **Fixed.** Init gated to the program upgrade authority (see "Init authorization"); covered by the `rejects initialize_pool from a non-upgrade-authority` test. |
| MED-2 | Crank front-run on an empty/near-empty pool could let a 1-atom staker scoop a tranche funded before real stakers exist. | **Superseded by the drip fix (HIGH-1 below).** The first attempt (cron skips `total_weight == 0`) only caught the exactly-empty case; the second review showed the root cause was lump distribution. Now fixed for the general case by time-drip. |
| LOW-1 | `reward_mint` not run through the extension blocklist (a fee/hook reward mint would underpay/revert claims). | **Fixed.** `assert_safe_mint` now checks both mints at init. USDC (the reward mint at the time, legacy SPL) passed trivially; wSOL, also legacy SPL, does too. |
| LOW-3 | Blocklist is complete for v6.0.0 but v7 adds `Pausable`/`ScaledUiAmount`. | **Accepted + pinned.** `spl-token-2022` is pinned via `Cargo.lock`; re-audit the blocklist on any bump (also residual #2 below). |

### Second review (2026-06-29) -- found the lump-distribution flaw the first pass missed

| ID | Issue | Resolution |
|---|---|---|
| HIGH-1 | **Lump reward distribution.** `sync_rewards` folded each funded tranche into the accumulator instantly, paying it to whoever held weight at that single instant. A 1-atom monopolist (low TVL) could pre-stake before the scheduled crank and take the whole tranche; a JIT whale could stake flexible for one slot around the crank and capture a large share. Defeated the point of rewarding committed stake. Rewards only (never principal). | **Fixed.** Replaced lump distribution with a Synthetix-style linear drip over `reward_duration` (`reward_rate`/`period_finish`/`last_update_time`/`update_rewards`/`notify_reward`). A one-slot position now earns ~0. Covered by the `drips rewards over time` test. |
| LOW-2 (CEI) | State mutated after the token-transfer CPI in `claim`/`unstake` -- reentrancy safety rested entirely on the (version-fragile) transfer-hook blocklist. | **Fixed.** Reordered to checks-effects-interactions: `claim` zeroes `pending_reward`/updates balances and `unstake` applies weight/total updates BEFORE the payout/principal CPI. |
| LOW (cron) | `recentlyFunded()` parsed the SQLite timestamp with a space separator (`Date.parse` may yield `NaN`), which would skip the double-funding guard. | **Fixed.** Normalize to ISO (`' ' -> 'T'`) and fail SAFE (treat unparseable as recently-funded) -- treasury cost only, never user funds. |
| LOW (info) | Pool `admin` (the `set_paused` key) does not follow the upgrade authority; a post-multisig compromise of the original deploy wallet could pause NEW stakes (availability only -- `unstake`/`claim` never check `paused`). | **Accepted** (residual #4). No fund access. Consider a multisig-gated `set_admin` later. |
| LOW (info) | `update_rewards` floors `reward_rate * elapsed / total_weight`; with an extreme high-supply/high-multiplier mint (`total_weight > 1e18`) per-tick remainders could accrue slowly. Not reachable for $ATELIER (`total_weight <= ~2e16` at the 20x max tier). | **Accepted.** Bounded, vault-favoring; documented for the auditor. |

### Drip verification (third pass, 2026-06-29)

An independent pass re-derived the drip math: **conservation is proven** -- total
claimable <= total funded reward base units (micro-USDC then, lamports in the
current SOL-reward design) for arbitrary weight changes and re-fundings
(every rounding floors in the vault's favor), so there is no over-draw or
insolvency; ordering, leftover rollover, empty-pool skip, overflow bounds, time
edge cases (incl. clock-backwards), the CEI reorder, and the client mirror
(`projectAccRewardPerWeight`, `decodeStakePool` offsets) all check out, and every
earlier fix remains intact. **No Critical/High.** One new LOW:

| ID | Issue | Resolution |
|---|---|---|
| LOW (grief) | `crank_sync`/`notify_reward` are permissionless, so anyone can donate dust + crank to repeatedly reset `period_finish` and stretch the drip into a slower tail. **Value is fully conserved** (nothing stolen/destroyed); the attacker pays fees for zero gain and must land a tx ~every second for days to matter. Known Synthetix `notifyRewardAmount` property (they gate it to a distributor role). | **Fixed** (escalated to P2 by the external audit). `crank_sync` is now gated to `pool.funder` (`has_one = funder`), set at init to the backend funding wallet -- the Synthetix distributor-role approach. The funding cron signs as that funder. See "External audit" below. |

### External audit (Codex, 2026-06-29)

A third-party automated audit (Codex) ran `cargo test`/`cargo check` and traced
the accumulator math, the permission model, and the init parameters. It confirmed
the custody model (no admin path to vault funds; outflows only via `claim`/
`unstake`; CEI ordering; the upgrade-authority init gate). Findings + resolutions:

| ID | Severity | Issue | Resolution |
|---|---|---|---|
| P1 | High-class | `weight * acc_reward_per_weight` was a plain u128 multiply. `acc_reward_per_weight` grows unboundedly (it accumulates `reward_rate * elapsed / total_weight`, so a tiny-TVL period inflates it). Once large, `reset_reward_debt`/`settle` would revert via `checked_mul` for big future stakes -- permanently capping stake sizes until upgrade (a tiny dust staker funding ~$42 could block a 1M-token 8x stake -- 8x was the max tier at the time). | **Fixed.** `accumulated()` and the `update_rewards` increment now use a 256-bit `mul_div_floor` (`math.rs`) so the product never overflows; it returns an error only if the *final* quotient exceeds u128 (unreachable within USDC supply -- then the reward unit -- and equally unreachable for lamports). Unit-tested (7 cases incl. the overflow-but-quotient-fits scenario) plus the full reward suite. No min-TVL gate is needed: with 256-bit math a large `acc` is harmless, and `acc` is bounded by the total reward funded (then USDC, now SOL). |
| P2 | Med-class | Permissionless re-notify griefing (the LOW grief above) -- dust donation + crank repeatedly resets `period_finish`, delaying unvested rewards. | **Fixed.** `crank_sync` gated to `pool.funder` (`has_one = funder`). Covered by the `rejects crank_sync from a non-funder` test. |
| P3 | Low | `reward_duration_secs = 1` was allowed (init only checked `> 0` and the max); a sub-slot window reopens JIT capture, so the security assumption rested on an unenforced parameter. | **Fixed.** `MIN_REWARD_DURATION_SECS = 60` enforced on-chain; init tooling refuses `< 1 day` for production (override only for devnet/tests). Covered by the `rejects a reward duration below the on-chain minimum` test. |
| P3 (doc) | Low | `AUDIT.md` overstated the overflow review ("no High remained" while the u128 product overflow was still present). | **Fixed.** `AUDIT.md` updated to record P1 and its fix so the external auditor does not inherit a false "cleared" premise. |

## Known residual items for the auditor

1. The program upgrade authority remains the top centralization risk until moved
   to a multisig / made immutable post-init (see "Upgrade authority").
2. Re-confirm the Token-2022 extension blocklist is complete for the
   `spl-token-2022` version pinned at build time -- new extensions appear over
   time (v7: `Pausable`, `ScaledUiAmount`).
3. Re-confirm `reward_vault_last_balance` cannot desync under concurrent
   stake/claim within one slot (Anchor serializes per-account writes; the prior
   review found the mismatch guard unreachable, but re-verify).
