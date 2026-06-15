/**
 * Server-side adapter for launching agent tokens via ClawPump's partner API.
 *
 * Model B (one ClawPump agent per Atelier agent): ClawPump enforces ONE token per dashboard
 * agent (a 2nd launch under the same agent returns 409 "already has a linked token mint"), so
 * a single shared launcher cannot serve many Atelier agents. Instead, each launch first creates
 * a dedicated ClawPump agent, then launches that agent's one token. ClawPump generates and
 * CUSTODIES each agent's wallet (a supplied walletAddress is ignored), so that per-agent
 * custodied wallet is the on-chain creator-of-record and receives the 65% creator-fee share;
 * Atelier distributes/withdraws it off-chain (see clawpump-remittance — still BLOCKED pending
 * partner confirmation of the withdrawal mechanism).
 *
 * This path does NOT touch @solana/web3.js, the Atelier keypair, or pump.fun IPFS — the
 * legacy launch route handles all of that for the 'pumpfun' provider.
 *
 * Gated on the `cpk_` partner key (CLAWPUMP_API_KEY); the launch route only calls in here
 * when TOKEN_LAUNCH_PROVIDER === 'clawpump'.
 *
 * CONTRACT (confirmed 2026-06-15 against the live API, incl. a real end-to-end launch):
 *   - Create agent: `POST /api/v1/agents` { name } -> { id, walletAddress, ... }. Only `name`
 *     is required; the wallet is ClawPump-generated/custodied.
 *   - Launch: `POST /api/v1/launch` { agentId, name, symbol, description, imageUrl } ->
 *     { status:'launched', mintAddress, txHash, pumpUrl, explorerUrl, ... }. `imageUrl` is any
 *     public URL (we pass the agent's avatar_url; there is no separate upload step). A 2nd
 *     launch under the same agentId -> 409. Gasless: requires the ClawPump launch wallet pool
 *     to hold SOL (~0.03 per launch); a 503 "Gasless wallet out of funds" surfaces otherwise.
 *   - Auth: `Authorization: Bearer <cpk_ key>`, JSON in/out.
 *   - Cleanup: `DELETE /api/v1/agents/{id}` removes an agent (used if launch fails after create).
 */

const CLAWPUMP_API_BASE = process.env.CLAWPUMP_API_BASE || 'https://clawpump.tech';
const CLAWPUMP_AGENTS_PATH = '/api/v1/agents';
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
  /** A public image URL for the token (the Atelier agent's avatar_url). */
  imageUrl: string;
}

export interface ClawpumpLaunchResult {
  mintAddress: string;
  txHash: string;
  pumpUrl: string;
  /** The per-agent ClawPump-custodied creator-of-record wallet, stored as token_creator_wallet. */
  creatorWallet: string;
  /** The dedicated ClawPump agent created for this launch (kept for later fee withdrawal). */
  clawpumpAgentId: string;
}

function requireApiKey(): string {
  const key = process.env.CLAWPUMP_API_KEY;
  if (!key) {
    throw new ClawpumpError('CLAWPUMP_API_KEY is not configured', 500);
  }
  return key;
}

/** Surface ClawPump's JSON `error` field when present, else a status-based message. */
function detailFromBody(body: string, fallback: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === 'string') return `ClawPump: ${parsed.error}`;
  } catch {
    // non-JSON body — keep the fallback
  }
  return fallback;
}

interface ClawpumpAgent {
  id: string;
  walletAddress: string;
}

/** Step 1: create a dedicated ClawPump agent (one token per agent → one agent per launch). */
async function createClawpumpAgent(name: string, authHeader: string): Promise<ClawpumpAgent> {
  let res: Response;
  try {
    res = await fetch(`${CLAWPUMP_API_BASE}${CLAWPUMP_AGENTS_PATH}`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ClawpumpError('ClawPump agent creation timed out', 504);
    }
    throw new ClawpumpError(`ClawPump agent creation failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }

  const body = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[clawpump] create-agent error:', res.status, body);
    throw new ClawpumpError(detailFromBody(body, `ClawPump agent creation failed: ${res.status}`), 502);
  }

  let data: { id?: string; walletAddress?: string };
  try {
    data = JSON.parse(body);
  } catch {
    throw new ClawpumpError('ClawPump agent creation returned a non-JSON response', 502);
  }
  if (!data.id || !data.walletAddress) {
    throw new ClawpumpError('ClawPump agent creation response missing id/walletAddress', 502);
  }
  return { id: data.id, walletAddress: data.walletAddress };
}

/** Best-effort teardown of a ClawPump agent created for a launch that then failed. */
async function deleteClawpumpAgent(agentId: string, authHeader: string): Promise<void> {
  try {
    await fetch(`${CLAWPUMP_API_BASE}${CLAWPUMP_AGENTS_PATH}/${agentId}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error('[clawpump] cleanup delete failed for agent', agentId, err);
  }
}

export async function launchTokenOnClawpump(
  input: ClawpumpLaunchInput,
): Promise<ClawpumpLaunchResult> {
  const authHeader = `Bearer ${requireApiKey()}`;

  // 1. Create a dedicated ClawPump agent for this Atelier agent's token.
  const clawpumpAgent = await createClawpumpAgent(input.name, authHeader);

  // 2. Launch the token under it. On any failure, tear the agent back down so a retry can
  //    create a fresh one (the failed agent would otherwise linger unused).
  let launchRes: Response;
  try {
    launchRes = await fetch(`${CLAWPUMP_API_BASE}${CLAWPUMP_LAUNCH_PATH}`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: clawpumpAgent.id,
        name: input.name,
        symbol: input.symbol,
        description: input.description,
        imageUrl: input.imageUrl,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    await deleteClawpumpAgent(clawpumpAgent.id, authHeader);
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ClawpumpError('ClawPump launch timed out', 504);
    }
    throw new ClawpumpError(`ClawPump launch request failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }

  if (!launchRes.ok) {
    const body = await launchRes.text().catch(() => '');
    console.error('[clawpump] launch error:', launchRes.status, body);
    await deleteClawpumpAgent(clawpumpAgent.id, authHeader);
    throw new ClawpumpError(detailFromBody(body, `ClawPump launch failed: ${launchRes.status}`), 502);
  }

  const data = await launchRes.json().catch(() => ({}));
  const mintAddress: string | undefined = data.mintAddress || data.mint || data.tokenAddress;
  const txHash: string | undefined = data.txHash || data.tx_hash || data.signature;
  if (!mintAddress || !txHash) {
    // The token may or may not have minted; do NOT delete the agent here (deleting after a
    // possible mint could orphan a live token). Surface the ambiguity instead.
    throw new ClawpumpError('ClawPump launch response missing mint address / tx signature', 502);
  }
  const pumpUrl: string = data.pumpUrl || data.url || `https://pump.fun/coin/${mintAddress}`;

  return {
    mintAddress,
    txHash,
    pumpUrl,
    creatorWallet: clawpumpAgent.walletAddress,
    clawpumpAgentId: clawpumpAgent.id,
  };
}
