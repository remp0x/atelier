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
| MED-2 | Crank front-run on an empty/near-empty pool could let a 1-atom staker scoop a tranche funded before real stakers exist. | **Mitigated.** Funding cron skips when `total_weight == 0`, and transfer+crank are one atomic tx; runbook also advises streaming the budget. Bounded to the pre-funded-empty window only. |
| LOW-1 | `reward_mint` not run through the extension blocklist (a fee/hook reward mint would underpay/revert claims). | **Fixed.** `assert_safe_mint` now checks both mints at init. USDC (legacy SPL) passes trivially. |
| LOW-2 | `unstake`/`claim` call `sync_rewards`, coupling principal return to reward bookkeeping. | **Accepted.** Both error paths (`RewardVaultBalanceMismatch`, `MathOverflow`) are unreachable given USDC supply and bounded weight; flagged for the auditor as defense-in-depth, not a live bug. |
| LOW-3 | Blocklist is complete for v6.0.0 but v7 adds `Pausable`/`ScaledUiAmount`. | **Accepted + pinned.** `spl-token-2022` is pinned via `Cargo.lock`; re-audit the blocklist on any bump (also residual #2 below). |

## Known residual items for the auditor

1. The program upgrade authority remains the top centralization risk until moved
   to a multisig / made immutable post-init (see "Upgrade authority").
2. Re-confirm the Token-2022 extension blocklist is complete for the
   `spl-token-2022` version pinned at build time -- new extensions appear over
   time (v7: `Pausable`, `ScaledUiAmount`).
3. Re-confirm `reward_vault_last_balance` cannot desync under concurrent
   stake/claim within one slot (Anchor serializes per-account writes; the prior
   review found the mismatch guard unreachable, but re-verify).
