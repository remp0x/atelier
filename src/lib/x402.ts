import { PublicKey } from '@solana/web3.js';
import { getServerConnection, ATELIER_PUBKEY } from '@/lib/solana-server';
import { verifySolanaUsdcReceived } from '@/lib/solana-verify';
import { USDC_MINT } from '@/lib/solana-pay';
import {
  verifyBaseUsdcReceived,
  extractBasePayerAddress,
} from '@/lib/base-verify';
import { USDC_BASE_ADDRESS } from '@/lib/base-server';

const USDC_DECIMALS = 6;
const PLATFORM_FEE_BPS = 1000;
const DEFAULT_SITE_ORIGIN = 'https://atelierai.xyz';

function getSiteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;
  return DEFAULT_SITE_ORIGIN;
}

export type PaymentChain = 'solana' | 'base';
export type X402Network = 'solana-mainnet' | 'base-mainnet';

export interface PaymentRequirements {
  version: '1';
  scheme: 'exact';
  network: X402Network;
  asset: {
    currency: 'USDC';
    address: string;
  };
  payTo: string;
  maxAmountRequired: string;
  description: string;
  resource: string;
}

export interface X402VerifyResult {
  verified: boolean;
  payerWallet: string | null;
  chain: PaymentChain | null;
  error?: string;
}

const SOLANA_TX_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,128}$/;
const BASE_TX_REGEX = /^0x[a-fA-F0-9]{64}$/;

export function detectChainFromTxRef(txRef: string): PaymentChain | null {
  const trimmed = txRef.trim();
  if (BASE_TX_REGEX.test(trimmed)) return 'base';
  if (SOLANA_TX_REGEX.test(trimmed)) return 'solana';
  return null;
}

export function buildFlatPaymentRequirements(params: {
  amountUsd: number;
  description: string;
  resource: string;
  chain?: PaymentChain;
}): PaymentRequirements {
  const chain: PaymentChain = params.chain ?? 'solana';
  const microUnits = Math.round(params.amountUsd * 10 ** USDC_DECIMALS);

  if (chain === 'base') {
    const treasury = process.env.ATELIER_TREASURY_BASE;
    if (!treasury) {
      throw new Error('ATELIER_TREASURY_BASE env var not set; cannot build Base payment requirements');
    }
    return {
      version: '1',
      scheme: 'exact',
      network: 'base-mainnet',
      asset: { currency: 'USDC', address: USDC_BASE_ADDRESS },
      payTo: treasury,
      maxAmountRequired: String(microUnits),
      description: params.description,
      resource: params.resource,
    };
  }

  const treasury = process.env.ATELIER_TREASURY_WALLET || ATELIER_PUBKEY.toBase58();

  return {
    version: '1',
    scheme: 'exact',
    network: 'solana-mainnet',
    asset: { currency: 'USDC', address: USDC_MINT.toBase58() },
    payTo: treasury,
    maxAmountRequired: String(microUnits),
    description: params.description,
    resource: params.resource,
  };
}

export function buildPaymentRequirements(params: {
  priceUsd: string;
  serviceTitle: string;
  serviceId: string;
  chain?: PaymentChain;
}): PaymentRequirements {
  const priceNum = parseFloat(params.priceUsd);
  const platformFee = priceNum * (PLATFORM_FEE_BPS / 10000);
  const totalUsd = priceNum + platformFee;

  return buildFlatPaymentRequirements({
    amountUsd: totalUsd,
    description: `Atelier: ${params.serviceTitle} (${params.serviceId})`,
    resource: `${getSiteOrigin()}/api/orders`,
    chain: params.chain,
  });
}

export function buildPaymentRequiredResponse(requirements: PaymentRequirements): Response {
  return new Response(JSON.stringify(requirements), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Scheme': 'exact',
      'X-Payment-Network': requirements.network,
      'X-Payment-Asset': 'USDC',
    },
  });
}

export const X402_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    brief: { type: 'string', description: 'Plain-language description of the work to perform' },
    requirements: { type: 'object', description: 'Optional structured requirement fields for the service' },
  },
  required: ['brief'],
} as const;

export const X402_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    order_id: { type: 'string' },
    status: { type: 'string' },
    result_url: { type: 'string' },
  },
} as const;

const X402_MAX_TIMEOUT_SECONDS = 120;

const CANONICAL_NETWORK: Record<X402Network, string> = {
  'solana-mainnet': 'solana',
  'base-mainnet': 'base',
};

/**
 * Canonical x402 v1 payment-requirement entry (Coinbase Bazaar / x402scan wire format):
 * `asset` is the bare token-contract string, `network` is the short id ('solana'/'base'),
 * and `outputSchema` carries the invocation input/output schemas. Distinct from our internal
 * `PaymentRequirements` (which nests `asset` as an object and uses '-mainnet' suffixes).
 */
export interface X402AcceptV1 {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  outputSchema: { input: unknown; output: unknown };
  extra?: Record<string, unknown>;
}

function toX402AcceptV1(
  req: PaymentRequirements,
  resourceUrl: string,
  input: unknown,
  output: unknown,
): X402AcceptV1 {
  const entry: X402AcceptV1 = {
    scheme: req.scheme,
    network: CANONICAL_NETWORK[req.network] ?? req.network,
    maxAmountRequired: req.maxAmountRequired,
    resource: resourceUrl,
    description: req.description,
    mimeType: 'application/json',
    payTo: req.payTo,
    maxTimeoutSeconds: X402_MAX_TIMEOUT_SECONDS,
    asset: req.asset.address,
    outputSchema: { input, output },
  };
  if (req.network === 'base-mainnet') {
    entry.extra = { name: 'USD Coin', version: '2' };
  }
  return entry;
}

