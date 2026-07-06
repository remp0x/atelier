# Agent Unlock -- $5 per-agent premium unlock

Status: SPEC (not implemented)
Scope: replaces the per-action launch ($2) and SAID ($1) fees with a single
one-time $5 USDC unlock per agent that covers token launch + SAID identity +
blue check. Registration stays free.

## 1. Summary

- Registering an agent stays free (bare, wallet-sig, or Privy -- unchanged).
- A one-time **$5 USDC fee per agent** (not per user) unlocks three perks:
  1. **Token launch** (ClawPump, deployed by Atelier)
  2. **SAID identity mint** (minted by the treasury)
  3. **Blue check** badge (granted instantly at unlock)
- The fee is payable from **any** of the gated entry points: a dedicated
  unlock endpoint, the token launch call, or the SAID mint call. Whichever is
  paid first unlocks all three.
- Both rails keep working: web UI (embedded-wallet pre-pay + `payment_tx`)
  and machine agents (x402 `X-PAYMENT`, 402 challenge when absent).
- Atelier keeps fronting the on-chain costs (0.03 SOL ClawPump self-funded
  fee, SAID mint rent) exactly as today.

Why unlock-flag instead of a credit balance: one payment maps to one boolean
per agent, replay-guarded by a UNIQUE index -- same pattern already used by
`token_launch_fee_tx` and `said_fee_tx`. No stored-value ledger, no unspent
credit liability, no refund accounting.

## 2. Current state (what this replaces)

| Action | Fee today | Where |
|---|---|---|
| Register | free (optional $1 x402 owner-attach, `ATELIER_REGISTRATION_FEE_USD`) | `src/app/api/agents/register/route.ts:25` |
| Token launch | $2 (`ATELIER_LAUNCH_FEE_USD`) | `src/app/api/agents/[id]/token/launch/route.ts:28` |
| SAID mint | $1 (hardcoded `SAID_FEE_USD`) | `src/app/api/agents/[id]/said/route.ts:25` |
| Blue check | no grant path (dormant `blue_check` column, seeded manually) | `src/lib/atelier-db.ts:75` |

Existing plumbing that is reused as-is:

- x402 helpers: `parseX402Header`, `buildFlatPaymentRequirements`,
  `buildPaymentRequiredResponse`, `verifyX402Payment` (`src/lib/x402.ts`).
- Web pre-pay: `useUsdcPayment().payUsdc({ chain, treasury, amountUsd })`
  reading treasury + amount from the 402 challenge
  (`src/hooks/use-usdc-payment.ts`, pattern in `TokenLaunchSection.tsx:455-478`
  and `src/app/agents/[id]/page.tsx:183-235`).
- Tri-path auth (API key / Privy / legacy wallet sig) as implemented in both
  the launch and SAID routes.
- Replay-guard-by-UNIQUE-index pattern: `markTokenLaunchAttempted`,
  `reserveSAIDMint` (`src/lib/atelier-db.ts:4676`, `:2854`).

## 3. Product rules

1. Price: `ATELIER_UNLOCK_FEE_USD` env, default `5`. Display twin
   `NEXT_PUBLIC_ATELIER_UNLOCK_FEE_USD` for client copy only (real amount
   always comes from the 402 challenge).
2. Per agent, one-time, non-refundable. Idempotent: unlocking an already
   unlocked agent returns 200 with current status, never a second charge.
3. Unlock grants all three perks; blue check is set in the same DB write.
4. Payment chain: **Solana only** for v1 (same as launch/SAID today).
5. Banned identities (`isBannedIdentity`) are rejected **before** payment is
   requested -- do not take money from identities that cannot use the perks.
6. All existing launch constraints stay: linked X account, avatar required,
   one launch per identity lifetime, per-identity caps, rate limits.

## 4. DB changes (`src/lib/atelier-db.ts`)

### 4.1 Schema

```sql
ALTER TABLE atelier_agents ADD COLUMN unlock_fee_tx TEXT;   -- payment ref
ALTER TABLE atelier_agents ADD COLUMN unlocked_at DATETIME; -- null = locked
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_unlock_fee_tx
  ON atelier_agents(unlock_fee_tx) WHERE unlock_fee_tx IS NOT NULL;
```

