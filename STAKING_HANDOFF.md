# $ATELIER Staking -- Overnight Build Handoff

Built while you slept (2026-06-29). On-chain, real-yield revenue-share staking,
per the office-hours design. Read this first.

## TL;DR

- A complete **Anchor (Solana) staking program** + TypeScript client SDK +
  reward-funding cron + a full `/stake` frontend + tests + docs.
- **Verified end to end:** the program builds to BPF, deploys to a local
  validator, and **all 8 Anchor tests pass**. Host `cargo check` is clean. The
  entire web app passes `tsc --noEmit` (zero errors). The hand-rolled client SDK
  was checked against the regenerated IDL byte-for-byte -- instruction +
  account discriminators AND every builder's account order/signer/writable flags
  match (the Anchor tests use `accountsPartial`, so this closes the SDK gap).
- **Security-reviewed twice (2026-06-29):** the first pass fixed the init
  front-run (MED-1, upgrade-authority gate) and added the reward-mint extension
  check (LOW-1). The **second pass caught a HIGH** issue the first missed: the
  original lump reward distribution let a JIT/monopoly staker scoop a funding
  tranche. Fixed by switching to a **Synthetix-style linear reward drip**
  (rewards now vest over a `reward_duration` window) plus checks-effects-
  interactions ordering. Full findings + resolutions in `solana/SECURITY.md`.
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
supports Token-2022), 3 moderate tiers (flexible 1x / 90d 4x / 180d 8x),
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

## What the 8 tests prove

init with 3 tiers; a sole flexible staker collects ~all funded USDC after the
drip; rewards split correctly by weighted stake (1x vs 8x across tiers); rewards
**drip over time, not instantly** (the JIT/monopoly-resistance test); locked
positions cannot unstake early; flexible positions unstake immediately; a
Token-2022 mint carrying a transfer-fee extension is rejected at pool init; and
an init attempt by a wallet that is not the program upgrade authority is rejected
(the MED-1 front-run fix).

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
3. ~~Devnet deploy + manual end-to-end~~ **DONE (2026-06-29).** Deployed to
   devnet (program `5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq`, authority
   `DqCZ7r6cxediYCRZoKTCPuusSzrpnsBwRe6HZZJ1HbkN`) and ran the full flow against
   the real cluster: init -> stake 1,000,000 -> fund 500,000 + crank -> drip 30s
   -> claim **499,999** (full minus 1 dust unit, vault-favoring) -> unstake,
   principal 1,000,000 back. The drip, claim, and 1:1 principal all verified
   on-chain. (runbook s.3)
4. ~~Confirm the $ATELIER mint carries no blocklisted Token-2022 extension~~
   **DONE (2026-06-29):** it is a Token-2022 mint with only metadata extensions
   (authorities disabled, mint/freeze revoked) -- passes `assert_safe_mint`.
   Re-verify before mainnet in case the mint changes. (runbook s.4.2)
5. **Get a professional audit** before mainnet; move the program upgrade
   authority to a multisig.
6. Wire the cron's revenue tally to the real fee ledger (TODO in
   `staking-rewards.ts`); set `STAKING_*` env vars (runbook s.6).

## Open design choice still on the table

You haven't funded a rewards source yet. The cron is safe-by-default: with no
`STAKING_EPOCH_USDC` / revenue wiring it no-ops (distributes nothing) rather than
guessing. Decide the staker share (default 20%) and the revenue feed when ready.
