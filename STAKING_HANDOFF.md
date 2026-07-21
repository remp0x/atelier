# $ATELIER Staking -- Overnight Build Handoff

Built while you slept (2026-06-29). On-chain, real-yield revenue-share staking,
per the office-hours design. Read this first.

## TL;DR

- A complete **Anchor (Solana) staking program** + TypeScript client SDK +
  reward-funding cron + a full `/stake` frontend + tests + docs.
- **Verified end to end:** the program builds to BPF, deploys to a local
  validator, and **all 10 Anchor tests pass** (+ 8 `math.rs` unit tests via
  `cargo test`). Host `cargo check` is clean. The entire web app passes
  `tsc --noEmit` (zero errors). The hand-rolled client SDK was checked against the
  regenerated IDL byte-for-byte -- instruction + account discriminators AND every
  builder's account order/signer/writable flags match (the Anchor tests use
  `accountsPartial`, so this closes the SDK gap).
- **Security-reviewed three times + one external audit (2026-06-29):** internal
  passes fixed the init front-run (MED-1, upgrade-authority gate), the reward-mint
  extension check (LOW-1), and a **HIGH** lump-distribution flaw (fixed by the
  Synthetix-style linear drip + CEI ordering). An external automated audit
  (Codex) then found a **u128 accumulator-overflow (P1, High-class)** that could
  permanently cap future stake sizes -- fixed with a 256-bit `mul_div_floor`
  (`math.rs`, unit-tested); **re-notify griefing (P2)** -- fixed by gating
  `crank_sync` to a `pool.funder`; and an **unenforced minimum drip duration
  (P3)** -- now enforced on-chain (`MIN_REWARD_DURATION_SECS = 60`) + a 1-day
  tooling floor. Full findings + resolutions in `solana/SECURITY.md`.
- **Heads-up -- reward semantics changed by the HIGH fix:** rewards no longer
  become claimable in full right after a crank; they drip linearly over
  `reward_duration` (set at init, e.g. 7 days). This is required to defeat the
  JIT exploit, but it changes the UX from the original "claim anytime, instant"
  framing -- confirm the drip window is what you want.
- **NOT done (the real gates):** the program is **not deployed to devnet/mainnet
  and not audited.** Do not put real funds in it until a professional audit. See
  `solana/DEPLOY_AUDIT_RUNBOOK.md`.

## IMPORTANT: I did not touch your other work

You're on branch `release-npm-useatelier-domain` with unrelated uncommitted WIP
(agent-defi / earn / `atelier-db.ts` / banners / docs). I committed **only the
staking files** to a new branch `staking`, staging explicit paths. Your WIP is
untouched and still uncommitted in the working tree. Nothing was pushed.

## What was decided (recap)

Real-yield (USDC from platform fees), non-custodial on-chain program, clean-room
Anchor build (the only audited candidate is BUSL-licensed; nothing audited
supports Token-2022), 4 moderate tiers (15d 1x / 30d 2x / 60d 4x / 180d 8x),
continuous accrual, claim anytime. Full rationale in `STAKING_SPEC.md`.

## State

| Piece | State |
|---|---|
| Anchor program (`solana/`) | Builds to BPF; `cargo check` clean. |
| On-chain tests (`solana/tests`) | **8/8 passing** on a local validator. |
| Security self-review | `solana/SECURITY.md` -- full vuln taxonomy mapped. |
| Client SDK + config | `src/lib/staking-{program,config}.ts` -- tsc clean; discriminators + account metas verified against IDL. |
| Reward funding cron | `src/lib/staking-rewards.ts` + `/api/cron/staking-rewards`; in `vercel.json`. |
| Stats read model | `/api/staking/stats` -- tsc clean. |
| Frontend `/stake` | Full page; Privy embedded-wallet signing; sidebar link. tsc clean. |
| Generated IDL | committed at `solana/idl/atelier_staking.json`. |
| Deploy / audit | **Not done.** Gated -- see runbook. |

## What the 10 tests prove

init with 4 tiers; a sole zero-duration staker collects ~all funded USDC after the
drip; rewards split correctly by weighted stake (1x vs 8x across tiers); rewards
**drip over time, not instantly** (the JIT/monopoly-resistance test); locked
positions cannot unstake early; zero-duration positions unstake immediately; a
Token-2022 mint carrying a transfer-fee extension is rejected at pool init; an
init attempt by a wallet that is not the program upgrade authority is rejected
(the MED-1 front-run fix); a reward duration below the on-chain minimum is
rejected (P3); and a `crank_sync` by a non-funder is rejected (P2). Plus 7
`math.rs` unit tests for the 256-bit `mul_div_floor` (P1).

