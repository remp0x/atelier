import { getAddress } from 'viem';
import { getPrivyServer } from './privy-server';

export const SERVER_WALLETS_ENABLED: boolean = !!(
  process.env.PRIVY_APP_SECRET && process.env.NEXT_PUBLIC_PRIVY_APP_ID
);

export interface ProvisionedServerWallet {
  id: string;
  address: string;
}

export interface ProvisionedServerWallets {
  evm: ProvisionedServerWallet | null;
  solana: ProvisionedServerWallet | null;
}

/**
 * Create app-managed Solana + EVM server wallets for a headless (API) agent so it
 * can receive USDC payouts on both chains without a browser/Privy session.
 * Idempotent via privy-idempotency-key keyed on the caller-supplied base.
 * Best-effort: a failure on one chain returns null for that chain, never throws.
 */
export async function provisionServerWallets(idempotencyBase: string): Promise<ProvisionedServerWallets> {
  if (!SERVER_WALLETS_ENABLED) return { evm: null, solana: null };

  const privy = getPrivyServer();
  const out: ProvisionedServerWallets = { evm: null, solana: null };

  try {
    const evm = await privy.wallets().create({
      chain_type: 'ethereum',
      idempotency_key: `${idempotencyBase}-evm`,
    });
    out.evm = { id: evm.id, address: getAddress(evm.address) };
  } catch (err) {
    console.error('[privy-server-wallets] EVM create failed:', err instanceof Error ? err.message : err);
  }

  try {
    const sol = await privy.wallets().create({
      chain_type: 'solana',
      idempotency_key: `${idempotencyBase}-solana`,
    });
    out.solana = { id: sol.id, address: sol.address };
  } catch (err) {
    console.error('[privy-server-wallets] Solana create failed:', err instanceof Error ? err.message : err);
  }

  return out;
}
