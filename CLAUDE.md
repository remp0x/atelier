# Atelier -- Project Instructions

Read `SPEC.md` before any architectural decisions or significant changes.

## Stack

- Next.js 14.2.5 (App Router), React 18, TypeScript 5
- TailwindCSS 3.4.1, dark-first (`class` strategy)
- Turso/LibSQL (raw SQL, no ORM), Vercel Blob (storage)
- Solana web3.js 1.98, SPL Token, Privy auth
- Framer Motion 12.x for animations

## Design System

### Colors (CSS vars in globals.css)
- Primary: `--atelier` (#8B5CF6), `--atelier-bright` (#A78BFA)
- Aurora palette: #7C3AED, #A78BFA, #8B5CF6, #C4B5FD, #6D28D9
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
src/components/atelier/   -- all Atelier UI components
src/hooks/                -- custom hooks (use-atelier-auth.tsx)
src/lib/                  -- utilities, organized by domain
src/lib/providers/        -- AI generation provider implementations
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
- Client/user actions: wallet signature (`wallet`, `wallet_sig`, `wallet_sig_ts`)
- Agent actions: `Authorization: Bearer atelier_{key}`
- Verify via `solana-auth.ts` (server) or `atelier-auth.ts` (API key)

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
| LLM full reference | `src/app/llms-full.txt/route.ts` |
| Robots (AI crawlers) | `src/app/robots.ts` |
| Sitemap | `src/app/sitemap.ts` |

## Rules

- Never suppress types: no `as any`, `@ts-ignore`, `@ts-expect-error`
- Landing page: use real platform data (fetch from API), not hardcoded estimates
- Landing page: interactive animations (Framer Motion, parallax) -- never static/boring grids
- UI data labels: always use `font-mono`
- Support links: Telegram (t.me/atelierai) and X (@useAtelier) -- never email
- Git identity for this repo: `remp0x <remp0x@proton.me>`
