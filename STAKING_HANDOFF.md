# $ATELIER Staking -- Overnight Build Handoff

Built while you slept (2026-06-29). On-chain, real-yield revenue-share staking,
per the office-hours design. Read this first.

## TL;DR

- A complete **Anchor (Solana) staking program** + TypeScript client SDK +
  reward-funding cron + a full `/stake` frontend + tests + docs.
- **Verified end to end:** the program builds to BPF, deploys to a local
  validator, and **all 7 Anchor tests pass**. Host `cargo check` is clean. The
  entire web app passes `tsc --noEmit` (zero errors). The hand-rolled client SDK
  discriminators match the generated IDL byte-for-byte.
- **Security-reviewed (2026-06-29):** an independent adversarial pass found no
  Critical/High issues. The init front-run (MED-1) is fixed with an
  upgrade-authority gate; the reward-mint extension check (LOW-1) and an
  empty-pool funding guard (MED-2) were added. Full findings + resolutions in
  `solana/SECURITY.md`.
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
| On-chain tests (`solana/tests`) | **7/7 passing** on a local validator. |
| Security self-review | `solana/SECURITY.md` -- full vuln taxonomy mapped. |
| Client SDK + config | `src/lib/staking-{program,config}.ts` -- tsc clean; discriminators match IDL. |
| Reward funding cron | `src/lib/staking-rewards.ts` + `/api/cron/staking-rewards`; in `vercel.json`. |
| Stats read model | `/api/staking/stats` -- tsc clean. |
| Frontend `/stake` | Full page; Privy embedded-wallet signing; sidebar link. tsc clean. |
| Generated IDL | committed at `solana/idl/atelier_staking.json`. |
| Deploy / audit | **Not done.** Gated -- see runbook. |

## What the 7 tests prove

init with 3 tiers; a sole flexible staker collects ~all funded USDC; rewards
split correctly by weighted stake (1x vs 8x across tiers); locked positions
cannot unstake early; flexible positions unstake immediately; a Token-2022 mint
carrying a transfer-fee extension is rejected at pool init; and an init attempt
by a wallet that is not the program upgrade authority is rejected (the MED-1
front-run fix).

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
3. Devnet deploy + manual end-to-end (runbook s.3). Note: the deploy path is
   verified (clean upgradeable deploy on a local validator), but the public
   devnet faucet was rate-limiting this host on 2026-06-29, so the devnet wallet
   needs ~3 SOL funded before `anchor deploy` will succeed.
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