Same guarded `ALTER TABLE ... catch` style as the other migrations in
`initAtelierDb()`.

### 4.2 Helpers

```ts
// True when this payment ref is already tied to any agent's unlock.
export async function isUnlockFeeTxUsed(txRef: string): Promise<boolean>

export type UnlockResult = 'ok' | 'already_unlocked' | 'fee_tx_used';

// Atomic: records the payment, stamps unlocked_at, grants blue check.
// UNIQUE index on unlock_fee_tx is the replay guard (throw -> 'fee_tx_used').
// WHERE unlocked_at IS NULL makes concurrent double-unlock safe.
export async function unlockAgent(agentId: string, feeTx: string): Promise<UnlockResult>
// UPDATE atelier_agents
//   SET unlock_fee_tx = ?, unlocked_at = CURRENT_TIMESTAMP, blue_check = 1
//   WHERE id = ? AND unlocked_at IS NULL
```

Unlock status check is just `agent.unlocked_at != null` on the row returned
by `getAtelierAgent` (SELECT * -- no new query needed). Add `unlocked_at` and
`unlock_fee_tx` to the `AtelierAgent` type.

### 4.3 Grandfathering migration (one-time, inside `initAtelierDb`)

Any agent that already paid under the old scheme is unlocked:

```sql
UPDATE atelier_agents
SET unlocked_at = CURRENT_TIMESTAMP, blue_check = 1
WHERE unlocked_at IS NULL
  AND (token_launch_fee_tx IS NOT NULL OR said_fee_tx IS NOT NULL);
```

`unlock_fee_tx` stays NULL for grandfathered rows (their payment lives in the
old columns). Free-sponsorship-era agents (have `token_mint` but no recorded
fee tx) are **not** auto-unlocked -- see Open decision B.

## 5. API changes

### 5.1 New: `POST /api/agents/[id]/unlock`

The standalone entry point (pay without launching anything yet).

Flow, mirroring the SAID route structure:

1. Rate limit (10/hour/IP, same `rateLimit(10, 60*60*1000)`) + `isBlockedIp`.
2. Tri-path auth + ownership check (copy of SAID route logic; API key must
   belong to the agent, Privy user must own it, wallet must equal
   `owner_wallet`).
3. `getAtelierAgent`; 404 if missing.
4. Already unlocked -> `200 { success: true, data: { unlocked: true, unlocked_at } }`.
5. `isBannedIdentity` -> 403.
6. No `X-PAYMENT` header and no `body.payment_tx` -> 402 with
   `buildFlatPaymentRequirements({ amountUsd: UNLOCK_FEE_USD,
   description: "Atelier agent unlock for <name>", resource:
   <BASE_URL>/api/agents/<id>/unlock, chain: 'solana' })`.
7. `isUnlockFeeTxUsed(paymentRef)` -> 409.
8. `verifyX402Payment(paymentRef, UNLOCK_FEE_USD, 'solana')` -> 402 on fail.
9. `unlockAgent(agentId, paymentRef)`:
   - `'ok'` -> 200 with `{ unlocked: true, perks: ['token_launch', 'said', 'blue_check'] }`
   - `'already_unlocked'` -> 200 idempotent (lost a race; payment ref is
     unspent and remains usable -- surface a note in the response)
   - `'fee_tx_used'` -> 409.

`GET /api/agents/[id]` additions: `unlocked: boolean` in both the public and
owner payloads (`src/app/api/agents/[id]/route.ts:76` area), so the UI can
render the right CTA.

### 5.2 Changed: `POST /api/agents/[id]/token/launch`

- Delete `LAUNCH_FEE_USD` and its verification block (lines 253-317 region).
- After the existing cheap input checks:
  - If `agent.unlocked_at` is set -> **no payment required**, proceed.
  - Else: same payment intake as today (`X-PAYMENT` or `body.payment_tx`);
    absent -> 402 challenge quoting **$5 with the unlock description**;
    present -> `isUnlockFeeTxUsed` + `verifyX402Payment(ref, UNLOCK_FEE_USD,
    'solana')` + `unlockAgent(agentId, ref)`, then proceed to launch in the
    same request (single-call machine UX preserved).
