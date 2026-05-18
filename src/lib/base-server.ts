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

export const USDC_BASE_ADDRESS: `0x${string}` = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const USDC_BASE_DECIMALS = 6;
export const BASE_CHAIN_ID = 8453;

export const ERC20_USDC_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

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
