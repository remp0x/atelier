import { getAddress } from 'viem';
import {
  USDG_ROBINHOOD_ADDRESS,
  ROBINHOOD_CHAIN_ID,
} from '@/lib/robinhood-constants';

// Naven (facilitator.naven.network) is the first x402 facilitator supporting
// Robinhood Chain. It is 3rd-party infrastructure with no track record, so it is
// NEVER trusted as the source of truth: after a Naven settle we independently
// verify the returned transaction on-chain (robinhood-verify.ts) before an order
// is created.
//
// Wire format verified against their live stack (2026-07-10): x402 v2 only.
// Their own test resource (GET api.naven.network/x402-test/ping) serves
// `{x402Version:2, resource, accepts:[{scheme:'exact', network:'eip155:4663',
// asset:USDG, amount, payTo, maxTimeoutSeconds, extra:{name:'Global Dollar',
// version:'1'}}]}`, and /verify accepts `{x402Version:2, paymentPayload:
// {x402Version:2, resource, accepted, payload}, paymentRequirements}` --
// responding with structured isValid JSON (HTTP 402 for invalid payments).
// v1-style payloads (no `accepted`) make their server return a bare 500.
export const NAVEN_FACILITATOR_ENABLED: boolean =
  process.env.NAVEN_FACILITATOR_ENABLED === '1' || process.env.NAVEN_FACILITATOR_ENABLED === 'true';

const DEFAULT_NAVEN_URL = 'https://facilitator.naven.network';

export function navenFacilitatorUrl(): string {
  return process.env.NAVEN_FACILITATOR_URL || DEFAULT_NAVEN_URL;
}

export const ROBINHOOD_CAIP2_NETWORK = `eip155:${ROBINHOOD_CHAIN_ID}`;

// USDG EIP-712 domain on Robinhood Chain, verified against the on-chain
// DOMAIN_SEPARATOR (keccak match for name "Global Dollar", version "1",
// chainId 4663). This is what buyers sign EIP-3009 authorizations against.
export const USDG_ROBINHOOD_EIP712 = { name: 'Global Dollar', version: '1' } as const;

export interface NavenRequirementsInput {
  totalUsd: number;
  payTo: string;
  resourceUrl: string;
  description: string;
}

export interface NavenV2Requirements {
  scheme: 'exact';
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

function atomicAmount(totalUsd: number): string {
  return String(Math.round(totalUsd * 1_000_000));
}

export function buildNavenV2Requirements(params: NavenRequirementsInput): NavenV2Requirements {
  return {
    scheme: 'exact',
    network: ROBINHOOD_CAIP2_NETWORK,
    amount: atomicAmount(params.totalUsd),
    asset: USDG_ROBINHOOD_ADDRESS,
    payTo: params.payTo,
    maxTimeoutSeconds: 300,
    extra: { ...USDG_ROBINHOOD_EIP712 },
  };
}

function navenResourceInfo(params: NavenRequirementsInput) {
  return {
    url: params.resourceUrl,
    description: params.description,
    mimeType: 'application/json',
  };
}

/**
 * Buyer-facing HTTP 402 in the x402 v2 shape Naven's live stack serves and its
 * clients consume. The fields (amount / payTo / asset / extra) must match what
 * is later sent to the facilitator so the buyer's EIP-3009 signature binds to
 * the same requirements.
 */
export function buildNavenV2402Response(params: NavenRequirementsInput & { error: string }): Response {
  const serialized = JSON.stringify({
    x402Version: 2,
    error: params.error,
    resource: navenResourceInfo(params),
    accepts: [buildNavenV2Requirements(params)],
  });
  return new Response(serialized, {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'Payment-Required': Buffer.from(serialized).toString('base64'),
      'X-Payment-Scheme': 'exact',
      'X-Payment-Network': 'robinhood-mainnet',
      'X-Payment-Asset': 'USDG',
    },
  });
}

/**
 * Chain routing for decoded X-PAYMENT facilitator payloads: 'robinhood' payloads
 * go to Naven, 'base' to the CDP facilitator. Reads the network from the payload
 * envelope (v1 `network`) or its v2 `accepted` entry.
 */