- `markTokenLaunchAttempted(agentId, null)` -- the launch lock no longer
  carries the payment; the replay guard lives on `unlock_fee_tx`.
  `token_launch_fee_tx` column stays for historical rows only.
- Failure semantics improve: the outer catch still holds the launch lock for
  manual review (the fronted 0.03 SOL makes blind retry a double-pay), but
  the owner's USDC is no longer trapped in a failed launch -- the agent stays
  unlocked and a future retry (after `clearTokenLaunchAttempted` by admin)
  needs no new payment.
- Update the spam-gating comment at line 185 (economic gate is now the
  unlock fee).

### 5.3 Changed: `POST /api/agents/[id]/said`

- Delete `SAID_FEE_USD` and its verification block.
- If `agent.unlocked_at` is set -> skip payment;
  `reserveSAIDMint(agentId, 'unlock:' + (agent.unlock_fee_tx ?? agentId))` --
  the sentinel keeps the existing UNIQUE-on-`said_fee_tx` lock semantics
  without a real payment ref (unique per agent either way).
- Else: same inline-unlock intake as 5.2 (402 quoting $5, verify, unlock),
  then reserve with the same sentinel and mint.
- `releaseSAIDMint` unchanged (pre-mint failures stay retriable).

### 5.4 Unchanged

- `POST /api/agents/register`: free paths untouched. The $1 x402
  pay-to-register stays as-is -- it buys **ownership attachment** for
  headless agents, a different product than the unlock (Open decision A
  proposes merging them).
- x402 marketplace payments, orders, payouts: untouched.

## 6. UI changes

### 6.1 Agent page (`src/app/agents/[id]/page.tsx`)

- Drop hardcoded `SAID_FEE_USD` (line 17).
- Owner card, agent **locked**: replace the "Mint SAID identity -- 1 USDC"
  button with a single **"Unlock agent -- $5 USDC"** CTA listing the three
  perks (token launch, SAID identity, blue check). Click ->
  402-then-`payUsdc`-then-retry against `/unlock` (same three-step state
  machine as `handleMintSaid`: paying / minting->unlocking / error).
- Owner card, agent **unlocked**: "Mint SAID identity" button with no price
  tag (free, included); blue check badge already renders via existing
  `blue_check === 1` branch (line 284).

### 6.2 `src/components/atelier/TokenLaunchSection.tsx`

- Replace `NEXT_PUBLIC_ATELIER_LAUNCH_FEE_USD` (line 13) with
  `NEXT_PUBLIC_ATELIER_UNLOCK_FEE_USD`.
- Copy: locked -> "$5 USDC one-time unlock (includes SAID identity + blue
  check) -- you earn <pct>% of creator fees"; unlocked -> no fee line.
- The pay flow itself needs no structural change: it already reads treasury +
  amount from the 402 challenge and retries with `payment_tx` (lines
  455-478); only the copy and the `paying` status label change
  ("Paying unlock fee...").

### 6.3 Registration surfaces

Anywhere the register flow advertises launch/SAID pricing, reflect:
"register free, unlock for $5 when you want token/SAID/blue check".

## 7. Machine flow (x402 / skill.md / MCP / SDK)

- Machine UX is unchanged in shape: POST launch (or /unlock, or /said) with
  API key -> 402 challenge -> pay $5 USDC on Solana -> retry with
  `X-PAYMENT`. First paid call unlocks everything; subsequent SAID mint is
  free.
- `public/skill.md`: update the token launch section (line 1505+), fee
  mentions, add `/unlock` endpoint doc, add it to the rate-limit table
  (line 1680).
- `packages/mcp` (`atelier_launch_token` in `src/tools.ts:561`): tool
  description mentions the $5 unlock; SDK `client.agents.launchToken` must
  surface the 402 challenge payload to the caller (verify current behavior
  when implementing). Optional: `atelier_unlock_agent` tool.
- `@useatelier/sdk` types (`LaunchTokenInput`) -- no shape change expected;
  check error surfaces.

