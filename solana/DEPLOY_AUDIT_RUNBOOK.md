# atelier-staking -- Deploy & Audit Runbook

Ordered path from source to mainnet. **Do not skip the audit gate.** This
program custodies user funds.

## 0. Toolchain (installed 2026-06-29 on this machine)

- rustc 1.96 (via rustup) + Solana SBF toolchain
- solana-cli 4.0.2 (Agave)
- anchor-cli 0.31.1 (via `avm use 0.31.1`) -- must match `@coral-xyz/anchor`
  0.31.1 in the web app, or the generated IDL won't deserialize client-side.

## Build status (2026-06-29) -- BUILDS + TESTS PASS

The program compiles to BPF, deploys to a local validator, and **all 8 Anchor
tests pass** (init, sole-staker rewards after the drip, weighted reward split,
the drip/JIT-resistance test, lock enforcement, flexible unstake, Token-2022
unsafe-extension rejection, and init-rejection for a non-upgrade-authority). Host
`cargo check` is also clean. Two independent security reviews (2026-06-29) -- the
second found a HIGH lump-distribution flaw, fixed by a Synthetix-style reward
drip -- are recorded in `SECURITY.md`.

The SBF toolchain in this environment caps at Rust 1.84, so a few modern deps
that declare `edition2024` are pinned down in the committed `Cargo.lock`:
`proc-macro-crate 3.1.0`, `blake3 1.5.5`, `indexmap 2.7.1`, `zeroize 1.8.1`,
`zeroize_derive 1.4.2`, `unicode-segmentation 1.12.0`. Working recipe:

```bash
# 1. build the .so (skip the IDL step -- it is host-side and rejects --tools-version)
anchor build --no-idl -- --tools-version v1.50
# (declare_id already matches the keypair; `anchor keys sync` is a no-op here)
# 2. build the IDL + TS types on the host toolchain (rustc 1.96 handles edition2024)
anchor idl build -o target/idl/atelier_staking.json --out-ts target/types/atelier_staking.ts
cp target/idl/atelier_staking.json idl/atelier_staking.json
# 3. run the suite -- deploy explicitly so the provider wallet is the upgrade
#    authority (see note below); `anchor test` does NOT arrange this.
solana-test-validator --reset --quiet &            # wait until it answers RPC
solana airdrop 100 ~/.config/solana/id.json --url localhost
anchor deploy --provider.cluster localnet          # authority = provider wallet
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json \
  yarn run ts-mocha -p ./tsconfig.json -t 1000000 'tests/**/*.ts'
```

Why not `anchor test`? `initialize_pool` is now gated to the program upgrade
authority. `anchor test` loads the program into its validator with an upgrade
authority that is NOT the provider wallet, so every pool init would fail
`Unauthorized`. Deploying explicitly with `anchor deploy` sets the upgrade
authority to the provider wallet, which the tests use as `admin`.

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
solana airdrop 3                       # deploy needs ~3 SOL (432 KB program)
anchor deploy --provider.cluster devnet
```

**Done on devnet (2026-06-29).** Once the wallet was funded via the web faucet,
the program deployed cleanly (program `5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq`,
authority `DqCZ7r6cxediYCRZoKTCPuusSzrpnsBwRe6HZZJ1HbkN`, ProgramData
`35479Cpwaf6MCASVsQaWZDHYVk8yeHNxrrSugboPnTyv`) and the full flow ran end to end
against the live cluster (init -> stake -> fund + crank -> 30s drip -> claim
499,999 of 500,000 -> unstake 1:1). The earlier blocker was only the public
faucet rate-limiting the build host's IP; fund the deploy wallet
(`solana address`) with ~3 devnet SOL from https://faucet.solana.com if
`solana airdrop` is refused.

**Init now requires the upgrade authority.** `initialize_pool` is gated: the
signer (`admin`) must be the program's upgrade authority, and the call must pass
two extra accounts -- `program` (the program id) and `program_data` (the
ProgramData PDA = `findProgramAddress([programId], BPFLoaderUpgradeable)`). On
devnet/mainnet the deploying wallet is the upgrade authority, so initialize from
that wallet. Initialize a pool against a **devnet test mint** (do not use the
mainnet $ATELIER mint on devnet). `initialize_pool` takes `(tiers,
reward_duration_secs)`. Tiers (flexible 1x / 90d 4x / 180d 8x) are
`[{duration_secs, multiplier_bps}]`:
`[{0, 10000}, {7776000, 40000}, {15552000, 80000}]`, and `reward_duration_secs`
is the linear-drip window (production: e.g. `604800` = 7 days; keep it >> slot
time and ideally >= the funding cadence, or the JIT vector reopens). The init
call also passes `program` + `program_data` (the upgrade-authority gate, s.4.2).

Use the helper script (tested end-to-end on a local validator) -- it derives all
PDAs incl. `program_data`, auto-detects each mint's token program, verifies your
wallet is the upgrade authority, and is idempotent:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json \
  STAKED_MINT=<devnet test mint> REWARD_MINT=<devnet usdc> REWARD_DURATION_SECS=604800 \
  yarn init-pool          # solana/migrations/initialize-pool.ts; TIERS_JSON to override tiers
```

