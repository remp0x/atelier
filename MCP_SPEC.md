# Atelier MCP -- Build Spec ("the most solid MCP in the market")

Goal: ANYONE, with ANY client (Claude.ai / Claude Desktop / Claude Code, ChatGPT /
Codex, Cursor, VS Code, Cline, Goose, Hermes/open clients), can connect to Atelier
over a single URL and do EVERYTHING -- discover, hire, pay, track, deliver, approve,
review, message, manage agents/services/tokens.

Status: PLAN (refined after research spikes). No code written yet.

---

## 1. Where we are today (the problem)

Two MCP surfaces that have drifted apart:

| | `@atelier-ai/mcp` (npm, stdio) | `/api/x402/mcp` (remote HTTP) |
|---|---|---|
| Tools | **32** -- full operator surface | **2** (`search_agents`, `hire_agent`) |
| Reach | Local only (`npx`) | Any URL client |
| Protocol | current (via SDK) | **`2024-11-05`** (deprecated transport) |
| Auth | `atelier_` key in env | **none** |
| Streaming / sessions | n/a | **none** |

So "any client, do everything" fails twice: remote clients get only search + a payment
quote (`hire_agent` returns instructions and stops -- it never creates an order), and
the full surface needs a local install + hand-pasted key. Marketplace lifecycle is ~9
steps; the *remote* MCP covers ~1.5. (The *stdio* package already covers the lifecycle
-- it just can't be reached remotely or authenticated beyond an env var.)

---

## 2. Locked decisions

1. **Substrate: `mcp-handler@1.1.0`** (the maintained `@vercel/mcp-adapter`) +
   `@modelcontextprotocol/sdk@1.26.0` (exact pin -- mcp-handler requires it; older SDK
   carries CVE-2026-25536 session leak) + `zod@^3`.
   - Verified compatible with **Next 14.2.35 / React 18** (peer `next >=13`, optional;
     handler only touches Web-standard `Request`/`Response`). Not a blocker.
2. **Canonical endpoint: `/api/mcp`**, Streamable HTTP, **stateless** mode
   (`sessionIdGenerator: undefined`), `disableSse: true` -> **no Redis required** on
   Vercel. Fresh transport+server per POST = correct serverless pattern.
3. **Auth: BOTH, on one endpoint, via one `verifyToken` seam:**
   - Static bearer `atelier_` (reuses `atelier-auth.ts`) -- works in every header-capable
     client immediately.
   - OAuth 2.1 -- one-click self-onboarding for Claude.ai + ChatGPT consumer connectors.
4. **OAuth = MANAGED Authorization Server, NOT build-our-own.** Privy cannot be an AS
   (relying party only: first-party JWT, no `/authorize`, `/token`, DCR). Building our
   own AS = 2-4 weeks + perpetual spec-chasing + real auth-bypass liability. Use a managed
   AS that keeps Privy as the login UI behind it. **(Provider choice = the one open
   decision, section 5.)**
5. **One shared tool registry** consumed by both the remote route and the stdio bin, so
   they can never drift again.
6. Old `/api/x402/mcp` stays as a deprecated `2024-11-05` alias -- zero breakage for
   currently-connected agents.

---

## 3. Target architecture

### 3.1 Transport / endpoint

```
src/app/api/[transport]/route.ts     # mcp-handler catch-all -> /api/mcp (POST+GET)
  export const runtime = 'nodejs'    # NOT edge
  export const maxDuration = 60
  createMcpHandler(register, serverInfo, { basePath:'/api', disableSse:true, maxDuration:60 })
  wrapped in withMcpAuth(handler, verifyToken, { required:true, resourceMetadataPath:'/.well-known/oauth-protected-resource' })
  export { authedHandler as GET, authedHandler as POST }   # no DELETE in stateless
```

### 3.2 The unified `verifyToken` seam (the core idea)

`mcp-handler` is Resource-Server-only: it extracts the bearer, calls our `verifyToken`,
and auto-emits `401 WWW-Authenticate: Bearer ... resource_metadata=...` / `403`. We
resolve the caller to an internal identity and return `AuthInfo`:

```
verifyToken(req, bearer):
  if !bearer -> undefined                       # 401 with PRM pointer
  if bearer.startsWith('atelier_'):
       agent = resolveExternalAgentByApiKey(bearer)        # atelier-auth.ts
       -> AuthInfo { token, clientId: agent.id, scopes:['provider','buyer'],
                     extra:{ kind:'agent', apiKey: bearer } }
  else:                                          # OAuth JWT from the managed AS
       payload = jwtVerify(bearer, JWKS, { issuer, audience: MCP_RESOURCE_URI })  # jose
       userId  = map(payload.sub | email) -> Atelier users.privy_user_id
       -> AuthInfo { token, clientId: payload.client_id, scopes: payload.scope.split,
                     extra:{ kind:'user', userId } }
```

`AuthInfo.extra` reaches every tool handler via `extra.authInfo.extra`. We NEVER forward
the client's MCP token upstream (spec: no token passthrough). Instead, ToolContext builds
the upstream credential from the resolved identity (3.3).

### 3.3 Upstream credential mapping (the real design nut)

Tools execute by calling Atelier's **existing REST routes through the SDK** (reuses
participant-gating, x402 verify+payout, replay-guard, rate limits -- not reimplemented).
The remote route builds a per-request `AtelierClient { baseUrl: own origin }` whose
credential depends on caller kind:

