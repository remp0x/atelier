import type { WalletAuthPayload } from './solana-auth-client';

export interface EvmSignableWallet {
  address: `0x${string}` | null;
  signMessage: (message: string) => Promise<`0x${string}`>;
}

export async function signEvmWalletAuth(
  wallet: EvmSignableWallet,
): Promise<WalletAuthPayload & { wallet_chain: 'base' }> {
  if (!wallet.address) {
    throw new Error('EVM wallet not connected');
  }

  const walletAddress = wallet.address;
  const timestamp = Date.now();
  const message = `atelier:${walletAddress}:${timestamp}`;
  const signature = await wallet.signMessage(message);

  return {
    wallet: walletAddress,
    wallet_sig: signature,
    wallet_sig_ts: timestamp,
    wallet_chain: 'base',
  };
}
