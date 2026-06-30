# atelier-staking -- Auditor Brief

Hand this, plus `programs/atelier-staking/src/`, `SECURITY.md`, and
`DEPLOY_AUDIT_RUNBOOK.md`, to the auditor. This is the starting brief; `SECURITY.md`
has the full vuln-class mapping and the three internal-review findings.

## What it is

Non-custodial, on-chain revenue-share staking for $ATELIER (Solana, Anchor
0.31.1). Users stake $ATELIER (Token-2022) into one of three lock tiers; a share
of platform revenue paid in USDC accrues pro-rata to weighted stake via a
MasterChef/Synthetix `acc_reward_per_weight` accumulator, **dripped linearly over
a `reward_duration` window**. Principal returns 1:1; only the USDC reward is
weighted. PDA-owned vaults; the pool PDA is the sole vault authority.

## Scope

- `programs/atelier-staking/src/` (~6 files, ~700 LoC): `lib.rs`, `state.rs`,
  `instructions/{initialize_pool,stake,unstake,claim,crank,set_paused,mod}.rs`,
  `constants.rs`, `errors.rs`, `events.rs`.
- IDL: `idl/atelier_staking.json` (generated, committed). Program id
  `5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq`.
- Out of scope (context only): the TS client SDK (`src/lib/staking-*.ts`) and the
  funding cron (`src/lib/staking-rewards.ts`) in the web app.

## Build + test

SBF cargo caps at Rust 1.84, so `edition2024` deps are pinned in `Cargo.lock`:

```bash
anchor build --no-idl -- --tools-version v1.50
anchor idl build -o target/idl/atelier_staking.json --out-ts target/types/atelier_staking.ts
# tests need the upgrade authority = provider wallet, so deploy explicitly
# (anchor test genesis-loads with a different authority -> init gate rejects it):
solana-test-validator --reset --quiet & ; solana airdrop 100 <wallet> --url localhost
anchor deploy --provider.cluster localnet
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json \
  yarn run ts-mocha -p ./tsconfig.json -t 1000000 'tests/**/*.ts'   # 8/8 pass
```

On Rust >= 1.85 a plain `anchor build` works with no pins. Status: 8/8 on-chain
tests pass; deployed + full e2e verified on devnet (init -> stake -> fund ->
crank -> drip -> claim -> unstake).

## Trust model / invariants to confirm

1. **No admin path to vault funds.** The only `transfer_checked` calls with the
   pool PDA as authority are `unstake` (own principal) and `claim` (own rewards).
   No burn/mint/set_authority/close; `set_paused` gates `stake` only, never
   `unstake`/`claim`.
2. **Reward solvency.** Total claimable <= total funded micro-USDC for arbitrary
   weight changes and re-fundings; all rounding floors in the vault's favor.
3. **Init is gated to the program upgrade authority** (ProgramData constraint),
   since the pool PDA is deterministic per mint (anti front-run).
4. **Principal 1:1**, lock enforced (`now >= lock_until`), Token-2022 unsafe
   extensions blocked at init on both mints.

## Internal reviews (three passes, 2026-06-29) -- see SECURITY.md for detail

- **MED-1** init front-run -> fixed (upgrade-authority gate).
- **LOW-1** reward-mint extension check -> fixed.
- **HIGH-1** lump reward distribution let a JIT/monopoly staker scoop a tranche
  -> fixed by the Synthetix-style linear drip (`reward_rate`/`period_finish`/
  `last_update_time`/`update_rewards`/`notify_reward`). **This is the central
  change to scrutinize.**
- **LOW** checks-effects-interactions ordering in claim/unstake -> fixed.
- Conservation of the drip was re-derived and verified; no Critical/High remained.

## Please focus on

1. **Drip conservation + accounting** (`state.rs` `update_rewards`/`notify_reward`/
   `settle`): can anyone draw more than funded? Rounding direction. Leftover
   rollover on re-funding. Overflow at extreme amounts/durations.
2. **Init gate** (`initialize_pool.rs`): any bypass of the ProgramData /
   upgrade-authority constraints? Footgun: an immutable program can't init.
3. **Token-2022 blocklist** (`instructions/mod.rs` `assert_safe_mint`):
   completeness for the pinned `spl-token-2022 6.0.0` enum; behavior on version
   bump (v7 adds `Pausable`/`ScaledUiAmount`).
4. **Permissionless `crank_sync`/`notify_reward`** (accepted LOW): re-notify can
   stretch the drip (value-conserved griefing). Confirm no fund impact; advise on
   funder-gating.
5. **Upgrade authority** is the residual centralization risk (to be moved to a
   multisig pre-mainnet); confirm no other privileged path.

## Known residuals (accepted, for the auditor to weigh)

See SECURITY.md "Known residual items" + the LOW table: upgrade-authority
centralization; Token-2022 version drift; intra-slot `reward_vault_last_balance`
desync (found unreachable, re-verify); pool `admin` not following the upgrade
authority; re-notify griefing.