/**
 * Builds an x402scan / Coinbase-Bazaar-conformant HTTP 402 challenge. The body is a
 * backward-compatible superset: it spreads the primary requirement's internal flat fields
 * (payTo/maxAmountRequired/network/asset object) for existing Atelier agent clients, and
 * adds `x402Version`, a non-empty canonical-v1 `accepts` array (asset string, short network,
 * maxTimeoutSeconds, outputSchema), and `extensions.bazaar.info` so discovery crawlers index
 * the resource as payable and invocable. See docs/x402-bazaar-setup.md and the x402scan spec.
 */
export function buildX402ChallengeResponse(params: {
  requirements: PaymentRequirements[];
  resourceUrl: string;
  name: string;
  description: string;
  input?: unknown;
  output?: unknown;
}): Response {
  const [primary] = params.requirements;
  if (!primary) {
    return new Response(
      JSON.stringify({ success: false, error: 'No payment rail configured for this resource' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const input = params.input ?? X402_INPUT_SCHEMA;
  const output = params.output ?? X402_OUTPUT_SCHEMA;
  const accepts = params.requirements.map((req) => toX402AcceptV1(req, params.resourceUrl, input, output));

  const body = {
    ...primary,
    x402Version: 1,
    accepts,
    extensions: {
      bazaar: {
        info: { name: params.name, description: params.description },
        input,
        output,
      },
    },
  };

  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Scheme': primary.scheme,
      'X-Payment-Network': primary.network,
      'X-Payment-Asset': 'USDC',
    },
  });
}

export function parseX402Header(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (BASE_TX_REGEX.test(trimmed)) return trimmed;
  if (SOLANA_TX_REGEX.test(trimmed)) return trimmed;
  return null;
}

export function networkToChain(network: string | null | undefined): PaymentChain | null {
  if (!network) return null;
  const normalized = network.toLowerCase().trim();
  if (normalized === 'base-mainnet' || normalized === 'base') return 'base';
  if (normalized === 'solana-mainnet' || normalized === 'solana') return 'solana';
  return null;
}

export async function verifyX402Payment(
  txRef: string,
  expectedTotalUsd: number,
  chainHint?: PaymentChain | null,
): Promise<X402VerifyResult> {
  const chain: PaymentChain | null = chainHint ?? detectChainFromTxRef(txRef);
  if (!chain) {
    return { verified: false, payerWallet: null, chain: null, error: 'Could not detect payment chain from transaction reference' };
  }

  try {
    if (chain === 'base') {
      if (!BASE_TX_REGEX.test(txRef)) {
        return { verified: false, payerWallet: null, chain, error: 'Invalid Base transaction hash format' };
      }
      const txHash = txRef as `0x${string}`;
      const result = await verifyBaseUsdcReceived(txHash, expectedTotalUsd);
      if (!result.verified) {
        return { verified: false, payerWallet: null, chain, error: result.error };
      }
      const payerWallet = await extractBasePayerAddress(txHash);
      if (!payerWallet) {
        return { verified: false, payerWallet: null, chain, error: 'Could not extract payer wallet from transaction' };
      }
      return { verified: true, payerWallet, chain };
    }

    const result = await verifySolanaUsdcReceived(txRef, expectedTotalUsd);
    if (!result.verified) {
      return { verified: false, payerWallet: null, chain, error: result.error };
    }
    const payerWallet = await extractSolanaPayerWallet(txRef);
    if (!payerWallet) {
      return { verified: false, payerWallet: null, chain, error: 'Could not extract payer wallet from transaction' };
    }
    return { verified: true, payerWallet, chain };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment verification failed';
    return { verified: false, payerWallet: null, chain, error: message };
  }
}

async function extractSolanaPayerWallet(txSignature: string): Promise<string | null> {
  const connection = getServerConnection();

  for (let attempt = 0; attempt < 6; attempt++) {
    const tx = await connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
    });
    if (tx) {
      const message = tx.transaction.message;
      let firstKey: PublicKey | null = null;

      if ('staticAccountKeys' in message && message.staticAccountKeys.length > 0) {
        firstKey = message.staticAccountKeys[0];
      } else if ('getAccountKeys' in message) {
        const ak = (message as { getAccountKeys: () => { get: (i: number) => PublicKey | undefined } }).getAccountKeys();
        const k = ak.get(0);
        if (k) firstKey = k;
      }

      return firstKey ? firstKey.toBase58() : null;
    }
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return null;
}

export function computeTotalWithFee(priceUsd: string): { totalUsd: number; feeUsd: number; priceUsd: number } {
  const price = parseFloat(priceUsd);
  const fee = price * (PLATFORM_FEE_BPS / 10000);
  const total = price + fee;
  return {
    priceUsd: price,
    feeUsd: Math.round(fee * 10 ** USDC_DECIMALS) / 10 ** USDC_DECIMALS,
    totalUsd: Math.round(total * 10 ** USDC_DECIMALS) / 10 ** USDC_DECIMALS,
  };
}
