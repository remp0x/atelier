/**
 * Server-side adapter for launching agent tokens via ClawPump's partner API.
 *
 * ClawPump is the on-chain deployer; the per-launch `walletAddress` (the agent's own
 * Solana payout wallet) becomes creator-of-record and receives the 65% creator-fee share.
 * This path does NOT touch @solana/web3.js, the Atelier keypair, or pump.fun IPFS — the
 * legacy launch route handles all of that for the 'pumpfun' provider.
 *
 * Gated on the `cpk_` partner key (CLAWPUMP_API_KEY); the launch route only calls in here
 * when NEXT_PUBLIC_TOKEN_LAUNCH_PROVIDER === 'clawpump'.
 *
 * VERIFY (2026-06-15, probed live against clawpump.tech without a valid key):
 *   - CONFIRMED launch endpoint: `POST /api/v1/launch` (401 without key, 405 on GET,
 *     JSON errors, `Authorization: Bearer <api_key>`). Path updated below accordingly.
 *   - The original `POST /api/upload` + `POST /api/launch` paths 404 — they do NOT exist.
 *   - There is NO `/api/v1/upload` endpoint (404). How `/api/v1/launch` ingests the image
 *     (multipart file vs hosted imageUrl vs base64) and its exact JSON field names are NOT
 *     yet confirmed — needs the live `cpk_` key to test, or ClawPump's API reference
 *     (docs are a client-rendered SPA at agents.clawpump.tech/docs; no public openapi/llms.txt).
 *   - The image step below still assumes a separate upload call and WILL fail until the
 *     real request schema is confirmed. Do not treat the launch path as live yet.
 */

const CLAWPUMP_API_BASE = process.env.CLAWPUMP_API_BASE || 'https://clawpump.tech';
/** Confirmed live: the launch endpoint is versioned under /api/v1. */
const CLAWPUMP_LAUNCH_PATH = '/api/v1/launch';

/** Mirrors the launch route's error semantics so the catch block can map to HTTP status. */
export class ClawpumpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ClawpumpError';
  }
}

export interface ClawpumpLaunchInput {
  name: string;
  symbol: string;
  description: string;
  imageBlob: Blob;
  imageContentType: string;
  agentId: string;
  agentName: string;
  /** The agent's Solana wallet — becomes creator-of-record and receives the 65%. */
  walletAddress: string;
}

export interface ClawpumpLaunchResult {
  mintAddress: string;
  txHash: string;
  pumpUrl: string;
}

function requireApiKey(): string {
  const key = process.env.CLAWPUMP_API_KEY;
  if (!key) {
    throw new ClawpumpError('CLAWPUMP_API_KEY is not configured', 500);
  }
  return key;
}

export async function launchTokenOnClawpump(
  input: ClawpumpLaunchInput,
): Promise<ClawpumpLaunchResult> {
  const apiKey = requireApiKey();
  const authHeader = `Bearer ${apiKey}`;

  // 1. Upload the image (multipart) → { imageUrl }
  const uploadForm = new FormData();
  uploadForm.append('file', input.imageBlob, `${input.symbol}.${extFor(input.imageContentType)}`);

  let uploadRes: Response;
  try {
    uploadRes = await fetch(`${CLAWPUMP_API_BASE}/api/upload`, {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: uploadForm,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ClawpumpError('ClawPump upload timed out', 504);
    }
    throw new ClawpumpError(`ClawPump upload request failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }

  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => '');
    console.error('[clawpump] upload error:', uploadRes.status, body);
    throw new ClawpumpError(`ClawPump upload failed: ${uploadRes.status}`, 502);
  }

  const uploadData = await uploadRes.json().catch(() => ({}));
  const imageUrl: string | undefined = uploadData.imageUrl || uploadData.url;
  if (!imageUrl) {
    throw new ClawpumpError('ClawPump upload response missing imageUrl', 502);
  }

  // 2. Launch the token (JSON) → { mintAddress, txHash, pumpUrl }
  let launchRes: Response;
  try {
    launchRes = await fetch(`${CLAWPUMP_API_BASE}${CLAWPUMP_LAUNCH_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: input.name,
        symbol: input.symbol,
        description: input.description,
        imageUrl,
        agentId: input.agentId,
        agentName: input.agentName,
        walletAddress: input.walletAddress,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ClawpumpError('ClawPump launch timed out', 504);
    }
    throw new ClawpumpError(`ClawPump launch request failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }

  if (!launchRes.ok) {
    const body = await launchRes.text().catch(() => '');
    console.error('[clawpump] launch error:', launchRes.status, body);
    throw new ClawpumpError(`ClawPump launch failed: ${launchRes.status}`, 502);
  }

  const data = await launchRes.json().catch(() => ({}));
  const mintAddress: string | undefined = data.mintAddress || data.mint;
  const txHash: string | undefined = data.txHash || data.tx_hash || data.signature;
  if (!mintAddress || !txHash) {
    throw new ClawpumpError('ClawPump launch response missing mintAddress/txHash', 502);
  }
  const pumpUrl: string = data.pumpUrl || `https://pump.fun/coin/${mintAddress}`;

  return { mintAddress, txHash, pumpUrl };
}

function extFor(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}
