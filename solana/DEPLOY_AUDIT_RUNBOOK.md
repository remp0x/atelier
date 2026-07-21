# atelier-staking -- Deploy & Audit Runbook

Ordered path from source to mainnet. **Do not skip the audit gate.** This
program custodies user funds.

## 0. Toolchain (installed 2026-06-29 on this machine)

- rustc 1.96 (via rustup) + Solana SBF toolchain
- solana-cli 4.0.2 (Agave)
- anchor-cli 0.31.1 (via `avm use 0.31.1`) -- must match `@coral-xyz/anchor`
  0.31.1 in the web app, or the generated IDL won't deserialize client-side.

## Build status (2026-06-29) -- BUILDS + TESTS PASS

The program compiles to BPF, deploys to a local validator, and **all 10 Anchor
tests pass** (init, sole-staker rewards after the drip, weighted reward split,
the drip/JIT-resistance test, lock enforcement, zero-duration unstake, Token-2022
unsafe-extension rejection, init-rejection for a non-upgrade-authority, plus the
two external-audit additions: sub-minimum-duration rejection and non-funder crank
rejection), and **8 `math.rs` unit tests** pass under `cargo test`. Host
`cargo check` is also clean. Three internal reviews + one external automated audit
(Codex), 2026-06-29 -- which found a u128 accumulator-overflow (P1, fixed with
256-bit math), re-notify griefing (P2, fixed with a funder gate), and an
unenforced minimum drip duration (P3, now enforced) -- are recorded in
`SECURITY.md`.

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

**Done on devnet (2026-06-29; re-verified with 4 tiers 2026-07-20).** The
program deployed cleanly (program `5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq`,
authority `DqCZ7r6cxediYCRZoKTCPuusSzrpnsBwRe6HZZJ1HbkN`, ProgramData
`35479Cpwaf6MCASVsQaWZDHYVk8yeHNxrrSugboPnTyv`) and the full flow ran end to end
against the live cluster. The 2026-07-20 run upgraded the deployed program to the
4-tier build (local suite 10/10 + 8 `math.rs` tests re-run first) and exercised a
**fresh 4-tier pool** (`EdPRn8ELLAY7N8eDHUX8L8Qpqawu4Brn9xmKWb5PdzG1`) via
`migrations/devnet-e2e.ts`: init (4 tiers, 60s drip) -> stake 1,000,000 ->
fund 500,000 + crank -> partial claim mid-drip 108,333 (linear drip confirmed
on-cluster) -> full claim 499,999 of 500,000 after `period_finish` -> unstake
1:1. The e2e pool zeroes tier 0's duration (same fixture as the test suite) so
unstake is exercisable; production init keeps 15d. Rerun anytime with:
`ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json
yarn ts-node migrations/devnet-e2e.ts` (creates fresh mints + pool each run). If
`solana airdrop` is refused, fund the deploy wallet (`solana address`) with ~3
devnet SOL from https://faucet.solana.com.

**Init now requires the upgrade authority.** `initialize_pool` is gated: the
signer (`admin`) must be the program's upgrade authority, and the call must pass
two extra accounts -- `program` (the program id) and `program_data` (the
ProgramData PDA = `findProgramAddress([programId], BPFLoaderUpgradeable)`). On
devnet/mainnet the deploying wallet is the upgrade authority, so initialize from
that wallet. Initialize a pool against a **devnet test mint** (do not use the
mainnet $ATELIER mint on devnet). NOTE: the external-audit fixes (2026-06-30)
added a `funder` field to `StakePool`, changing its byte layout, so any devnet
pool created before that commit is stale -- re-deploy + re-init a fresh pool
before re-testing (mainnet was never affected). `initialize_pool` takes `(tiers,
reward_duration_secs, funder)`. Tiers (15d 1x / 30d 2x / 60d 4x / 180d 8x) are
`[{duration_secs, multiplier_bps}]`:
`[{1296000, 10000}, {2592000, 20000}, {5184000, 40000}, {15552000, 80000}]`;
`reward_duration_secs`
is the linear-drip window (production: e.g. `604800` = 7 days; on-chain floor is
60s and the tooling refuses < 1 day, since a short window reopens the JIT
vector); and `funder` is the **only wallet allowed to `crank_sync` (fund a reward
tranche)** -- set it to the backend funding wallet (`ATELIER_PRIVATE_KEY`'s
pubkey), which the reward cron signs with. The init call also passes `program` +
`program_data` (the upgrade-authority gate, s.4.2).

