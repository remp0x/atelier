# x402 Bazaar Setup + Directory Submission Runbook

Coinbase's Bazaar (the index behind agentic.market) auto-lists an x402 service
the FIRST time the CDP Facilitator SETTLES a payment for it. Atelier's legacy
flow (`/api/orders`) self-settles, so it is invisible to Bazaar. The CDP-native
settle path is now IMPLEMENTED and wired into `/api/x402/pay` for Base, gated by
`CDP_FACILITATOR_ENABLED`. This runbook covers what to set in the env and how to
take the first CDP-settled payment so the service auto-indexes.

## What ships now

- `src/lib/cdp-facilitator.ts` -- CDP Facilitator client with real, dependency-free
  CDP JWT signing (`generateCdpJwt`, EdDSA or ES256 auto-detected from the secret),
  `verifyViaCdpFacilitator`, `settleViaCdpFacilitator`, the **x402 v2** PaymentRequirements
  builder (`buildCdpV2PaymentRequirements`, CAIP-2 `eip155:8453` + `amount`), the
  `buildCdpBazaarExtension` discovery declaration, and the payload codec.
  Short-circuits to a no-op when keys are absent; never throws.
- `POST /api/x402/pay` -- when `?chain=base` and CDP is enabled, this is a real
  x402 resource. The buyer-facing 402 is **v1** (`maxAmountRequired`,
  `network:'base'`, string `resource`) because the common `x402-fetch` client is
  v1 and rejects CAIP-2 networks. It accepts the base64 `X-PAYMENT` /
  `PAYMENT-SIGNATURE` payload, then **re-wraps the buyer's EIP-3009 signature into
  an x402 v2 PaymentPayload** (CAIP-2 `eip155:8453`, `amount`, top-level `resource`
  ResourceInfo, `extensions.bazaar`) and runs CDP `verify` + `settle` in v2. The
  signature is portable across envelope versions (it is bound to the USDC EIP-712
  domain / chainId 8453, not the x402 version). **A successful v2 settle carrying
  `resource` + a valid bazaar extension is what indexes the resource in Bazaar**
  (v1 `outputSchema` discovery is deprecated and never indexed). The Solana /
  legacy tx-hash flow is unchanged and still works.
- `GET /api/x402/bazaar` -- live Bazaar-style discovery declaration. Read-only.

## Required env vars

| Var | Required | Purpose |
|-----|----------|---------|
| `CDP_API_KEY_ID` | yes | CDP Secret API Key ID. Presence + secret flips `CDP_FACILITATOR_ENABLED`. Becomes the JWT `kid`/`sub`. |
| `CDP_API_KEY_SECRET` | yes | CDP Secret API Key private key. Either a base64 Ed25519 (64-byte) key or an EC PKCS#8 PEM. Used to sign the per-request CDP JWT. NOT the public Client ID. |
| `ATELIER_TREASURY_BASE` | yes (Base) | Base wallet that receives buyer USDC (the `payTo`). CDP settles buyer -> this address; Atelier then pays the provider. Without it the CDP path returns 503. |
| `CDP_FACILITATOR_URL` | no | Override facilitator base URL. Defaults to `https://api.cdp.coinbase.com/platform/v2/x402`. |

`CDP_FACILITATOR_ENABLED` is `true` only when BOTH `CDP_API_KEY_ID` and
`CDP_API_KEY_SECRET` are set. When disabled, `/api/x402/pay` falls back to the
legacy tx-hash verify flow and `verify/settleViaCdpFacilitator` return an error
without any network call.

NOTE: the `Client ID` from CDP is a frontend/onramp credential and is NOT used
here. The facilitator needs the Secret API Key pair (Key ID + private key).

## Going live: take the first CDP-settled payment (auto-indexes in Bazaar)

The CDP settle path is already wired into `POST /api/x402/pay?chain=base`. To go
live and enter the Bazaar index:

1. Set `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, and `ATELIER_TREASURY_BASE` in the
   deployment env (and optionally `CDP_FACILITATOR_URL`).
2. From a funded Base wallet, hire ONE fixed-price service with a standard x402
   client (`x402-fetch` / `x402-axios`) pointed at
   `https://atelierai.xyz/api/x402/pay?service_id=<id>` (chain=base). The client
   will: GET -> receive the v2 402 -> sign the EIP-3009 `transferWithAuthorization`
   -> retry with the base64 payment header. Helper: `scripts/x402-test-pay.mjs`.
3. The route runs CDP `verify` then `settle`. On success it returns 200 with an
   `X-PAYMENT-RESPONSE` header (base64 of `{ success, transaction, network, payer }`),
   creates the order, and pays the provider. The CDP `EXTENSION-RESPONSES` header /
   body `extensions` from settle is logged as `CDP Bazaar extension for <url>: ...`
   -- it should read **`processing`** (accepted). `rejected` means the bazaar
   extension failed schema validation and the resource will NOT be cataloged.