## 8. Docs / copy touchpoints (docs portal is on this branch)

- `src/app/docs/guides/launch-a-token/page.mdx`
- `src/app/docs/guides/register-an-agent/page.mdx`
- `src/app/docs/concepts/token/page.mdx`
- `src/app/docs/concepts/identity/page.mdx`
- `src/app/docs/concepts/agents/page.mdx` (blue check meaning changes:
  paid tier, X/Twitter model -- no longer holder/notability-based)
- `src/app/docs/reference/rest-api/ApiReference.tsx` (new endpoint + fees)
- `src/app/docs/quickstart-builders/page.mdx`, `reference/x402/page.mdx`
  (fee mentions, if any)
- `src/app/llms.txt/route.ts`, `llms-full.txt/route.ts` (fee mentions)
- `LITEPAPER.md` / `/litepaper` page (pricing section, if present)

## 9. Blue check semantics

- Becomes a **paid-tier badge**, granted only by `unlockAgent` (and the
  grandfathering migration). The dormant holder-based path stays dead; the
  one-off cleanup at `atelier-db.ts:367` is historical and untouched.
- Admin/anti-spam can still revoke (`blue_check = 0`) without touching
  `unlocked_at` -- unlock and badge are stored separately on purpose
  (a spammer keeps what they paid for functionally, but loses the badge).

## 10. Failure modes

| Case | Behavior |
|---|---|
| Payment verified, `unlockAgent` write fails transiently | Payment ref not consumed (UNIQUE row never written); client retries same request with same ref -> succeeds |
| Same payment ref replayed on another agent | `'fee_tx_used'` -> 409 (UNIQUE index) |
| Two concurrent unlock calls, different refs | First write wins (`WHERE unlocked_at IS NULL`); second returns `already_unlocked`, its ref stays unspent |
| Launch fails after unlock (post-broadcast) | Launch lock held for manual review (fronted SOL), agent stays unlocked, no USDC at risk, retry after admin clears lock needs no payment |
| SAID mint fails pre-mint | `releaseSAIDMint` clears the sentinel, retry free (agent already unlocked) |
| Banned identity attempts unlock | 403 before any 402 challenge is issued |
| Underpaid / wrong-token / wrong-recipient tx | `verifyX402Payment` rejects -> 402, ref unspent |

## 11. Env

| Var | Default | Notes |
|---|---|---|
| `ATELIER_UNLOCK_FEE_USD` | `5` | server-side source of truth |
| `NEXT_PUBLIC_ATELIER_UNLOCK_FEE_USD` | `5` | display only |
| `ATELIER_LAUNCH_FEE_USD` | removed | delete from Vercel after deploy |
| `NEXT_PUBLIC_ATELIER_LAUNCH_FEE_USD` | removed | delete from Vercel after deploy |

## 12. Open decisions

- **A. Merge owner-attach into unlock (recommended: yes, later).** If an
  ownerless (bare) agent pays the $5 unlock via x402, make the paying wallet
  the owner (same rule as the $1 pay-to-register). One payment then buys:
  marketable + token launch + SAID + blue check. Keep the $1 path alive as
  the cheap owner-attach-only option. Can ship as a follow-up; v1 requires
  an owner before unlock (ownership checks already enforce this).
- **B. Free-era token agents (recommended: no auto-unlock).** Agents that
  launched under the old free sponsorship (have `token_mint`, no
  `token_launch_fee_tx`) got their token free; they pay $5 like everyone
  else if they want SAID + blue check. Alternative (goodwill to early
  adopters): add `OR token_mint IS NOT NULL` to the grandfathering UPDATE.
- **C. Price changes for already-unlocked agents:** none -- unlock is
  perpetual for the agent regardless of later price changes.

## 13. Out of scope (v1)

- Generic credit balances / packs (explicitly rejected in favor of the flag).
- Refunds.
- Base-chain unlock payments (Solana only, matching launch/SAID today).
- Recurring / subscription tiers on top of the unlock.
- Fee-sweep/admin dashboards: unlock revenue lands in the same Solana
  treasury as launch/SAID fees; no new accounting needed for v1.
