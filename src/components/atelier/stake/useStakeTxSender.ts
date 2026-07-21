'use client';

import { useCallback } from 'react';
import { Connection, Transaction } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  useWallets as useSolanaWallets,
  useSignAndSendTransaction,
} from '@privy-io/react-auth/solana';
import bs58 from 'bs58';

export type StakeWalletMode = 'embedded' | 'external';

/**
 * Sign and send a staking transaction with whichever wallet the user picked:
 * the Privy embedded wallet (gas-sponsored) or an external wallet-adapter
 * wallet (Phantom, Solflare, ... -- pays its own fee). Resolves to the
 * transaction signature.
 */
export function useStakeTxSender(
  mode: StakeWalletMode,
  activeAddress: string | null,
): (tx: Transaction, connection: Connection) => Promise<string> {
  const { wallets: solWallets } = useSolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { sendTransaction } = useWallet();

  return useCallback(
    async (tx: Transaction, connection: Connection): Promise<string> => {
      if (!activeAddress) throw new Error('No wallet selected');

      if (mode === 'external') {
        return sendTransaction(tx, connection);
      }

      const wallet = solWallets.find((w) => w.address === activeAddress);
      if (!wallet) throw new Error('Embedded wallet not available');
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const result = await signAndSendTransaction({
        transaction: new Uint8Array(serialized),
        wallet,
        chain: 'solana:mainnet',
        options: { sponsor: true },
      });
      return bs58.encode(result.signature);
    },
    [mode, activeAddress, solWallets, signAndSendTransaction, sendTransaction],
  );
}
