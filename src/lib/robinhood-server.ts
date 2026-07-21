import 'server-only';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hash,
  type HttpTransport,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_EXPLORER_URL,
  ROBINHOOD_PUBLIC_RPC_URL,
} from './robinhood-constants';

export { USDG_ROBINHOOD_ADDRESS, USDG_ROBINHOOD_DECIMALS, ROBINHOOD_CHAIN_ID } from './robinhood-constants';
export { ERC20_USDC_ABI } from './base-constants';

// Advertising the Robinhood rail is opt-in: the treasury key works there out of
// the box (same EVM account as Base), but payouts need ETH gas on chain 4663,
// so the rail stays hidden until explicitly enabled.
export const ROBINHOOD_X402_ENABLED =
  process.env.ROBINHOOD_X402_ENABLED === '1' || process.env.ROBINHOOD_X402_ENABLED === 'true';

export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_PUBLIC_RPC_URL] } },
  blockExplorers: { default: { name: 'Blockscout', url: ROBINHOOD_EXPLORER_URL } },
});

export type RobinhoodPublicClient = PublicClient<HttpTransport, typeof robinhoodChain>;

export function getRobinhoodRpcUrl(): string {
  return process.env.ROBINHOOD_RPC_URL || ROBINHOOD_PUBLIC_RPC_URL;
}

export function getRobinhoodPublicClient(): RobinhoodPublicClient {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(getRobinhoodRpcUrl()),
  });
}

// The Robinhood treasury defaults to the Base treasury: one EVM account controls
// the same address on every EVM chain, so no new wallet is required. Both can be
// overridden (ATELIER_TREASURY_ROBINHOOD / _PK) if a dedicated wallet is set up.
export function getRobinhoodTreasuryAddress(): string | null {
  return process.env.ATELIER_TREASURY_ROBINHOOD || process.env.ATELIER_TREASURY_BASE || null;
}

export function getAtelierRobinhoodAccount(): PrivateKeyAccount {
  const raw =
    process.env.ATELIER_TREASURY_ROBINHOOD_PK ||
    process.env.ATELIER_TREASURY_BASE_PK ||
    process.env.ATELIER_TREASURY_BASE_PRIVATE_KEY;
  if (!raw) throw new Error('ATELIER_TREASURY_ROBINHOOD_PK / ATELIER_TREASURY_BASE_PK env var not set');

  const expected = getRobinhoodTreasuryAddress();
  if (!expected) throw new Error('ATELIER_TREASURY_ROBINHOOD / ATELIER_TREASURY_BASE env var not set');

  const pk = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);

  if (account.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `Robinhood treasury key derives address ${account.address}, expected ${expected}`,
    );
  }

  return account;
}

export function getRobinhoodWalletClient(): WalletClient {
  const account = getAtelierRobinhoodAccount();
  return createWalletClient({
    account,
    chain: robinhoodChain,
    transport: http(getRobinhoodRpcUrl()),
  });
}

export async function pollRobinhoodTransaction(
  client: RobinhoodPublicClient,
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