export function paymentPayloadNetwork(payload: Record<string, unknown>): 'base' | 'robinhood' | null {
  const accepted = payload.accepted;
  const candidates = [
    typeof payload.network === 'string' ? payload.network : '',
    accepted && typeof accepted === 'object' && typeof (accepted as Record<string, unknown>).network === 'string'
      ? String((accepted as Record<string, unknown>).network)
      : '',
  ];
  for (const raw of candidates) {
    const net = raw.toLowerCase();
    if (!net) continue;
    if (net.includes('robinhood') || net.includes('4663')) return 'robinhood';
    if (net === 'base' || net.includes('8453') || net.includes('eip155')) return 'base';
  }
  return null;
}

/** The buyer signed the EIP-3009 authorization; its `from` is the payer wallet. */
export function extractNavenPayer(payload: Record<string, unknown>): string | null {
  const inner = payload.payload;
  if (!inner || typeof inner !== 'object') return null;
  const auth = (inner as Record<string, unknown>).authorization;
  if (!auth || typeof auth !== 'object') return null;
  const from = (auth as Record<string, unknown>).from;
  if (typeof from !== 'string') return null;
  try {
    return getAddress(from);
  } catch {
    return null;
  }
}

function buyerSignaturePayload(buyerPayload: Record<string, unknown>): unknown {
  const inner = buyerPayload.payload;
  return inner && typeof inner === 'object' ? inner : buyerPayload;
}

export interface NavenVerifyResult {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
  error?: string;
}

export interface NavenSettleResult {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
  error?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// Naven answers verify with HTTP 402 + structured JSON for an invalid payment,
// so the body is parsed at any status; only an unparseable body is an error.
async function navenPost(
  endpointPath: 'verify' | 'settle',
  buyerPayload: Record<string, unknown>,
  requirements: NavenRequirementsInput,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const endpoint = `${navenFacilitatorUrl()}/${endpointPath}`;
  const accepted = buildNavenV2Requirements(requirements);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x402Version: 2,
      paymentPayload: {
        x402Version: 2,
        resource: navenResourceInfo(requirements),
        accepted,
        payload: buyerSignaturePayload(buyerPayload),
      },
      paymentRequirements: accepted,
    }),
  });
  const parsed = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status, body: parsed };
}

export async function verifyViaNavenFacilitator(args: {
  buyerPayload: Record<string, unknown>;
  requirements: NavenRequirementsInput;
}): Promise<NavenVerifyResult> {
  if (!NAVEN_FACILITATOR_ENABLED) {
    return { isValid: false, error: 'Naven facilitator not enabled' };
  }
  try {
    const { status, body } = await navenPost('verify', args.buyerPayload, args.requirements);
    if (!body) {
      return { isValid: false, error: `Naven verify returned no parseable body (status ${status})` };
    }
    return {
      isValid: body.isValid === true,
      payer: asString(body.payer),
      invalidReason: asString(body.invalidReason) ?? asString(body.invalidMessage),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Naven verify error';
    console.error('verifyViaNavenFacilitator error:', message);
    return { isValid: false, error: message };
  }
}

export async function settleViaNavenFacilitator(args: {
  buyerPayload: Record<string, unknown>;
  requirements: NavenRequirementsInput;
}): Promise<NavenSettleResult> {
  if (!NAVEN_FACILITATOR_ENABLED) {
    return { success: false, error: 'Naven facilitator not enabled' };
  }
  try {
    const { status, body } = await navenPost('settle', args.buyerPayload, args.requirements);
    if (!body) {
      return { success: false, error: `Naven settle returned no parseable body (status ${status})` };
    }
    const transaction = asString(body.transaction) ?? asString(body.txHash) ?? asString(body.transactionHash);
    return {
      success: body.success === true && !!transaction,
      transaction,
      network: asString(body.network),
      payer: asString(body.payer),
      errorReason: asString(body.errorReason) ?? asString(body.error),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Naven settle error';
    console.error('settleViaNavenFacilitator error:', message);
    return { success: false, error: message };
  }
}

export function encodeNavenPaymentResponse(result: NavenSettleResult): string {
  return Buffer.from(
    JSON.stringify({
      success: result.success,
      transaction: result.transaction ?? '',
      network: result.network ?? 'robinhood',
      payer: result.payer ?? '',
    }),
  ).toString('base64');
}
