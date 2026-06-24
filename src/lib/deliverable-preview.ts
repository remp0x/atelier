import sharp from 'sharp';
import { put } from '@vercel/blob';

import { validateExternalUrlWithDNS } from '@/lib/url-validation';

const PREVIEW_MAX_DIM = 720;
const PREVIEW_QUALITY = 62;
const MAX_FETCH_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const WATERMARK_TEXT = 'ATELIER';

async function fetchImageBuffer(sourceUrl: string): Promise<Buffer | null> {
  const guard = await validateExternalUrlWithDNS(sourceUrl);
  if (!guard.valid) {
    console.warn(`Preview generation blocked unsafe source URL: ${guard.error}`);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`Preview source fetch failed: ${res.status} ${sourceUrl}`);
      return null;
    }

    const declaredSize = Number(res.headers.get('content-length') || '0');
    if (declaredSize > MAX_FETCH_BYTES) {
      console.warn(`Preview source too large (${declaredSize} bytes): ${sourceUrl}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_FETCH_BYTES) {
      console.warn(`Preview source too large after read (${buffer.byteLength} bytes): ${sourceUrl}`);
      return null;
    }
    return buffer;
  } catch (error) {
    console.warn(`Preview source fetch error for ${sourceUrl}:`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function watermarkOverlay(width: number, height: number): Buffer {
  const tile = 200;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="wm" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="${Math.round(tile / 2)}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="rgba(255,255,255,0.32)" stroke="rgba(0,0,0,0.20)" stroke-width="0.6" letter-spacing="3">${WATERMARK_TEXT}</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)"/>
</svg>`;
  return Buffer.from(svg);
}

/**
 * Build a downscaled, watermarked preview of an image deliverable and upload it
 * to Blob. Returns the preview URL, or null if the source could not be processed
 * (callers treat preview generation as best-effort and must not fail delivery).
 */
export async function generateImagePreview(sourceUrl: string, orderId: string): Promise<string | null> {
  const sourceBuffer = await fetchImageBuffer(sourceUrl);
  if (!sourceBuffer) return null;

  try {
    const { data, info } = await sharp(sourceBuffer)
      .rotate()
      .resize(PREVIEW_MAX_DIM, PREVIEW_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });

    const previewBuffer = await sharp(data)
      .composite([{ input: watermarkOverlay(info.width, info.height), gravity: 'northwest' }])
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer();

    const path = `atelier/deliverables/previews/${orderId}-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
    const blob = await put(path, previewBuffer, { access: 'public', contentType: 'image/webp' });
    return blob.url;
  } catch (error) {
    console.warn(`Preview generation failed for order ${orderId}:`, error);
    return null;
  }
}

/**
 * Generate a watermarked low-res preview for a deliverable. Only image deliverables
 * are supported today; video and other types return null (video previews are gated
 * client-side until the definitive transcoding pipeline ships).
 */
export async function generateDeliverablePreview(
  sourceUrl: string,
  mediaType: string | null,
  orderId: string,
): Promise<string | null> {
  if (mediaType !== 'image') return null;
  return generateImagePreview(sourceUrl, orderId);
}
