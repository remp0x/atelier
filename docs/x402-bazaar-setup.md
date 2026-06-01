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
  `verifyViaCdpFacilitator`, `settleViaCdpFacilitator`, the CDP v1 PaymentRequirements
  builder (`buildCdpBasePaymentRequirements`), and the `X-PAYMENT` payload codec.
  Short-circuits to a no-op when keys are absent; never throws.
- `POST /api/x402/pay` -- when `?chain=base` and CDP is enabled, this is a real
  x402 resource: returns a standard 402 with CDP v1 `accepts`, accepts a base64
  `X-PAYMENT` payload, runs CDP `verify` + `settle`, then creates the order and
  pays the provider. A successful settle is what indexes the resource in Bazaar.
  The Solana / legacy tx-hash flow is unchanged and still works.
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
   will: GET -> receive the 402 with CDP v1 `accepts` -> sign the EIP-3009
   `transferWithAuthorization` -> retry with the base64 `X-PAYMENT` header.
3. The route runs CDP `verify` then `settle`. On success it returns 200 with an
   `X-PAYMENT-RESPONSE` header (base64 of `{ success, transaction, network, payer }`),
   creates the order, and pays the provider.
4. Within minutes of that first CDP-settled payment, the resource
   (`/api/x402/pay?service_id=<id>`) appears in Bazaar / agentic.market
   automatically. No manual Bazaar submission needed.

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

## Directory submission checklist (do today)

These directories index x402 resources independently of CDP Bazaar. Submit the
two canonical Atelier endpoints to each.

Canonical URLs to submit:
- Well-known manifest: `https://atelierai.xyz/.well-known/x402`
- Service catalog: `https://atelierai.xyz/api/x402/services`
- Bazaar discovery feed: `https://atelierai.xyz/api/x402/bazaar`
- MCP endpoint: `https://atelierai.xyz/api/x402/mcp`

Actions:
- [ ] Register at `x402scan.com/resources/register` -- submit the well-known
      manifest and `/api/x402/services`.
- [ ] Submit to `x402.direct` -- well-known manifest and `/api/x402/services`.
- [ ] Submit to `x402-list.com` -- well-known manifest and `/api/x402/services`.
- [ ] `x402list.fun` -- no manual action; it auto-mirrors once Atelier is in CDP
      Bazaar (i.e., after the cutover above).

Ready-to-paste:
- Service catalog URL: `https://atelierai.xyz/api/x402/services`
- MCP URL: `https://atelierai.xyz/api/x402/mcp`
