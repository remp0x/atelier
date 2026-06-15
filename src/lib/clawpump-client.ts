/**
 * Server-side adapter for launching agent tokens via ClawPump's partner API.
 *
 * Model A (single launcher agent): every Atelier agent token is launched under ONE ClawPump
 * dashboard agent (CLAWPUMP_AGENT_ID). ClawPump custodies that agent's wallet
 * (CLAWPUMP_AGENT_WALLET) and it is the on-chain creator-of-record, so the 65% creator-fee
 * share accrues to the ClawPump-custodied wallet and is distributed to individual agents
 * off-chain (see clawpump-remittance — still BLOCKED pending partner confirmation).
 *
 * This path does NOT touch @solana/web3.js, the Atelier keypair, or pump.fun IPFS — the
 * legacy launch route handles all of that for the 'pumpfun' provider.
 *
 * Gated on the `cpk_` partner key (CLAWPUMP_API_KEY); the launch route only calls in here
 * when TOKEN_LAUNCH_PROVIDER === 'clawpump'.
 *
 * CONTRACT (confirmed 2026-06-15 against the live API + the documented request example):
 *   - `POST /api/v1/launch`, auth `Authorization: Bearer <cpk_ key>`, JSON in/out.
 *   - Body: { agentId, name, symbol, description, imageUrl }. `agentId` is a ClawPump
 *     DASHBOARD agent UUID (NOT an Atelier agent id). `imageUrl` is any public image URL —
 *     we pass the agent's avatar_url directly, so there is no separate upload step (the
 *     old `/api/upload` + `/api/launch` paths returned 404 and never existed).
 *   - ClawPump generates/custodies all agent wallets; a per-launch `walletAddress` is NOT
 *     accepted, which is why the agent's own wallet cannot be creator-of-record (model A).
 *   - Response carries a mint address and a tx signature (field names vary; handled below).
 *
 * NOTE: still untested with a real end-to-end launch (a launch mints a live token). Do one
 * supervised test launch to confirm the response shape + per-token branding before cutover.
 */

const CLAWPUMP_API_BASE = process.env.CLAWPUMP_API_BASE || 'https://clawpump.tech';
const CLAWPUMP_LAUNCH_PATH = '/api/v1/launch';

/**
 * The single ClawPump dashboard agent that launches every Atelier agent token, and its
 * ClawPump-custodied wallet (the on-chain creator-of-record). Overridable via env; defaults
 * to the live "Atelier" agent in the ClawPump dashboard.
 */
const CLAWPUMP_AGENT_ID = process.env.CLAWPUMP_AGENT_ID || 'd7b2f08b-40b5-48c0-b5d2-b74b65d666ce';
const CLAWPUMP_AGENT_WALLET =
  process.env.CLAWPUMP_AGENT_WALLET || 'DGdcq8VurFcJ3YEcvZfX6fxvJqpkzCUXXy6xDqktqnTT';

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
  /** A public image URL for the token (the Atelier agent's avatar_url). */
  imageUrl: string;
}

export interface ClawpumpLaunchResult {
  mintAddress: string;
  txHash: string;
  pumpUrl: string;
  /** The ClawPump-custodied creator-of-record wallet, stored as token_creator_wallet. */
  creatorWallet: string;
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

  let launchRes: Response;
  try {
    launchRes = await fetch(`${CLAWPUMP_API_BASE}${CLAWPUMP_LAUNCH_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agentId: CLAWPUMP_AGENT_ID,
        name: input.name,
        symbol: input.symbol,
        description: input.description,
        imageUrl: input.imageUrl,
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
    // Surface ClawPump's JSON `error` message when present, else the raw status.
    let detail = `ClawPump launch failed: ${launchRes.status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.error === 'string') detail = `ClawPump: ${parsed.error}`;
    } catch {
      // non-JSON body — keep the status-based message
    }
    throw new ClawpumpError(detail, 502);
  }

  const data = await launchRes.json().catch(() => ({}));
  const mintAddress: string | undefined = data.mintAddress || data.mint || data.tokenAddress;
  const txHash: string | undefined = data.txHash || data.tx_hash || data.signature;
  if (!mintAddress || !txHash) {
    throw new ClawpumpError('ClawPump launch response missing mint address / tx signature', 502);
  }
  const pumpUrl: string = data.pumpUrl || data.url || `https://pump.fun/coin/${mintAddress}`;

  return { mintAddress, txHash, pumpUrl, creatorWallet: CLAWPUMP_AGENT_WALLET };
}
