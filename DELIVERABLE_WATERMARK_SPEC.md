# Deliverable Watermark + Preview Gate

Protect provider work in the delivery -> acceptance flow: the buyer sees a
watermarked low-res preview, and the full-res original is only released once the
buyer accepts the delivery (status `delivered` -> `completed`).

Scope: human (UI) orders only. Agent / x402 orders settle instantly, have no
`approve` step, and are never gated -- they receive the original directly.

## Why a preview file, not just a hidden button

Vercel Blob is public-access only: every URL is a permanent, directly-fetchable
CDN link with no signed/private mode. Hiding the download button is not enough --
the clean URL would still be in the page. The real lock is: never put the
original URL in any buyer-facing response until accept; serve a separate
watermarked preview artifact instead.

The gate key is the client, not the provider: gate when the order's `client_type`
is `wallet` (human) and the viewer role is `buyer` and status is not `completed`.

## Shipped now (images + interim video)

DB:
- `order_deliverables.preview_url TEXT`
- `service_orders.deliverable_preview_url TEXT`

Image deliverables (full gate):
- On `/deliver`, `src/lib/deliverable-preview.ts#generateImagePreview` fetches the
  source (SSRF-guarded via `validateExternalUrlWithDNS`), downscales to 720px long
  edge, composites a tiled diagonal "ATELIER" watermark (sharp), uploads a webp
  preview to Blob, persists `preview_url` / `deliverable_preview_url`.
- `GET /api/orders/[id]` swaps `deliverable_url` -> `preview_url` for the buyer
  while not completed (originals never sent). Seller/admin always get the original.

Video deliverables (interim, no transcode):
- No preview file is generated (`generateDeliverablePreview` returns null for
  non-image).
- The buyer page shows the original video with a CSS tiled-watermark overlay
  (`pointer-events-none`) and no download button until accept.
- Accepted limitation: a determined buyer can read the original URL via dev tools.
  This is the gap the definitive solution closes.

## Definitive video solution

Goal: bake the watermark into a real low-res video rendition so the moving
preview matches the image behavior, and keep the original gated until accept --
identical control flow to images, only the preview artifact differs.

### Recommended: Cloudinary (drop-in)

Slots into the existing `preview_url` field and GET gate with no model change.

Flow (in `/deliver`, for `deliverable_media_type === 'video'`):
1. Keep the original in Vercel Blob exactly as today (gated; never returned to the
   buyer pre-accept).
2. Send the video to Cloudinary (upload by URL) and request a derived rendition:
   downscale (e.g. `w_640`), low quality (`q_auto:low`), and a watermark overlay
   (`l_text:...ATELIER` tiled, or `l_<logo_public_id>`). Eager transform so the
   rendition exists before the buyer loads it.
3. Store the Cloudinary derived URL as `preview_url` / `deliverable_preview_url`.
4. Extend the GET gate to also swap video `deliverable_url` -> `preview_url`
   (one-line change: drop the `=== 'image'` restriction once previews exist for
   video). On accept, the original Blob URL is released as today.

Then remove the interim CSS overlay + the "video shows original" branch on the
buyer page -- video becomes identical to images.

Env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
Cost: free tier ~25 credits/mo (1 credit ~= 1GB storage / 1GB bandwidth / 1000
transformations); low order volume stays free. Bandwidth scales with buyer
preview views, not deliveries.
Runtime: do the Cloudinary call inside `/deliver` (already `maxDuration = 120`);
fall back to the interim overlay if it fails so delivery never blocks.

### Alternative: Mux

Video-first. Advantage: native signed playback URLs give true access control over
the ORIGINAL (something Vercel Blob cannot do) -- the original could live as a Mux
asset and only get a signed token after accept. Cost is per-minute encode +
per-minute delivery; heavier model change (storage moves off Blob for video).
Choose this only if streaming/HLS or hard original-access-control becomes a
requirement.

### Not chosen: self-hosted ffmpeg

Native binary on Vercel serverless risks the bundle-size limit and adds ops
burden. Revisit only if vendor cost becomes material at scale.

## Rollout

1. Add Cloudinary env + a thin `src/lib/cloudinary-preview.ts`.
2. In `generateDeliverablePreview`, branch `video` -> Cloudinary rendition.
3. Relax the GET gate to cover video once previews are non-null.
4. Remove the interim CSS overlay / original-video branch on the buyer page.
5. Backfill is optional: existing delivered (not completed) video orders can be
   reprocessed, or left on the interim overlay until accepted.
