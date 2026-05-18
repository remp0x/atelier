# Atelier -- Project Instructions

Read `SPEC.md` before any architectural decisions or significant changes.

## Stack

- Next.js 14.2.5 (App Router), React 18, TypeScript 5
- TailwindCSS 3.4.1, dark-first (`class` strategy)
- Turso/LibSQL (raw SQL, no ORM), Vercel Blob (storage)
- Solana web3.js 1.98, SPL Token, Privy auth (multi-chain: Solana + Base)
- viem 2.x for Base (Ethereum L2) USDC payments
- Framer Motion 12.x + GSAP 3.x (ScrollTrigger) for animations

## Design System

### Colors (CSS vars in globals.css)
- Primary: `--atelier` (#fa4c14), `--atelier-bright` (#ff7a3d)
- Aurora palette: #c93a0a, #ff7a3d, #fa4c14, #ffb199, #9a2906
- Orange accent: #FF6B2C (bright: #FF8C5A)
- Dark backgrounds: #000000, #0a0a0a, #141414, #1a1a1a
- Borders: #333333 (dark), #d5d7dc (light)

### Typography
- Display/headings: `font-display` (Syne, Space Grotesk)
- Body: `font-sans` (Inter)
- Data/code/labels: `font-mono` (IBM Plex Mono, JetBrains Mono)

### Conventions
- Dark mode default (`<html class="dark">`)
- Noise texture overlay on body (SVG filter via CSS ::before)
- Purple gradient accent throughout (`gradient-atelier`)
- Custom animations: glow-atelier, slide-up, fade-in, pulse-atelier, aurora

## Component Patterns

### File Organization
```
src/components/atelier/         -- core UI components
src/components/atelier/landing/ -- landing page sections
src/components/atelier/x402/    -- x402 protocol landing page
src/hooks/                      -- custom hooks (use-atelier-auth.tsx)
src/lib/                        -- utilities, organized by domain
src/lib/providers/              -- AI generation provider implementations
```

### Naming
- Files: kebab-case (e.g. `solana-auth.ts`)
- Components: PascalCase (e.g. `AgentCard.tsx`)
- Constants: SCREAMING_SNAKE_CASE
- IDs: `{prefix}_{timestamp}_{random}` (e.g. `svc_1234567890_abc123`)

### State Management
- React Context + useState only (no Redux, no Zustand)
- Auth context: `useAtelierAuth` hook from `src/hooks/use-atelier-auth.tsx`
- No React Query/SWR -- direct fetch() calls

### Client vs Server
- All interactive UI components use `'use client'`
- API routes are server-only (default)
- SSR-sensitive components use `dynamic()` import (e.g. SolanaWalletBridge)

### Data Fetching
- Direct fetch() to internal API routes
- No dedicated data-fetching library
- Pattern: useState + useEffect + fetch

## API Route Patterns

### Response Format
Always return: `{ success: boolean, data?: T, error?: string }`

### Auth
- **Primary identity: Privy access token** (X / Twitter or Google login). Verified via `privy-auth.ts` `verifyPrivyAccessToken(token)`. Token read from `Authorization: Bearer <token>` header, `privy-token` cookie, or body `privy_access_token`. Returns `PrivyUserInfo { privyUserId, twitterUsername, googleEmail, linkedSolanaWallets[], linkedEvmWallets[], ... }`.
- **User identity = `privy_user_id`** (TEXT PK in `users` table). Wallets are linked via `user_wallets(user_id, chain, address)` with `UNIQUE(chain, address)`.
- Legacy wallet signature auth (`wallet`, `wallet_sig`, `wallet_sig_ts`, optional `wallet_chain`) still works as fallback on routes that pre-date Privy. Routes check Privy token first, fall back to wallet sig.
  - `wallet_chain`: `'solana'` (Ed25519) or `'base'` (EIP-191). Auto-detected from address shape.
- Agent actions (machine): `Authorization: Bearer atelier_{key}`. Resolved via `atelier-auth.ts`.
- x402 machine payments: `X-PAYMENT` header with Solana sig OR Base 0x tx hash. Optional `X-Payment-Network: solana-mainnet|base-mainnet` to disambiguate.
- Verify via `privy-auth.ts` (social), `wallet-auth.ts` (chain-agnostic wallet dispatcher), `solana-auth.ts` + `evm-auth.ts` (per-chain wallet primitives), `atelier-auth.ts` (API key), `x402.ts` (on-chain).

### User upsert flow
- On every page load when Privy `ready && authenticated`, the client posts to `POST /api/auth/user` with the Privy access token.
- Server upserts `users` row, auto-links every wallet from Privy `linked_accounts` into `user_wallets`, and runs `backfillUserOwnership(userId, addresses)` which claims legacy rows (`service_orders`, `atelier_agents`, `bounties`, `notifications`, etc.) whose wallet column matches.
- Username is generated from twitter handle, falling back to `user_<short>`. Collision suffix `2`-`99`, then random.

### Structure
```typescript
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 1. Parse params/query
  // 2. Auth check (if needed)
  // 3. Rate limit check
  // 4. DB query
  // 5. Return { success: true, data }
}
```

### Rate Limiting
In-memory rate limiters from `src/lib/rateLimit.ts`. Apply per endpoint category.

## Database

- Raw SQL via `@libsql/client` -- no ORM
- All queries in `src/lib/atelier-db.ts`
- Tables auto-created via `initAtelierDb()`
- See SPEC.md for full schema

## AI Providers

Provider interface in `src/lib/providers/types.ts`. Registry in `registry.ts`.
All providers use submit-then-poll pattern with configurable timeouts.
Active: grok, runway, luma, higgsfield, minimax.

## Key Files

| Purpose | File |
|---------|------|
| Root layout | `src/app/layout.tsx` |
| Provider wrapper | `src/components/atelier/AtelierProviders.tsx` |
| Auth hook | `src/hooks/use-atelier-auth.tsx` |
| All DB queries | `src/lib/atelier-db.ts` |
| Route paths | `src/lib/atelier-paths.ts` |
| Category labels/icons | `src/components/atelier/constants.ts` |
| CSS vars + fonts | `src/app/globals.css` |
| Tailwind config | `tailwind.config.js` |
| LLM discovery | `src/app/llms.txt/route.ts` |
| Base USDC primitives (server) | `src/lib/base-server.ts`, `base-verify.ts`, `base-payout.ts` |
| Base USDC payment (client) | `src/lib/base-pay.ts`, `src/lib/evm-auth-client.ts` |
| EVM bridge component | `src/components/atelier/EvmWalletBridge.tsx` |
| Chain selector UI | `src/components/atelier/ChainSelector.tsx` |
| Multi-chain wallet auth | `src/lib/wallet-auth.ts`, `evm-auth.ts` |
| Privy server verifier | `src/lib/privy-auth.ts`, `privy-server.ts`, `privy-client.ts` |
| User upsert endpoint | `src/app/api/auth/user/route.ts` |
| Linked wallets endpoint | `src/app/api/auth/wallets/[id]/route.ts` |
| Public profile by username | `src/app/profile/[username]/page.tsx`, `api/profile/[username]/route.ts` |
| LLM full reference | `src/app/llms-full.txt/route.ts` |
| Robots (AI crawlers) | `src/app/robots.ts` |
| Sitemap | `src/app/sitemap.ts` |
| x402 protocol | `src/lib/x402.ts` |
| Partner channels | `src/lib/partners-db.ts` |
| Agent skill doc | `public/skill.md` |

## Rules

- Never suppress types: no `as any`, `@ts-ignore`, `@ts-expect-error`
- Landing page: use real platform data (fetch from API), not hardcoded estimates
- Landing page: interactive animations (Framer Motion, parallax) -- never static/boring grids
- UI data labels: always use `font-mono`
- Support links: Telegram (t.me/atelierai) and X (@useAtelier) -- never email
- Git identity for this repo: `remp0x <remp0x@proton.me>`
