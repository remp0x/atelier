import { PublicKey } from '@solana/web3.js';
import { getServerConnection, ATELIER_PUBKEY } from '@/lib/solana-server';
import { verifySolanaUsdcReceived } from '@/lib/solana-verify';
import { USDC_MINT } from '@/lib/solana-pay';
import {
  verifyBaseUsdcReceived,
  extractBasePayerAddress,
} from '@/lib/base-verify';
import { USDC_BASE_ADDRESS } from '@/lib/base-server';
import {
  verifyRobinhoodUsdgReceived,
  extractRobinhoodPayerAddress,
} from '@/lib/robinhood-verify';
import {
  ROBINHOOD_X402_ENABLED,
  getRobinhoodTreasuryAddress,
  USDG_ROBINHOOD_ADDRESS,
} from '@/lib/robinhood-server';
import { getApiOrigin } from '@/lib/origins';

const USDC_DECIMALS = 6;
const PLATFORM_FEE_BPS = 1000;

function getSiteOrigin(): string {
  return getApiOrigin();
}

export type PaymentChain = 'solana' | 'base' | 'robinhood';
export type X402Network = 'solana-mainnet' | 'base-mainnet' | 'robinhood-mainnet';

export interface PaymentRequirements {
  version: '1';
  scheme: 'exact';
  network: X402Network;
  asset: {
    currency: 'USDC' | 'USDG';
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
const EVM_TX_REGEX = /^0x[a-fA-F0-9]{64}$/;

// An EVM tx hash is ambiguous between Base and Robinhood Chain; without an
// explicit X-Payment-Network hint it resolves to Base.
export function detectChainFromTxRef(txRef: string): PaymentChain | null {
  const trimmed = txRef.trim();
  if (EVM_TX_REGEX.test(trimmed)) return 'base';
  if (SOLANA_TX_REGEX.test(trimmed)) return 'solana';
  return null;
}

export function supportedPaymentChains(): PaymentChain[] {
  return ROBINHOOD_X402_ENABLED ? ['solana', 'base', 'robinhood'] : ['solana', 'base'];
}

export function parsePaymentChain(value: string | null | undefined): PaymentChain | null {
  if (!value) return null;
  return supportedPaymentChains().includes(value as PaymentChain) ? (value as PaymentChain) : null;
}

export function paymentMethodForChain(chain: PaymentChain): string {
  if (chain === 'base') return 'usdc-base';
  if (chain === 'robinhood') return 'usdg-robinhood';
  return 'usdc-sol';
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

  if (chain === 'robinhood') {
    if (!ROBINHOOD_X402_ENABLED) {
      throw new Error('Robinhood Chain x402 rail is not enabled (ROBINHOOD_X402_ENABLED)');
    }
    const treasury = getRobinhoodTreasuryAddress();
    if (!treasury) {
      throw new Error('ATELIER_TREASURY_ROBINHOOD / ATELIER_TREASURY_BASE env var not set; cannot build Robinhood Chain payment requirements');
    }
    return {
      version: '1',
      scheme: 'exact',
      network: 'robinhood-mainnet',
      asset: { currency: 'USDG', address: USDG_ROBINHOOD_ADDRESS },
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
      'X-Payment-Asset': requirements.asset.currency,
    },
  });
}

export const X402_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    brief: { type: 'string', description: 'Required. The work order / generation prompt -- what you want the agent to produce. A paid hire with no brief is rejected. Also accepted via ?brief= query param or X-Atelier-Brief header so it survives x402 payment replay.' },
    requirements: { type: 'object', description: 'Structured requirement fields for the service. May substitute for brief on services that use them.' },
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

// CAIP-2 network identifiers (x402 v2 wire format). Solana mainnet uses its genesis hash.
const CAIP2_NETWORK: Record<X402Network, string> = {
  'base-mainnet': 'eip155:8453',
  'robinhood-mainnet': 'eip155:4663',
  'solana-mainnet': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
};

// Base USDC EIP-712 domain, matching the proven CDP settlement path (cdp-facilitator.ts).
const BASE_USDC_EIP3009_EXTRA = { assetTransferMethod: 'eip3009', name: 'USD Coin', version: '2' } as const;

/**
 * x402 v2 payment-requirement entry (Coinbase Bazaar / x402scan wire format): `network` is
 * CAIP-2, the amount field is `amount` (renamed from v1 `maxAmountRequired`), `asset` is the
 * bare token-contract/mint string, and resource/description/mimeType live at the top level of
 * the envelope (not on the entry). Distinct from our internal `PaymentRequirements`.
 */
export interface X402AcceptV2 {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

function toX402AcceptV2(req: PaymentRequirements): X402AcceptV2 {
  return {
    scheme: req.scheme,
    network: CAIP2_NETWORK[req.network] ?? req.network,
    amount: req.maxAmountRequired,
    asset: req.asset.address,
    payTo: req.payTo,
    maxTimeoutSeconds: X402_MAX_TIMEOUT_SECONDS,
    extra: req.network === 'base-mainnet' ? { ...BASE_USDC_EIP3009_EXTRA } : {},
  };
}

/**
 * Builds an x402 **v2** HTTP 402 challenge (the format x402scan / Coinbase Bazaar require;
 * v1 responses are rejected on registration). Envelope: `x402Version: 2`, a non-empty
 * `accepts` array (CAIP-2 network, `amount`, bare `asset`, `extra`), a top-level `resource`
 * object, and `extensions.bazaar` carrying the input/output schemas both at `info.*` (read by
 * x402scan) and under `schema.properties.input.properties.body` /
 * `schema.properties.output.properties.example` (read by @agentcash/discovery). The same
 * envelope is emitted in the base64 `Payment-Required` response header (v2-native transport)
 * and as the JSON body. See docs/x402-bazaar-setup.md and https://x402scan.com/discovery/spec.
 */
export function buildX402ChallengeResponse(params: {
  requirements: PaymentRequirements[];
  resourceUrl: string;
  name: string;
  description: string;
  input?: unknown;
  output?: unknown;
}): Response {
  if (params.requirements.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'No payment rail configured for this resource' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const input = params.input ?? X402_INPUT_SCHEMA;
  const output = params.output ?? X402_OUTPUT_SCHEMA;

  const body = {
    x402Version: 2,
    error: 'X-PAYMENT header is required',
    accepts: params.requirements.map(toX402AcceptV2),
    resource: {
      url: params.resourceUrl,
      description: params.description,
      mimeType: 'application/json',
    },
    extensions: {
      bazaar: {
        info: { name: params.name, input, output },
        schema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            input: { type: 'object', properties: { body: input } },
            output: { type: 'object', properties: { example: output } },
          },
        },
      },
    },
  };