4. Within ~10 minutes of that first CDP-settled v2 payment, the resource
   (`/api/x402/pay?service_id=<id>`) appears in Bazaar / agentic.market. Confirm via
   `GET api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<ATELIER_TREASURY_BASE>`
   (should move off `total:0`) and `GET api.agentic.market/v1/services/search?q=atelier`.
   No manual Bazaar submission needed.

Self-test already done: the CDP JWT signing recipe (Ed25519 + ES256) is
verified by a local crypto round-trip. The only thing that cannot be tested
without live keys + a funded Base payer is the end-to-end `verify`/`settle` call.

## Bazaar ranking + delisting signals

- 30-day inactivity delisting: a resource with no settled payments in the
  trailing 30 days is dropped from the index. Keep at least one settlement per
  listed service inside any 30-day window.
- Ranking signals (in rough priority order):
  - Distinct buyers in the last 30 days
  - Settled volume in the last 30 days
  - Recency of the most recent settlement
  - Metadata completeness (description, input schema, output schema) -- the
    `/api/x402/bazaar` feed already ships full input/output JSON Schemas to
    maximize this signal.

## x402scan discovery conformance (shipped)

x402scan (and the `@agentcash/discovery` validator) discover resources via, in
precedence order: (1) OpenAPI at `/openapi.json`, (2) `/.well-known/x402`, then
(3) per-URL runtime 402 probe. The current `@agentcash/discovery` CLI only parses
OpenAPI. Atelier now serves all three so that every discovery path resolves:

- `GET /openapi.json` -- OpenAPI 3.1 with one path per fixed-price service
  (`/api/x402/discover/{service_id}`), each GET carrying `x-payment-info`
  (`price.mode=fixed`, `protocols:[{x402:{}}]`), a `requestBody` input schema, and
  `402`/`200` responses. This is the primary, fully-parsed surface.
- `GET /.well-known/x402` -- `{ version:1, resources:[ ...discover URL strings ] }`
  (x402scan fan-out compatibility format; `resources` are bare URL strings).
- `GET /api/x402/discover/{service_id}` (and `?service_id=`) -- runtime HTTP 402
  **x402 v2** challenge. x402scan registration HARD-REJECTS v1 (`x402 v1 response
  detected -- migrate to v2 spec`); the single discriminator it checks is
  `x402Version === 2`. Envelope: `x402Version:2`, `error`, non-empty `accepts[]`
  (`network` CAIP-2 `eip155:8453` / `solana:5eykt4...`, `amount` (NOT
  `maxAmountRequired`), bare `asset`, `payTo`, `maxTimeoutSeconds`, `extra` with the
  EIP-3009 USDC domain on Base), a top-level `resource` object, and
  `extensions.bazaar` with the I/O schema at BOTH `info.input`/`info.output` (read
  by x402scan) and `schema.properties.input.properties.body` /
  `schema.properties.output.properties.example` (read by @agentcash/discovery). The
  same envelope is also emitted base64-encoded in the `Payment-Required` response
  header (v2-native transport). Built by `buildX402ChallengeResponse` in `x402.ts`.
  NOTE: `buildPaymentRequiredResponse` (orders/register/pay) stays v1 -- those are
  the fulfillment side, not discovery-probed; only the discover challenge is v2.

Validate after deploy:

```bash
npx -y @agentcash/discovery atelierai.xyz -v
```

Expected: source `openapi`, one `paid … [x402]` route per fixed-price service, and
**0 errors / 0 warnings** (the v2 migration also clears the old
`X402_VERSION_V1_NOT_SUPPORTED` warning).

## Directory submission checklist (do today)

These directories index x402 resources independently of CDP Bazaar.

Canonical URLs to submit:
- OpenAPI spec: `https://atelierai.xyz/openapi.json`
- Well-known resource list: `https://atelierai.xyz/.well-known/x402`
- Service catalog: `https://atelierai.xyz/api/x402/services`
- Bazaar discovery feed: `https://atelierai.xyz/api/x402/bazaar`
- MCP endpoint: `https://atelierai.xyz/api/x402/mcp`

Actions:
- [ ] x402scan -- "Add Server" with the bare origin `atelierai.xyz` (auto-discovers
      via `/openapi.json`), or "Register This URL Only" with individual
      `https://atelierai.xyz/api/x402/discover/{service_id}` URLs.
- [ ] Submit to `x402.direct` -- `/openapi.json` and `/api/x402/services`.
- [ ] Submit to `x402-list.com` -- `/openapi.json` and `/api/x402/services`.
- [ ] `x402list.fun` -- no manual action; it auto-mirrors once Atelier is in CDP
      Bazaar (i.e., after the cutover above).

Ready-to-paste:
- OpenAPI URL: `https://atelierai.xyz/openapi.json`
- Service catalog URL: `https://atelierai.xyz/api/x402/services`
- MCP URL: `https://atelierai.xyz/api/x402/mcp`
