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
- **Empty-pool distribution:** `sync_rewards` returns early when
  `total_weight == 0` and deliberately does NOT advance
  `reward_vault_last_balance`, so USDC sent before anyone stakes is held in the
  vault and distributed to the first stakers rather than lost or div-by-zero'd.
- **Claim accounting:** after paying out, `reward_vault_last_balance` is
  decremented by the payout so the next `sync_rewards` delta is correct. A vault
  balance below the recorded last balance is treated as corruption
  (`RewardVaultBalanceMismatch`) rather than silently floored.
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
- **Unsafe-extension blocklist** (`assert_safe_staked_mint`, enforced at
  `initialize_pool`): rejects `TransferFeeConfig`, `TransferHook`,
  `PermanentDelegate`, `ConfidentialTransferMint`, `DefaultAccountState`,
  `NonTransferable`, `MintCloseAuthority`. This neutralizes the transfer-hook
  reentrancy/arbitrary-CPI vector and the transfer-fee insolvency vector at the
  source. $ATELIER must be confirmed to carry none of these (it is expected to
  carry only metadata extensions) -- verify on-chain before init.

## Economic

- **Reward-timing farming:** because accrual is continuous (not epoch-snapshot),
  there is no "stake right before the snapshot" exploit. A flexible staker who
  deposits right before a large reward sweep and unstakes right after still only
  earns at 1x for the brief window held; lock tiers earn more precisely because
  they cannot exit. To further blunt this, the funding cron MAY stream the
  weekly budget in smaller increments rather than one lump (see runbook).
- **First-staker inflation / donation attack:** not applicable -- this is a
  reward-accumulator design, not an ERC4626 share-price design, so there is no
  share price to manipulate by donating to the vault. Principal is tracked 1:1.

## Upgrade authority (the remaining centralization risk)

The deployed program is BPF-upgradeable. Whoever holds the upgrade authority can
replace the program and thus could introduce a draining instruction. Mitigation
(see runbook): move the upgrade authority to a multisig before mainnet and
publish a verifiable build; consider making it immutable after the audit.

## Known residual items for the auditor

1. `init_if_needed` on `position` -- confirm the identity guard is airtight.
2. Confirm the Token-2022 extension blocklist is complete for the spl-token-2022
   version pinned at build time (new extensions appear over time).
3. Confirm no rounding path lets `pending` underflow `reward_debt`.
4. Confirm `reward_vault_last_balance` cannot desync under concurrent
   stake/claim within one slot (Anchor serializes per-account writes; verify).
