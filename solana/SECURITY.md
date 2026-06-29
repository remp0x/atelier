# atelier-staking -- Security Notes

Status: **UNAUDITED.** This program custodies user funds. It MUST NOT hold real
mainnet $ATELIER or USDC until a professional third-party audit is complete. See
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
  `ProgramData` constraint), so the deterministic per-mint pool PDA cannot be
  front-run and seized by an attacker. See "Init authorization" below.
- The program upgrade authority is the remaining centralization risk -- see
  "Upgrade authority" below.

## Account validation

| Class | Mitigation |
|---|---|
| Missing signer check | `owner: Signer`, `admin: Signer`. State-changing user actions require the owner's signature. |
| Missing owner/identity check | `position` carries `has_one = owner, has_one = pool`. Pool re-derived from `seeds = [POOL_SEED, staked_mint]` with `bump = pool.bump`. |
| Account substitution (fake vault) | `staked_vault` / `reward_vault` pinned with `address = pool.staked_vault` / `address = pool.reward_vault`. User ATAs pinned with `token::mint` + `token::authority = owner` + `token::token_program`. |
| Type cosplay | Anchor 8-byte discriminators on every `#[account]`; `InterfaceAccount`/`Account` enforce them. |
| PDA / bump | All PDAs use canonical bumps; pool/position bumps are stored at init and reused via `bump = ...`, never re-grinded. |
| Reinitialization | `initialize_pool` uses `init` (fails if pool exists). `stake` uses `init_if_needed` for positions but never overwrites identity on an existing account -- identity fields are set only when `position.owner == Pubkey::default()`, and the seeds (`pool, owner, tier_index`) + discriminator make substitution impossible. |
| Init front-running | The pool PDA is deterministic per staked mint, so anyone could otherwise create the canonical pool first and become its permanent `admin`. `initialize_pool` therefore requires the signer to be the program's upgrade authority (`program.programdata_address()? == Some(program_data.key())` + `program_data.upgrade_authority_address == Some(admin.key())`, both -> `Unauthorized`). Initialize the pool BEFORE making the program immutable, or init becomes impossible. |
| Account closing / revival | No accounts are closed in v1, so there is no close-revival or rent-drain surface. (A future `close_position` must use Anchor `close =` with the standard zero-discriminator guard.) |
| Arbitrary CPI | Token CPIs go through `Interface<TokenInterface>`, which Anchor constrains to the real SPL Token / Token-2022 programs; the staked/reward token program must own the corresponding mint (enforced by `token::token_program`). |

## Accounting math

- **Overflow:** every arithmetic op uses `checked_*` and maps to
  `MathOverflow`. `Cargo.toml` also sets `overflow-checks = true` in release as
  defense in depth.
- **Accumulator pattern:** MasterChef/Synthetix `acc_reward_per_weight`. On every
  money operation the position is `settle`d against the current accumulator
  before its weight changes, then `reward_debt` is re-anchored to the new weight
  (`reset_reward_debt`). This is the canonical drain-safe ordering.
- **Time-drip distribution (not lump):** funded USDC is NOT folded into the
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
  refuses to fund a pool with `total_weight == 0`, so that USDC is not wasted.
- **Claim accounting:** after paying out, `reward_vault_last_balance` is
  decremented by the payout so the next crank's deposit-delta is correct. A vault
  balance below the recorded last balance is treated as corruption
  (`RewardVaultBalanceMismatch`) rather than silently floored. Claim follows
  checks-effects-interactions: `pending_reward` is zeroed and balances updated
  BEFORE the payout CPI (defense-in-depth against a reentrant transfer hook,
  which is itself blocklisted).
- **Precision:** `ACC_SCALE = 1e18`. For any realistic `total_weight`
  (<= ~1e16 base units for a 1e9-supply, 6-decimal token at 8x), a 1-base-unit
  USDC deposit still advances the accumulator by >= 1, so no dust is lost on the
  distribution side. Rounding on the claim side truncates in the vault's favor.

## Lock enforcement

- `unstake` requires `now >= position.lock_until` (from the `Clock` sysvar).
  Flexible tier has `lock_until = 0`, so it is always withdrawable.
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
  claims. Legacy SPL mints (USDC) pass trivially. **$ATELIER confirmed passing
  (2026-06-29):** it is a Token-2022 mint carrying only `MetadataPointer` +
  `TokenMetadata` (both authorities Disabled; mint/freeze authority revoked) --
  no blocklisted extension, so `assert_safe_mint` accepts it. Re-verify before
  mainnet init in case the mint changes.

