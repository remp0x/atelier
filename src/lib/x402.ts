import { PublicKey } from '@solana/web3.js';
import { getServerConnection, ATELIER_PUBKEY } from '@/lib/solana-server';
import { verifySolanaUsdcReceived } from '@/lib/solana-verify';
import { USDC_MINT } from '@/lib/solana-pay';

const USDC_DECIMALS = 6;
const PLATFORM_FEE_BPS = 1000;

export interface PaymentRequirements {
  version: '1';
  scheme: 'exact';
  network: 'solana-mainnet';
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
  error?: string;
}

export function buildPaymentRequirements(params: {
  priceUsd: string;
  serviceTitle: string;
  serviceId: string;
}): PaymentRequirements {
  const priceNum = parseFloat(params.priceUsd);
  const platformFee = priceNum * (PLATFORM_FEE_BPS / 10000);
  const totalUsd = priceNum + platformFee;
  const microUnits = Math.round(totalUsd * 10 ** USDC_DECIMALS);

  const treasury = process.env.ATELIER_TREASURY_WALLET || ATELIER_PUBKEY.toBase58();

  return {
    version: '1',
    scheme: 'exact',
    network: 'solana-mainnet',
    asset: {
      currency: 'USDC',
      address: USDC_MINT.toBase58(),
    },
    payTo: treasury,
    maxAmountRequired: String(microUnits),
    description: `Atelier: ${params.serviceTitle} (${params.serviceId})`,
    resource: `/api/orders`,
  };
}

export function buildPaymentRequiredResponse(requirements: PaymentRequirements): Response {
  return new Response(JSON.stringify(requirements), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Scheme': 'exact',
      'X-Payment-Network': 'solana-mainnet',
      'X-Payment-Asset': 'USDC',
    },
  });
}

export function parseX402Header(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!/^[A-Za-z0-9+/]{43,128}$/.test(trimmed)) return null;
  return trimmed;
}

export async function verifyX402Payment(
  txSignature: string,
  expectedTotalUsd: number,
): Promise<X402VerifyResult> {
  try {
    const result = await verifySolanaUsdcReceived(txSignature, expectedTotalUsd);
    if (!result.verified) {
      return { verified: false, payerWallet: null, error: result.error };
    }

    const payerWallet = await extractPayerWallet(txSignature);
    if (!payerWallet) {
      return { verified: false, payerWallet: null, error: 'Could not extract payer wallet from transaction' };
    }

    return { verified: true, payerWallet };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment verification failed';
    return { verified: false, payerWallet: null, error: message };
  }
}

async function extractPayerWallet(txSignature: string): Promise<string | null> {
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
  return {
    priceUsd: price,
    feeUsd: parseFloat(fee.toFixed(2)),
    totalUsd: parseFloat((price + fee).toFixed(2)),
  };
}
