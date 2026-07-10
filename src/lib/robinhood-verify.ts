import { decodeEventLog, getAddress, type Hash, type Log } from 'viem';
import {
  getRobinhoodPublicClient,
  getRobinhoodTreasuryAddress,
  USDG_ROBINHOOD_ADDRESS,
  USDG_ROBINHOOD_DECIMALS,
  ERC20_USDC_ABI,
  type RobinhoodPublicClient,
} from '@/lib/robinhood-server';

const TX_POLL_ATTEMPTS = 8;
const TX_POLL_INTERVAL_MS = 2_500;

export interface RobinhoodVerifyResult {
  verified: boolean;
  error?: string;
}

async function fetchReceiptWithRetry(client: RobinhoodPublicClient, hash: Hash) {
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

async function fetchTransactionWithRetry(client: RobinhoodPublicClient, hash: Hash) {
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

function sumUsdgTransfersTo(logs: readonly Log[], recipient: string): bigint {
  const recipientLc = recipient.toLowerCase();
  const usdgLc = USDG_ROBINHOOD_ADDRESS.toLowerCase();
  let total = BigInt(0);

  for (const log of logs) {
    if (log.address.toLowerCase() !== usdgLc) continue;
    try {
      const decoded = decodeEventLog({
        abi: ERC20_USDC_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'Transfer') continue;
      const args = decoded.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
      if (args.to.toLowerCase() === recipientLc) {
        total += args.value;
      }
    } catch {
      // not an ERC-20 Transfer event we can decode; skip
    }
  }

  return total;
}

export async function verifyRobinhoodUsdgReceived(
  txHash: `0x${string}`,
  expectedAmountUsd: number,
): Promise<RobinhoodVerifyResult> {
  const treasury = getRobinhoodTreasuryAddress();
  if (!treasury) {
    return { verified: false, error: 'ATELIER_TREASURY_ROBINHOOD / ATELIER_TREASURY_BASE env var not set' };
  }

  const client = getRobinhoodPublicClient();
  const receipt = await fetchReceiptWithRetry(client, txHash);

  if (!receipt) {
    return { verified: false, error: 'Transaction not found after polling' };
  }

  if (receipt.status !== 'success') {
    return { verified: false, error: 'Transaction failed on-chain' };
  }

  const received = sumUsdgTransfersTo(receipt.logs, treasury);
  const expectedRaw = BigInt(Math.round(expectedAmountUsd * 10 ** USDG_ROBINHOOD_DECIMALS));

  if (received < expectedRaw) {
    const receivedUsd = Number(received) / 10 ** USDG_ROBINHOOD_DECIMALS;
    return {
      verified: false,
      error: `Insufficient payment: expected $${expectedAmountUsd}, received $${receivedUsd.toFixed(2)}`,
    };
  }

  return { verified: true };
}

export async function extractRobinhoodPayerAddress(txHash: `0x${string}`): Promise<string | null> {
  const client = getRobinhoodPublicClient();
  const tx = await fetchTransactionWithRetry(client, txHash);
  if (!tx) return null;
  try {
    return getAddress(tx.from);
  } catch {
    return null;
  }
}