- `kind:'agent'` (atelier_ bearer): SDK sends `Authorization: Bearer atelier_<key>` --
  this is the agent's OWN key (not third-party passthrough). Covers all `atelier_`-gated
  routes (services, orders provider+buyer actions, deliver, messages, tokens, portfolio).
- `kind:'user'` (OAuth/Privy-backed): the user identity is a `privy_user_id`. Two routes
  for upstream auth, pick in section 9 open-items:
  (a) mint a short-lived server-side Privy session/token for that user and have the SDK
      send it (covers privy-gated routes: human escrow approve/review/list-my-orders); or
  (b) call internal `@/lib` functions with the resolved `userId` directly (no HTTP hop),
      for the human-gated subset.
  For the FIRST ship, OAuth-user scope = discovery + buyer/x402 + (if the user owns an
  agent) that agent's provider tools via its key. Human-only escrow approve/review can
  land in the OAuth follow-up once (a)/(b) is chosen.

### 3.4 Shared registry

New internal package `packages/mcp-core` (or `src/lib/mcp/` -- see 9.workspace):

```
packages/mcp-core/src/
  context.ts     # ToolContext { client: AtelierClient; caller: AuthInfo }
  registry.ts    # registerTools(server: McpServer, ctx): void  + ToolDefinition[]
  tools/         # one file per group; each: { name,title,description,inputSchema(zod),
                 #   outputSchema?, annotations, scopes, handler(ctx,args) }
  resources.ts   # catalog/trending/bazaar/manifest as MCP resources
  prompts.ts     # hire-an-agent, become-a-provider
```

Consumers:
- Remote: `src/app/api/[transport]/route.ts` -> `createMcpHandler(s => registerTools(s, ctx))`.
- Stdio: `packages/mcp/src/index.ts` -> `registerTools(server, ctx); server.connect(StdioServerTransport)`.

Tool logic authored once; both transports stay in lockstep.

---

## 4. Tool surface

Good news: the **existing 32 stdio tools already implement the lifecycle** (orders:
get/approve/cancel/dispute/requestRevision/quote/deliver/messages; services CRUD;
bounties; tokens; profile; discovery; market). Unification work is mostly *move + expose
remotely*, plus a few additions.

**Add (new):**
- `search_agents` (port from remote) -- service-catalog search.
- `get_payment_requirements` -- wrap `GET /api/x402/discover/{id}` (the real 402).
- `submit_payment` / `finalize_hire` `{service_id, brief, tx_signature, chain}` -- wrap
  `POST /api/x402/pay` (the missing pay->order step; attaches buyer key for attribution).
- `search` + `fetch` -- **ChatGPT Deep-Research mandated**, exact OpenAI schema:
  `search({query}) -> { results:[{id,title,url}] }`;
  `fetch({id}) -> {id,title,text,url,metadata}` (also JSON-stringified into `content[]`).
  Maps onto catalog search (id=service_id) + service/agent/order detail.

**Upgrade (all tools):** zod `inputSchema`, `outputSchema` + `structuredContent` on reads,
`annotations` (readOnlyHint / destructiveHint / idempotentHint / openWorldHint -- e.g.
`cancel_order` destructive, `get_order` readOnly+idempotent), cursor pagination on lists.

**Tool-count cap:** 32 + ~4 + search/fetch ~= 44 > **Cursor's ~40 soft ceiling** (silent
drop) and < Copilot's 128 hard cap. Mitigate with a **scope filter**: `tools/list` returns
a buyer-lean subset (~12-15) vs provider-full set based on `AuthInfo.scopes` -- one URL,
right-sized per identity.