## Economic

- **Reward-timing farming / JIT / crank front-running:** rewards drip linearly
  over `reward_duration` (see "Time-drip distribution"), so the share a position
  captures is proportional to weight x **time staked within the window**, not to
  who holds weight at the single instant of a crank. A flexible staker who stakes
  one slot before a crank and unstakes one slot after earns ~0 (their elapsed
  reward-time is ~0). This was NOT true of the original lump-on-crank design,
  which distributed the whole tranche to whoever held weight at crank time and
  was exploitable by a 1-atom monopolist (low TVL) or a JIT whale -- the HIGH
  finding from the 2026-06-29 second review, fixed by the drip. Choosing
  `reward_duration >>` slot time (and ideally >= the funding cadence) is what
  makes the window meaningful; a very short duration re-opens the JIT vector.
  Streaming the budget in smaller increments remains an optional extra smoother.
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

Because the pool PDA is `[POOL_SEED, staked_mint]` (one canonical address per
mint), without this gate any account could create the real $ATELIER pool first
and hold `admin` permanently (then `set_paused(true)` to brick new stakes; funds
stay safe but the pool is unusable and unrecoverable short of a redeploy under a
new program id). Tying init to the upgrade authority needs no foreknowledge of
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
| LOW-1 | `reward_mint` not run through the extension blocklist (a fee/hook reward mint would underpay/revert claims). | **Fixed.** `assert_safe_mint` now checks both mints at init. USDC (legacy SPL) passes trivially. |
| LOW-3 | Blocklist is complete for v6.0.0 but v7 adds `Pausable`/`ScaledUiAmount`. | **Accepted + pinned.** `spl-token-2022` is pinned via `Cargo.lock`; re-audit the blocklist on any bump (also residual #2 below). |

### Second review (2026-06-29) -- found the lump-distribution flaw the first pass missed

| ID | Issue | Resolution |
|---|---|---|
| HIGH-1 | **Lump reward distribution.** `sync_rewards` folded each funded tranche into the accumulator instantly, paying it to whoever held weight at that single instant. A 1-atom monopolist (low TVL) could pre-stake before the scheduled crank and take the whole tranche; a JIT whale could stake flexible for one slot around the crank and capture a large share. Defeated the point of rewarding committed stake. Rewards only (never principal). | **Fixed.** Replaced lump distribution with a Synthetix-style linear drip over `reward_duration` (`reward_rate`/`period_finish`/`last_update_time`/`update_rewards`/`notify_reward`). A one-slot position now earns ~0. Covered by the `drips rewards over time` test. |
| LOW-2 (CEI) | State mutated after the token-transfer CPI in `claim`/`unstake` -- reentrancy safety rested entirely on the (version-fragile) transfer-hook blocklist. | **Fixed.** Reordered to checks-effects-interactions: `claim` zeroes `pending_reward`/updates balances and `unstake` applies weight/total updates BEFORE the payout/principal CPI. |
| LOW (cron) | `recentlyFunded()` parsed the SQLite timestamp with a space separator (`Date.parse` may yield `NaN`), which would skip the double-funding guard. | **Fixed.** Normalize to ISO (`' ' -> 'T'`) and fail SAFE (treat unparseable as recently-funded) -- treasury cost only, never user funds. |
| LOW (info) | Pool `admin` (the `set_paused` key) does not follow the upgrade authority; a post-multisig compromise of the original deploy wallet could pause NEW stakes (availability only -- `unstake`/`claim` never check `paused`). | **Accepted** (residual #4). No fund access. Consider a multisig-gated `set_admin` later. |
| LOW (info) | `update_rewards` floors `reward_rate * elapsed / total_weight`; with an extreme high-supply/high-multiplier mint (`total_weight > 1e18`) per-tick remainders could accrue slowly. Not reachable for $ATELIER (`total_weight <= ~1e16`). | **Accepted.** Bounded, vault-favoring; documented for the auditor. |

## Known residual items for the auditor

1. The program upgrade authority remains the top centralization risk until moved
   to a multisig / made immutable post-init (see "Upgrade authority").
2. Re-confirm the Token-2022 extension blocklist is complete for the
   `spl-token-2022` version pinned at build time -- new extensions appear over
   time (v7: `Pausable`, `ScaledUiAmount`).
3. Re-confirm `reward_vault_last_balance` cannot desync under concurrent
   stake/claim within one slot (Anchor serializes per-account writes; the prior
   review found the mismatch guard unreachable, but re-verify).
