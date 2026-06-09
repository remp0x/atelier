import 'server-only';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hash,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  type TransactionReceipt,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { base } from 'viem/chains';

export type BasePublicClient = PublicClient<HttpTransport, typeof base>;

// Re-exported for server callers that import these from base-server. Client code
// must import them from '@/lib/base-constants' instead -- this module is server-only.
export { USDC_BASE_ADDRESS, USDC_BASE_DECIMALS, BASE_CHAIN_ID, ERC20_USDC_ABI } from './base-constants';

export function getBaseRpcUrl(): string {
  return process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';
}

export function getBasePublicClient(): BasePublicClient {
  return createPublicClient({
    chain: base,
    transport: http(getBaseRpcUrl()),
  });
}

export function getAtelierBaseAccount(): PrivateKeyAccount {
  const raw = process.env.ATELIER_TREASURY_BASE_PRIVATE_KEY;
  if (!raw) throw new Error('ATELIER_TREASURY_BASE_PRIVATE_KEY env var not set');

  const expected = process.env.ATELIER_TREASURY_BASE;
  if (!expected) throw new Error('ATELIER_TREASURY_BASE env var not set');

  const pk = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);

  if (account.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `ATELIER_TREASURY_BASE_PRIVATE_KEY derives address ${account.address}, expected ${expected}`,
    );
  }

  return account;
}

export function getBaseWalletClient(): WalletClient {
  const account = getAtelierBaseAccount();
  return createWalletClient({
    account,
    chain: base,
    transport: http(getBaseRpcUrl()),
  });
}

export async function pollBaseTransaction(
  client: BasePublicClient,
  hash: Hash,
  opts?: { timeoutMs?: number; pollIntervalMs?: number; confirmations?: number },
): Promise<TransactionReceipt> {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 2_000;
  const confirmations = opts?.confirmations ?? 3;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations,
        pollingInterval: pollIntervalMs,
        timeout: Math.max(1_000, timeoutMs - (Date.now() - start)),
      });

      if (receipt.status === 'reverted') {
        throw new Error(`Transaction failed: reverted on-chain (${hash})`);
      }

      return receipt;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Transaction failed')) {
        throw err;
      }
      if (Date.now() - start >= timeoutMs) break;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  throw new Error(`Transaction confirmation timed out after ${timeoutMs}ms: ${hash}`);
}