---

## 5. THE ONE OPEN DECISION -- which managed AS

`mcp-handler` gives the RS side (PRM + verifyToken + 401). The AS must do DCR/CIMD +
PKCE-S256 + hosted consent + RFC 8707 audience binding + `offline_access`, AND federate to
our existing **Privy** login WITHOUT requiring Privy to be an OIDC IdP (it isn't). That
"federate to a non-OIDC login" requirement is the deciding factor.

| Provider | Free tier | Privy federation mode | Notes |
|---|---|---|---|
| **WorkOS AuthKit + Standalone Connect** (REC) | **1M MAU** | "You log the user in (Privy), call completion API" -- no OIDC-IdP needed | Most spec-complete for what platforms test; explicit RFC 8707; DCR + CIMD; one bridge endpoint to write |
| Stytch Connected Apps (Trusted Auth Tokens) | 10k MAU | Validate Privy's JWT (needs reachable Privy JWKS w/ email claim) | Least code IF Privy exposes JWKS -- verify URL first |
| Descope | 7,500 MAU | Custom OAuth connection inside a Descope Flow | Best Vercel DX: official Next.js `withMcpAuth()` template |
| Auth0 / Clerk | -- | custom OIDC upstream / wants to BE the IdP | Poorer fit for "keep Privy" |
| Cloudflare workers-oauth-provider | ~$5/mo | `defaultHandler` wraps Privy in code | Moves MCP server OFF Vercel onto Workers -- abandons mcp-handler |

**Recommendation: WorkOS AuthKit + Standalone Connect.** `verifyToken` validates
`https://{slug}.authkit.app/oauth2/jwks` (iss + aud=`MCP_RESOURCE_URI`); a Next.js bridge
page runs the existing Privy widget and calls WorkOS's completion API. Enable DCR + CIMD +
Resource Indicators + `offline_access`.

---

## 6. File-level work plan

Auth is "both now", so OAuth is in the initial ship (Phase 2), not deferred.

### Phase 0 -- prep (S)
- Decide AS provider (section 5); create account; set env (`WORKOS_*` / chosen).
- Choose module-sharing strategy (9.workspace): pnpm workspaces vs `transpilePackages`+alias.
- Add deps: `mcp-handler`, `@modelcontextprotocol/sdk@1.26.0`, `zod@^3`, `jose`,
  AS SDK (e.g. `@workos-inc/node` / `@workos-inc/authkit-nextjs`).

### Phase 1 -- shared registry + standards-compliant remote w/ bearer auth (M)
- Create `packages/mcp-core` (context, registry, tools/*). Move the 32 tool defs from
  `packages/mcp/src/tools.ts` into it; add `search_agents`, `get_payment_requirements`,
  `submit_payment`.
- `src/app/api/[transport]/route.ts`: `createMcpHandler` (stateless, disableSse) +
  `withMcpAuth(verifyToken)`; `verifyToken` resolves `atelier_` via `atelier-auth.ts`;
  per-request `AtelierClient` at own origin; Origin validation; reuse `rateLimit.ts` on
  write tools.
- Refactor `packages/mcp/src/index.ts` to import `registerTools` (stdio stays thin).
- Keep `src/app/api/x402/mcp/route.ts` as deprecated alias (add note in GET payload).
- SHIPS: every header-capable client (Claude Code, Cursor, VS Code, Cline, Codex,
  Responses API, ChatGPT Dev Mode) runs the entire lifecycle over Streamable HTTP.

### Phase 2 -- OAuth 2.1 via managed AS (M, was L when build-our-own)
- `src/app/.well-known/oauth-protected-resource/route.ts` via
  `protectedResourceHandler({ authServerUrls:[AS_ISSUER] })` + `metadataCorsOptionsRequestHandler` (OPTIONS).
- Extend `verifyToken` with the JWT branch (jose: JWKS + iss + aud).
- AS config: DCR + CIMD + PKCE-S256 + Resource Indicators (`aud`=`/api/mcp` URI) +
  `offline_access`.
- Privy bridge: `src/app/api/oauth/login/...` (or AS "Login URI") -> Next.js page runs
  Privy widget -> verify Privy JWT -> AS completion API.
- Resolve OAuth-user -> `privy_user_id`; decide upstream-credential route (3.3 a/b).
- SHIPS: non-technical users add Atelier as a Custom Connector in Claude.ai / ChatGPT
  with a browser login, zero config.

### Phase 3 -- ChatGPT compat + spec richness (S)
- `search` + `fetch` tools (exact OpenAI schema).
- `outputSchema`/`structuredContent`, `annotations`, cursor pagination on all tools.
- Discovery feeds as MCP **resources** (`/api/x402/services`, `/trending`, `/bazaar`,
  `/.well-known/x402`); declare resources capability.
- Scope -> tool filter in `tools/list` (stay <=40).
- SHIPS: ChatGPT Deep Research + consumer connectors accept the server; validated
  structured results; safe destructive hints; browsable catalog.

### Phase 4 -- discovery + polish (M)
- Publish `server.json` to `registry.modelcontextprotocol.io`.
- Update `/.well-known/x402` to point at `/api/mcp` + PRM as canonical machine entrypoints.
- MCP prompts (hire-an-agent, become-a-provider).
- Logging capability; per-identity rate-limit + audit on money-moving tools
  (`submit_payment`, `deliver_order`, `approve`, payout).
- Optional legacy SSE behind a flag (Redis relay) for the rare SSE-only client.
- Version-bump + publish `@atelier-ai/mcp` (+ `mcp-core`); update `public/skill.md` + docs
  with the remote URL and per-client connect instructions.

---

## 7. Dependencies to add

```
mcp-handler                       # ^1.1.0
@modelcontextprotocol/sdk         # 1.26.0  (EXACT pin)
zod                               # ^3
jose                              # JWT verify for the OAuth branch
@workos-inc/node | authkit-nextjs # if WorkOS  (or chosen AS SDK)
```

---

## 8. Security / platform-rejection checklist

- **No token passthrough:** server uses its own resolved credential upstream; reject JWTs
  whose `aud` != `MCP_RESOURCE_URI` (RFC 8707).
- **PRM `resource` must EXACTLY equal the MCP server URL**; 401 must carry the
  `resource_metadata` pointer (mcp-handler emits it; we serve the PRM doc).
- **AS metadata must advertise `code_challenge_methods_supported:["S256"]`** or clients
  refuse; include `offline_access` in `scopes_supported` or Claude won't request refresh
  tokens (re-auth loops).
- **Loopback redirect URIs** (`127.0.0.1`/`localhost`) accepted port-agnostically for
  native clients (Claude Code, RFC 8252) -- managed AS handles this.
- **Origin validation** (403 on bad Origin); CORS scoped (PRM permissive, MCP endpoint not
  an open relay).
- **DCR is now MAY (not MUST)** as of 2025-11-25; CIMD is SHOULD -- pick an AS doing both.
- Rate-limit + replay-guard (`isPaymentTxSignatureUsed`) preserved by forwarding through
  the REST routes, NOT reimplementing.

---

## 9. Open design items (for office-hours)

- **AS provider** (section 5) -- recommend WorkOS; confirm.
- **Module sharing** -- pnpm workspaces (most idiomatic; Vercel-native) vs
  `transpilePackages` + tsconfig path alias (least disruptive on this non-workspace repo).
  Recommend `transpilePackages` for the first cut to avoid a repo-wide migration.
- **OAuth-user upstream credential** (3.3) -- mint server-side Privy token (covers human
  escrow routes) vs call `@/lib` directly with resolved `userId`. Recommend the Privy-token
  mint so OAuth users reach the same routes as the web app.
- **MCP_RESOURCE_URI / hostname** -- RESOLVED: canonical endpoint is `app.useatelier.ai/mcp`
  (where the Next app runs); `api.useatelier.ai/mcp` 308-redirects there and would advertise a
  mismatched PRM `resource`. PRM `resource` and AS `aud` are derived per-request from the origin,
  so the `app.` host stays self-consistent. Advertise `app.useatelier.ai/mcp` to clients.

---

## 10. Build status

Decisions locked by the user: endpoint **`app.useatelier.ai/mcp`** (canonical; `api.useatelier.ai/mcp`
308-redirects here), **both** bearer + OAuth,
**mcp-handler** substrate, and -- after weighing it -- an **in-house OAuth 2.1 AS backed by Privy**
(switched from WorkOS to ship a working, fully-testable Connect button with no external account).
Override: **every authenticated agent gets the FULL action set** -- no buyer-lean tool filtering.
Gating is binary: `auth: 'none'` (anyone) vs `auth: 'agent'` (any authenticated identity). Tool
count is 39 (at Cursor's ~40 ceiling -- watch this; consolidate before adding many more).

### SHIPPED (Phase 1 + RS half of Phase 2) -- verified end-to-end

- `packages/mcp-core/` -- shared registry. One source of truth: 39 tools = 32 operator tools +
  x402 buyer flow (`search_agents`, `get_payment_requirements`, `submit_payment`) + Earn
  (`earn_markets`, `earn_positions`, `earn_deposit`, `earn_withdraw`), each with annotations + `auth`
  gating. `registerTools(server, makeContext)` consumed by both transports. Earn deposit is push-model
  (send USDC to `treasury_wallet` from `earn_markets`, then pass `incoming_tx_hash`).
- **OAuth-user -> agent credential mapping DONE:** `ContextFactory` is async; the route resolves an
  OAuth `user` (privy_user_id) to their first key-bearing agent via `getAtelierAgentsByPrivyUser` and
  acts with that agent's own key upstream (no token passthrough). v1 = first agent; multi-agent
  disambiguation later.
- `src/app/mcp/route.ts` -- Streamable HTTP via `createMcpHandler` (stateless, `disableSse`, no
  Redis), wrapped in `withMcpAuth(verifyMcpToken)`. Per-request `AtelierClient` -> own origin
  (`getPublicOrigin`), 50s timeout. `runtime=nodejs`, `maxDuration=60`.
- `src/lib/mcp/verify-token.ts` -- unified seam: `atelier_` bearer (-> agent) + in-house OAuth JWT
  (-> user) + optional WorkOS JWKS fallback; audience derived per-origin; no token passthrough.
- `src/app/.well-known/oauth-protected-resource/route.ts` -- RFC 9728 PRM, origin-derived (works dev
  + prod). `src/app/.well-known/oauth-authorization-server/route.ts` -- RFC 8414 AS metadata.
- `packages/mcp/src/index.ts` -- stdio thin wrapper over mcp-core (no drift). `/api/x402/mcp` kept as
  a deprecated alias.

### SHIPPED -- in-house OAuth 2.1 AS (the Connect button), verified end-to-end

Atelier is its own minimal AS; identity delegated to Privy. Files:
- `src/lib/oauth/config.ts` (enable flag + origin/resource helpers + TTLs), `tokens.ts` (HS256
  access-token sign/verify, `aud`-bound), `store.ts` (Turso tables: `oauth_clients`, single-use
  PKCE-bound `oauth_codes`, rotating hashed `oauth_refresh_tokens`).
- `src/app/api/oauth/register` (RFC 7591 DCR, https/loopback redirect validation), `.../authorize`
  (POST: Privy-gated, mints PKCE-bound code), `.../token` (authorization_code + refresh_token,
  verifies PKCE S256, public client).
- `src/app/oauth/authorize/page.tsx` -- consent screen; Privy login via `usePrivy`; on Approve mints
  the code and redirects back.
- Flow: `/mcp` (no auth) -> 401 + `WWW-Authenticate` -> PRM -> AS metadata -> DCR -> `/oauth/authorize`
  (Privy login + consent) -> code -> `/api/oauth/token` (PKCE) -> access+refresh -> `/mcp` authed as
  user -> mapped to their agent key.
- Enabled by **`MCP_OAUTH_SECRET`** (strong random HMAC key). When set, `/mcp` challenges
  unauthenticated requests so the Connect button appears; bearer `atelier_` keeps working. When
  unset, `/mcp` stays open (bearer + public).
- Verified (dev, `MCP_OAUTH_SECRET` set): PRM + AS metadata correct; DCR issues client_id; `/mcp`
  returns 401 + `WWW-Authenticate`->PRM; token endpoint `invalid_grant` on bad code; authorize
  `access_denied` without Privy; PKCE S256 + HS256 `aud`-bound JWT roundtrip (wrong-aud rejected); a
  valid in-house token is accepted by live `/mcp` (200, 39 tools, treated as user). NOT headless-
  tested: the literal Privy browser consent click (standard Privy widget; gated by
  `verifyPrivyAccessToken`).

### TO GO LIVE
- Set `MCP_OAUTH_SECRET` (random 32+ bytes) in prod env. That's it -- no external account.
- Remaining nice-to-haves: multi-agent disambiguation for OAuth users (v1 uses first key-bearing
  agent); rate-limit on `/api/oauth/*`; periodic cleanup of expired codes/tokens.

### Later (Phase 3-4)

- ChatGPT Deep Research `search`+`fetch` exact-schema tools; outputSchema/structuredContent;
  resources (catalog/trending/bazaar); MCP Registry `server.json`; prompts; audit/rate-limit on
  money-moving tools; update `public/skill.md` + docs with the `/mcp` URL + per-client instructions.
