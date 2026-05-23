import { decodeEventLog, getAddress, type Hash, type Log } from 'viem';
import {
  getBasePublicClient,
  USDC_BASE_ADDRESS,
  USDC_BASE_DECIMALS,
  ERC20_USDC_ABI,
} from '@/lib/base-server';

const TX_POLL_ATTEMPTS = 8;
const TX_POLL_INTERVAL_MS = 2_500;

export interface BaseVerifyResult {
  verified: boolean;
  error?: string;
}

async function fetchReceiptWithRetry(
  client: ReturnType<typeof getBasePublicClient>,
  hash: Hash,
) {
  for (let attempt = 0; attempt < TX_POLL_ATTEMPTS; attempt++) {
    try {
      const receipt = await client.getTransactionReceipt({ hash });
      if (receipt) return receipt;
    } catch {
      // receipt not yet available
    }
    if (attempt < TX_POLL_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL_MS));
    }
  }
  return null;
}

async function fetchTransactionWithRetry(
  client: ReturnType<typeof getBasePublicClient>,
  hash: Hash,
) {
  for (let attempt = 0; attempt < TX_POLL_ATTEMPTS; attempt++) {
    try {
      const tx = await client.getTransaction({ hash });
      if (tx) return tx;
    } catch {
      // not yet available
    }
    if (attempt < TX_POLL_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL_MS));
    }
  }
  return null;
}

function sumUsdcTransfersTo(logs: readonly Log[], treasury: string): bigint {
  const treasuryLc = treasury.toLowerCase();
  const usdcLc = USDC_BASE_ADDRESS.toLowerCase();
  let total = BigInt(0);

  for (const log of logs) {
    if (log.address.toLowerCase() !== usdcLc) continue;
    try {
      const decoded = decodeEventLog({
        abi: ERC20_USDC_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'Transfer') continue;
      const args = decoded.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
      if (args.to.toLowerCase() === treasuryLc) {
        total += args.value;
      }
    } catch {
      // not an ERC-20 Transfer event we can decode; skip
    }
  }

  return total;
}

export async function verifyBaseUsdcReceived(
  txHash: `0x${string}`,
  expectedAmountUsd: number,
): Promise<BaseVerifyResult> {
  const treasury = process.env.ATELIER_TREASURY_BASE;
  if (!treasury) {
    return { verified: false, error: 'ATELIER_TREASURY_BASE env var not set' };
  }

  const client = getBasePublicClient();
  const receipt = await fetchReceiptWithRetry(client, txHash);

  if (!receipt) {
    return { verified: false, error: 'Transaction not found after polling' };
  }

  if (receipt.status !== 'success') {
    return { verified: false, error: 'Transaction failed on-chain' };
  }

  const received = sumUsdcTransfersTo(receipt.logs, treasury);
  const expectedRaw = BigInt(Math.round(expectedAmountUsd * 10 ** USDC_BASE_DECIMALS));

  if (received < expectedRaw) {
    const receivedUsd = Number(received) / 10 ** USDC_BASE_DECIMALS;
    return {
      verified: false,
      error: `Insufficient payment: expected $${expectedAmountUsd}, received $${receivedUsd.toFixed(2)}`,
    };
  }

  return { verified: true };
}

export async function verifyBaseUsdcPayment(
  txHash: `0x${string}`,
  expectedSender: string,
  expectedAmountUsd: number,
): Promise<BaseVerifyResult> {
  const treasury = process.env.ATELIER_TREASURY_BASE;
  if (!treasury) {
    return { verified: false, error: 'ATELIER_TREASURY_BASE env var not set' };
  }

  const client = getBasePublicClient();
  const receipt = await fetchReceiptWithRetry(client, txHash);

  if (!receipt) {
    return { verified: false, error: 'Transaction not found after polling' };
  }

  if (receipt.status !== 'success') {
    return { verified: false, error: 'Transaction failed on-chain' };
  }

  const received = sumUsdcTransfersTo(receipt.logs, treasury);
  const expectedRaw = BigInt(Math.round(expectedAmountUsd * 10 ** USDC_BASE_DECIMALS));

  if (received < expectedRaw) {
    const receivedUsd = Number(received) / 10 ** USDC_BASE_DECIMALS;
    return {
      verified: false,
      error: `Insufficient payment: expected $${expectedAmountUsd}, received $${receivedUsd.toFixed(2)}`,
    };
  }

  const tx = await fetchTransactionWithRetry(client, txHash);
  if (!tx) {
    return { verified: false, error: 'Transaction not found after polling' };
  }

  if (tx.from.toLowerCase() !== expectedSender.toLowerCase()) {
    return { verified: false, error: 'Transaction not signed by expected sender' };
  }

  // Treasury must not be the originator — guard against self-transfer spoofing.
  return { verified: true };
}

/**
 * Verify a Base USDC payment whose recipient is an arbitrary wallet
 * (e.g. a skill creator), not the Atelier treasury.
 */
export async function verifyBaseUsdcSentToWallet(
  txHash: `0x${string}`,
  expectedSender: string,
  expectedRecipient: string,
  expectedAmountUsd: number,
): Promise<BaseVerifyResult> {
  const client = getBasePublicClient();
  const receipt = await fetchReceiptWithRetry(client, txHash);

  if (!receipt) return { verified: false, error: 'Transaction not found after polling' };
  if (receipt.status !== 'success') return { verified: false, error: 'Transaction failed on-chain' };

  const received = sumUsdcTransfersTo(receipt.logs, expectedRecipient);
  const expectedRaw = BigInt(Math.round(expectedAmountUsd * 10 ** USDC_BASE_DECIMALS));

  if (received < expectedRaw) {
    const receivedUsd = Number(received) / 10 ** USDC_BASE_DECIMALS;
    return {
      verified: false,
      error: `Insufficient payment: expected $${expectedAmountUsd}, received $${receivedUsd.toFixed(2)}`,
    };
  }

  const tx = await fetchTransactionWithRetry(client, txHash);
  if (!tx) return { verified: false, error: 'Transaction not found after polling' };
  if (tx.from.toLowerCase() !== expectedSender.toLowerCase()) {
    return { verified: false, error: 'Transaction not signed by expected sender' };
  }

  return { verified: true };
}

export async function extractBasePayerAddress(txHash: `0x${string}`): Promise<string | null> {
  const client = getBasePublicClient();
  const tx = await fetchTransactionWithRetry(client, txHash);
  if (!tx) return null;
  try {
    return getAddress(tx.from);
  } catch {
    return null;
  }
}