Use the helper script (tested end-to-end on a local validator) -- it derives all
PDAs incl. `program_data`, auto-detects each mint's token program, verifies your
wallet is the upgrade authority, defaults `funder` to the admin wallet, and is
idempotent:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json \
  STAKED_MINT=<devnet test mint> REWARD_MINT=<devnet usdc> REWARD_DURATION_SECS=604800 \
  FUNDER=<treasury/cron wallet pubkey> \
  yarn init-pool          # solana/migrations/initialize-pool.ts; TIERS_JSON to override tiers
# devnet/test only: ALLOW_UNSAFE_DURATION=1 to permit a sub-1-day window.
```

The `funder` must equal the reward cron's signer (`ATELIER_PRIVATE_KEY`); if they
differ, every crank reverts `Unauthorized` and the cron skips (green) with a
"not the pool funder" reason. Exercise stake -> fund (transfer USDC to the reward
vault) -> `crank_sync` (signed by the funder) -> claim -> unstake end to end with
the web app pointed at devnet.

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

**V2 (SOL rewards, pool_id) DONE (2026-07-21).** After the user-confirmed
professional audit, the pool_id + SOL-rewards revision shipped: extended the
program account by 10,240 bytes (`solana program extend`; the new binary
outgrew the original allocation), upgraded the program in place, retired the
v1 USDC pool via `migrations/retire-v1-claim.ts` (verified the treasury held
the ONLY v1 position, recovered 117,295 micro-USDC of vested drip; the 1,000
$ATELIER principal + ~0.88 USDC unvested remainder are written off, rescuable
later via a targeted upgrade while the upgrade authority is ours), validated
with a throwaway mainnet e2e (pool `7PeWi...`, wSOL rewards, wrap-funding
path, partial 141,666 -> full 499,999 -> unstake 1:1), then initialized the
live pool **`F4mnn2WiHNMpWU8Y6hE8LasroS1MbskQLRbLCfynPgaa`** (pool_id 1,
staked $ATELIER, reward wSOL `So111...112`, tiers 15d 1x / 30d 4x / 60d 10x /
180d 20x, drip 604800s, funder = treasury) and smoke-tested it live: stake
1,000 $ATELIER -> wrap 0.01 SOL + crank (rate 1.653e19, period_finish +7d) ->
claim 3,009 lamports at ~182s (exactly linear) with wSOL auto-unwrap verified.
Devnet runs the same build (extend + upgrade + full e2e PASS 2026-07-21).

**V1 (USDC rewards) DONE (2026-07-20).** Deployed to mainnet-beta (program
`5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq`, authority + pool admin
`DqCZ7r6cxediYCRZoKTCPuusSzrpnsBwRe6HZZJ1HbkN`, ProgramData
`35479Cpwaf6MCASVsQaWZDHYVk8yeHNxrrSugboPnTyv`, ~3.055 SOL rent) via
`solana program deploy` over the Helius RPC (`--use-rpc
--with-compute-unit-price 2000`; the public RPC rate-limits deploys). Validated
with a full e2e on a **throwaway mainnet test pool**
(`7J1HF5UWjsDPZNVBFZG6oUPdmmkafLQGydUSEGPbAZVP`, fresh test mints,
`migrations/devnet-e2e.ts`): partial drip 108,333 -> full claim 499,999 ->
unstake 1:1 -- identical to the devnet run. Then initialized the **real pool
`H4XFUj2kSVq5r48LAbJtaS5BVBzCVMS5S2z8GPSPFknm`** ($ATELIER/USDC, production
tiers 15d/30d/60d/180d, drip 604800s, funder = treasury
`EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb`, init tx `5WX1W3w5...EEHkkN`)
and smoke-tested it live (`migrations/mainnet-smoke.ts`): treasury staked 1,000
$ATELIER (tier 0, locked to ~2026-08-04), funded 1 USDC + crank, claimed 300
micro-USDC after 181s -- exactly on the linear-drip line. Deploy wallet keeps
~0.118 SOL for admin ops; the rest was swept back to the treasury.

```bash
solana config set --url mainnet-beta
anchor deploy --provider.cluster mainnet
```

Initialize the real pool: `admin` **must be the program upgrade authority** (the
deploying wallet), and the call passes `program` + `program_data` (see s.3).
staked_mint = $ATELIER, reward_mint = USDC
(`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), tiers as above,
`reward_duration_secs` (e.g. `604800` = 7 days), and `FUNDER` = the reward cron's
wallet (`ATELIER_PRIVATE_KEY`'s pubkey; only this wallet can fund/crank) -- via
`yarn init-pool` (s.3), run from the wallet that holds the upgrade authority.

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
| `STAKING_REWARD_SHARE_BPS` | Staker share of creator-fee revenue. **Default 5000 (50%)** -- the decided value; set only to change it. |
| `STAKING_EPOCH_USDC` | Optional explicit per-run budget override (bootstrap); bypasses the feed entirely. |
| `STAKING_EPOCH_REVENUE_USDC` | Optional manual revenue input (already-USDC); overrides the creator-fee feed for testing/bootstrap. |

## 7. Funding operations

The Monday cron (`0 0 * * 1`) calls `fundStakingRewards()`:
transfers the staker share of revenue (USDC) from the treasury into the reward
vault, then cranks the accumulator. `crank_sync` is gated to `pool.funder`, so the
cron's signer (`ATELIER_PRIVATE_KEY`) **must be the funder set at init** -- it
also pre-checks this and skips (green) with a clear reason if the pool's funder
differs. It is idempotent within ~6 days and no-ops (green) when the budget is
zero or the treasury is short. To smooth reward-timing incentives you can split
the weekly budget into several smaller cron runs.

**Revenue feed (WIRED 2026-06-29): 50% of pump.fun creator fees (SOL).**
`getEpochRevenueMicroUsdc()` reads the cumulative creator-fee lamports indexed by
`fee-indexer.ts` (`getTotalIndexedWithdrawals`), takes the **delta** since the last
funded run (a lamports cursor in `staking_revenue_cursor`), converts it to USDC at
the current SOL price (`sol-price.ts`), and `STAKING_REWARD_SHARE_BPS` (default
**5000 = 50%**) is applied to that. Properties:

- **No backlog dump.** The first cron run sets the cursor baseline to the current
  cumulative and distributes nothing; accrual starts from launch.
- **Carry-over.** The cursor advances only on a successful fund, so revenue earned
  while the pool is empty, the treasury is short on USDC, or the SOL price is
  briefly unavailable rolls into the next epoch rather than being lost.
- **Rounding floors in the vault's favor.**
- **Treasury must hold USDC.** Fees are earned in SOL but paid to stakers in USDC,
  so the treasury (`ATELIER_PRIVATE_KEY`) needs a USDC balance >= the budget; the
  cron skips (green) if short. Keep it topped up (e.g. periodically swap a slice of
  creator-fee SOL to USDC).

**Prerequisite:** the creator-fee indexer must be running so the feed has data
(it populates `creator_fee_index`; the staking cursor reads its cumulative sum).
For testing/bootstrap, `STAKING_EPOCH_REVENUE_USDC` (manual USDC revenue) or
`STAKING_EPOCH_USDC` (explicit budget) override the feed.