Exercise stake -> fund (transfer USDC to the reward vault) -> `crank_sync` ->
claim -> unstake end to end with the web app pointed at devnet.

## 4. Pre-mainnet checks (BLOCKING)

1. **Professional audit complete** and findings resolved. Hand the auditor:
   `solana/programs/atelier-staking/src`, `SECURITY.md` (esp. "Known residual
   items"), and this runbook.
2. **$ATELIER mint extension check -- CONFIRMED PASSING (2026-06-29).**
   `spl-token display 7newJUjH7LGsGPDfEq83gxxy2d1q39A84SeUKha8pump` shows it is a
   Token-2022 mint whose only extensions are `MetadataPointer` + `TokenMetadata`
   (both update authorities Disabled), with mint and freeze authority unset
   (revoked). None are on the blocklist (TransferFee, TransferHook,
   PermanentDelegate, ConfidentialTransfer, DefaultAccountState, NonTransferable,
   MintCloseAuthority), so `assert_safe_mint` accepts it. Re-verify before
   mainnet init in case the mint changes.
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

Initialize the real pool: `admin` **must be the program upgrade authority** (the
deploying wallet), and the call passes `program` + `program_data` (see s.3).
staked_mint = $ATELIER, reward_mint = USDC
(`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), tiers as above, and
`reward_duration_secs` (e.g. `604800` = 7 days) -- via `yarn init-pool` (s.3),
run from the wallet that holds the upgrade authority.

Ordering matters with the init gate: **initialize the pool while you still hold
the upgrade authority, before** moving it to the multisig (s.4.3) or making the
program immutable. An immutable program has no upgrade authority, which makes
`initialize_pool` permanently uncallable. If you move the authority to a multisig
first, the multisig must sign the init.

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

## Outstanding integration TODO (a decision, not just code)

Wiring `getEpochRevenueMicroUsdc()` in `staking-rewards.ts` to a live feed needs
two product decisions first -- it directly controls how much USDC is distributed,
so it is deliberately left manual (set `STAKING_EPOCH_REVENUE_USDC` or the
`STAKING_EPOCH_USDC` budget override) until decided:

1. **Which revenue stream funds staking.** The existing `fee-indexer.ts`
   (`getTotalIndexedWithdrawals`) tracks pump.fun creator-fee income in **lamports
   (SOL)** and is **cumulative all-time**. Order platform fees are in
   `service_orders.platform_fee_usd` (**USD**). Pick the stream(s).
2. **Denomination + windowing.** Rewards pay USDC; a SOL stream needs a SOL->USDC
   rate, and "epoch revenue" must be the **delta** over the window (cumulative-now
   minus cumulative-at-last-run; `staking_reward_funding.revenue_micro_usdc`
   already records per-run revenue to support this).

Also decide the staker share `STAKING_REWARD_SHARE_BPS` (default 2000 = 20%).