  const serialized = JSON.stringify(body);

  return new Response(serialized, {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'Payment-Required': Buffer.from(serialized).toString('base64'),
    },
  });
}

export function parseX402Header(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (EVM_TX_REGEX.test(trimmed)) return trimmed;
  if (SOLANA_TX_REGEX.test(trimmed)) return trimmed;
  return null;
}

export function networkToChain(network: string | null | undefined): PaymentChain | null {
  if (!network) return null;
  const normalized = network.toLowerCase().trim();
  if (normalized === 'base-mainnet' || normalized === 'base' || normalized === 'eip155:8453') return 'base';
  if (normalized === 'robinhood-mainnet' || normalized === 'robinhood' || normalized === 'eip155:4663') return 'robinhood';
  if (normalized === 'solana-mainnet' || normalized === 'solana' || normalized.startsWith('solana:')) return 'solana';
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
      if (!EVM_TX_REGEX.test(txRef)) {
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

    if (chain === 'robinhood') {
      if (!EVM_TX_REGEX.test(txRef)) {
        return { verified: false, payerWallet: null, chain, error: 'Invalid Robinhood Chain transaction hash format' };
      }
      const txHash = txRef as `0x${string}`;
      const result = await verifyRobinhoodUsdgReceived(txHash, expectedTotalUsd);
      if (!result.verified) {
        return { verified: false, payerWallet: null, chain, error: result.error };
      }
      const payerWallet = await extractRobinhoodPayerAddress(txHash);
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
