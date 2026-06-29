# atelier-staking -- Deploy & Audit Runbook

Ordered path from source to mainnet. **Do not skip the audit gate.** This
program custodies user funds.

## 0. Toolchain (installed 2026-06-29 on this machine)

- rustc 1.96 (via rustup) + Solana SBF toolchain
- solana-cli 4.0.2 (Agave)
- anchor-cli 0.31.1 (via `avm use 0.31.1`) -- must match `@coral-xyz/anchor`
  0.31.1 in the web app, or the generated IDL won't deserialize client-side.

## Build status (2026-06-29) -- BUILDS + TESTS PASS

The program compiles to BPF, deploys to a local validator, and **all 6 Anchor
tests pass** (init, sole-staker rewards, weighted reward split across tiers, lock
enforcement, flexible unstake, Token-2022 unsafe-extension rejection). Host
`cargo check` is also clean.

The SBF toolchain in this environment caps at Rust 1.84, so a few modern deps
that declare `edition2024` are pinned down in the committed `Cargo.lock`:
`proc-macro-crate 3.1.0`, `blake3 1.5.5`, `indexmap 2.7.1`, `zeroize 1.8.1`,
`zeroize_derive 1.4.2`, `unicode-segmentation 1.12.0`. Working recipe:

```bash
# 1. build the .so (skip the IDL step -- it is host-side and rejects --tools-version)
anchor build --no-idl -- --tools-version v1.50
anchor keys sync                                  # sync declared id to the keypair
anchor build --no-idl -- --tools-version v1.50    # rebuild so the .so embeds the id
# 2. build the IDL on the host toolchain (rustc 1.96 handles edition2024)
anchor idl build -o target/idl/atelier_staking.json
# 3. run the suite against a local validator using the prebuilt .so
anchor test --skip-build
```

Cleaner long-term: install platform-tools with Rust >= 1.85 and a plain
`anchor build` works with no pins. The canonical IDL is committed at
`solana/idl/atelier_staking.json`; the hand-rolled client SDK uses the same
discriminators (verified byte-for-byte), so copying it into the app is optional.

Program id (this build): `5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq`. The
keypair is at `target/deploy/atelier_staking-keypair.json` (gitignored) -- back
it up to keep the id stable across deploys, or generate a fresh one.

## 1. Build + sync program id

```bash
cd solana
anchor build                 # compiles the program, generates IDL + types
anchor keys sync             # writes the real program id into lib.rs + Anchor.toml
anchor build                 # rebuild so the binary embeds the synced id
```

`anchor keys sync` replaces the placeholder id
(`Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS`) in `declare_id!` and
`Anchor.toml` with the keypair under `target/deploy/atelier_staking-keypair.json`.

Then propagate the id to the web app:
- `src/lib/staking-config.ts` reads `NEXT_PUBLIC_STAKING_PROGRAM_ID` -- set it.
- Copy the IDL + types into the app: `target/idl/atelier_staking.json` and
  `target/types/atelier_staking.ts` -> `src/lib/idl/`.

## 2. Local test

```bash
cd solana
anchor test                  # spins a local validator, runs tests/atelier-staking.ts
```

Tests cover: tier weights, multi-staker pro-rata distribution, lock-expiry
enforcement, claim accounting, empty-pool guard, unsafe-extension rejection.

## 3. Devnet

```bash
solana config set --url devnet
solana airdrop 2
anchor deploy --provider.cluster devnet
```

Initialize a pool against a **devnet test mint** (do not use the mainnet
$ATELIER mint on devnet). Tiers (flexible 1x / 90d 4x / 180d 8x) are passed as
`[{duration_secs, multiplier_bps}]`:
`[{0, 10000}, {7776000, 40000}, {15552000, 80000}]`.

Exercise stake -> fund (transfer USDC to the reward vault) -> `crank_sync` ->
claim -> unstake end to end with the web app pointed at devnet.

## 4. Pre-mainnet checks (BLOCKING)

1. **Professional audit complete** and findings resolved. Hand the auditor:
   `solana/programs/atelier-staking/src`, `SECURITY.md` (esp. "Known residual
   items"), and this runbook.
2. **$ATELIER mint extension check.** Confirm the mainnet $ATELIER mint
   (`7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump`) carries NO blocklisted
   Token-2022 extension (TransferFee, TransferHook, PermanentDelegate,
   ConfidentialTransfer, DefaultAccountState, NonTransferable, MintCloseAuthority).
   If it does, `initialize_pool` will reject it and the design needs revisiting.
   Check: `spl-token display 7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump`.
3. **Upgrade authority secured.** Move it to a Squads multisig (or set the
   program immutable post-audit):
   `solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <MULTISIG>`.
   Until this is done, the program is effectively trusted.
4. **Verifiable build** published so the deployed bytecode matches source
   (`solana-verify`).

## 5. Mainnet deploy + init

```bash
solana config set --url mainnet-beta
anchor deploy --provider.cluster mainnet
```

Initialize the real pool: admin = the ops wallet you control, staked_mint =
$ATELIER, reward_mint = USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`),
tiers as above.

## 6. Env vars (web app / Vercel)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_STAKING_PROGRAM_ID` | Deployed program id (client + server). |
| `ATELIER_PRIVATE_KEY` | Treasury signer for the funding cron (already set; must hold USDC). |
| `CRON_SECRET` | Auth for `/api/cron/staking-rewards` (already set). |
| `STAKING_REWARD_SHARE_BPS` | Staker share of revenue, default 2000 (20%). |
| `STAKING_EPOCH_USDC` | Optional explicit per-run budget override (bootstrap). |
| `STAKING_EPOCH_REVENUE_USDC` | Temporary revenue input until the fee ledger is wired (see TODO in `staking-rewards.ts`). |

## 7. Funding operations

The Monday cron (`0 0 * * 1`) calls `fundStakingRewards()`:
transfers the staker share of revenue (USDC) from the treasury into the reward
vault, then cranks the accumulator. It is idempotent within ~6 days and no-ops
(green) when the budget is zero or the treasury is short. To smooth reward-timing
incentives you can split the weekly budget into several smaller cron runs.

## Outstanding integration TODO

- Wire `getEpochRevenueMicroUsdc()` in `staking-rewards.ts` to the live fee
  ledger (`fee-indexer.ts` / `/api/fees`) instead of the env placeholder.