## Build note

The SBF toolchain here caps at Rust 1.84, so a handful of modern deps that
declare `edition2024` are pinned in the committed `Cargo.lock` and the build uses
`--tools-version v1.50` with a separate host-side IDL step. Exact recipe in the
runbook ("Build status"). On a toolchain with Rust >= 1.85 a plain `anchor build`
works with no pins.

## Next steps (your call, in order)

1. `git checkout staking` and review the diff.
2. Set `NEXT_PUBLIC_STAKING_PROGRAM_ID` (program id this build:
   `5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq`; back up the keypair under
   `target/deploy/` to keep it stable, or generate a fresh one).
3. ~~Devnet deploy + manual end-to-end~~ **DONE (2026-06-29; re-done with 4
   tiers 2026-07-20).** Deployed to devnet (program
   `5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq`, authority
   `DqCZ7r6cxediYCRZoKTCPuusSzrpnsBwRe6HZZJ1HbkN`). The 2026-07-20 pass
   upgraded the deployed program to the 4-tier build (after a fresh local
   10/10 + 8 math-test run) and re-ran the full flow on a fresh 4-tier pool
   via `solana/migrations/devnet-e2e.ts`: init -> stake 1,000,000 -> fund
   500,000 + crank -> partial claim **108,333** mid-drip (linear drip
   verified live) -> full claim **499,999** (minus 1 dust unit,
   vault-favoring) after the 60s window -> unstake, principal 1,000,000 back
   1:1. (runbook s.3)
4. ~~Confirm the $ATELIER mint carries no blocklisted Token-2022 extension~~
   **DONE (2026-06-29):** it is a Token-2022 mint with only metadata extensions
   (authorities disabled, mint/freeze revoked) -- passes `assert_safe_mint`.
   Re-verify before mainnet in case the mint changes. (runbook s.4.2)
5. ~~Get a professional audit before mainnet~~ **DONE (user-confirmed
   2026-07-20)**, and ~~mainnet deploy~~ **DONE (2026-07-20)**: program live on
   mainnet-beta, validated with a throwaway-test-pool e2e, real pool
   `H4XFUj2kSVq5r48LAbJtaS5BVBzCVMS5S2z8GPSPFknm` ($ATELIER/USDC, 15/30/60/180d
   tiers, 7d drip, funder = treasury) initialized + live smoke-tested (1,000
   $ATELIER staked, 1 USDC tranche, 300 micro-USDC claimed on the drip line).
   Runbook s.5 has txids. **2026-07-21 v2 revision shipped post-audit:**
   rewards switched to SOL (wSOL vault, claims auto-unwrap), tiers now
   15d 1x / 30d 4x / 60d 10x / 180d 20x, pool PDA gained a `pool_id` seed,
   /stake supports external wallets. Live pool
   `F4mnn2WiHNMpWU8Y6hE8LasroS1MbskQLRbLCfynPgaa` (pool_id 1); the v1 USDC
   pool is retired (runbook s.5). **Still open: move the upgrade authority to
   a multisig** (`solana program set-upgrade-authority`). Vercel env
   `NEXT_PUBLIC_STAKING_PROGRAM_ID` is set; `/stake` goes live when this
   branch deploys.
6. ~~Wire the cron's revenue tally to the real fee ledger~~ **DONE (2026-06-29):**
   the feed is **50% of pump.fun creator fees (SOL)**. `getEpochRevenueMicroUsdc()`
   reads the cumulative creator-fee lamports (`fee-indexer.ts`), takes the delta
   since the last funded run (cursor in `staking_revenue_cursor`), converts to USDC
   at the live SOL price, and applies `STAKING_REWARD_SHARE_BPS` (default 5000 =
   50%). No backlog dump (first run sets a baseline), carry-over on skip, rounds in
   the vault's favor. Still set `STAKING_*` env vars + keep treasury USDC topped up
   (runbook s.6-7).

## Open design choice -- RESOLVED

Revenue source decided: **50% of creator fees (SOL)**, wired into the cron (see
step 6). The cron stays safe-by-default: the first run only establishes the
cursor baseline (distributes nothing), and it no-ops (green) when there is no new
revenue, no stake, or insufficient treasury USDC. Fees accrue in SOL but pay out
in USDC, so keep the treasury wallet funded with USDC.
