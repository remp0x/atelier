# $ATELIER Staking -- Overnight Build Handoff

Built while you slept (2026-06-29). On-chain, real-yield revenue-share staking,
per the office-hours design. Read this first.

## TL;DR

- A complete, hardened **Anchor (Solana) staking program** + TypeScript client
  SDK + reward-funding cron + a full `/stake` frontend + tests + docs.
- **Verified:** the program passes `cargo check` (full type + borrow check); the
  entire web app passes `tsc --noEmit` (zero errors).
- **NOT done (by design / blocked):** the program is **not deployed and not
  audited** -- do not put real funds in it until a paid audit (see runbook). The
  SBF `.so` artifact didn't build *in this environment* due to a toolchain
  version cap (not a code bug) -- details below.

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

## What's verified vs pending

| Piece | State |
|---|---|
| Anchor program (`solana/`) | Written; `cargo check` clean (type + borrow). |
| Security self-review | `solana/SECURITY.md` -- full vuln taxonomy mapped. |
| Client SDK + config | `src/lib/staking-program.ts`, `staking-config.ts` -- tsc clean. |
| Reward funding cron | `src/lib/staking-rewards.ts` + `/api/cron/staking-rewards` -- tsc clean, registered in `vercel.json`. |
| Stats read model | `/api/staking/stats` -- tsc clean. |
| Frontend `/stake` | Full page + dashboard/panel/positions/how-it-works; Privy embedded-wallet signing (DepositPanel pattern); sidebar link. tsc clean. |
| Anchor tests | `solana/tests/atelier-staking.ts` -- written, **unrun** (need a successful SBF build + local validator). |
| SBF `.so` + generated IDL | **Blocked on toolchain** (see below). |
| Deploy / audit | **Not done.** Gated -- see `solana/DEPLOY_AUDIT_RUNBOOK.md`. |

## The SBF build blocker (environment, not code)

`anchor build` needs the Solana SBF toolchain. The one installed here is
Cargo 1.84 (platform-tools v1.50/v1.51); several modern transitive deps now
require `edition2024` (Rust >= 1.85). So the `.so`/IDL didn't build here.
`cargo check` on the host (rustc 1.96) passes, which validates the code itself.

To produce the deployable artifact: install platform-tools with Rust >= 1.85 and
`anchor build -- --tools-version <that version>`. Full detail + the pin-based
fallback in the runbook ("Build status").

## Next steps (your call, in order)

1. `git checkout staking` and review the diff.
2. Build the `.so` on a machine/toolchain with Rust >= 1.85 (runbook s.0-1),
   then `anchor keys sync` and set `NEXT_PUBLIC_STAKING_PROGRAM_ID`.
3. `anchor test` (runs the suite on a local validator).
4. Devnet deploy + manual end-to-end (runbook s.3).
5. **Confirm the $ATELIER mint carries no blocklisted Token-2022 extension**
   (runbook s.4.2) -- if it has a transfer fee or hook, the design needs a tweak.
6. **Get a professional audit** before mainnet; secure the program upgrade
   authority behind a multisig.
7. Wire the cron's revenue tally to the real fee ledger (TODO in
   `staking-rewards.ts`); set `STAKING_*` env vars (runbook s.6).

## Open design choice still on the table

You haven't funded a rewards source yet. The cron is safe-by-default: with no
`STAKING_EPOCH_USDC` / revenue wiring it no-ops (distributes nothing) rather than
guessing. Decide the staker share (default 20%) and the revenue feed when ready.
