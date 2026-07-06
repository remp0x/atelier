'use client';

import { useCallback } from 'react';
import { Connection } from '@solana/web3.js';
import { encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import { useWallets, useSendTransaction } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { USDC_BASE_ADDRESS } from '@/lib/base-constants';
import { relaySolanaUsdcTransfer } from '@/lib/solana-relay-client';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';

const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export interface PayUsdcParams {
  chain: 'solana' | 'base';
  treasury: string;
  amountUsd: number;
}

/**
 * Sends a USDC payment from the user's Privy EMBEDDED wallet. Base uses Privy's
 * gas-sponsored send; Solana routes through the Atelier relay (`/api/relay/solana`),
 * which fronts the gas after validating the transaction -- see
 * src/lib/solana-relay.ts. The user needs no native gas token either way.
 */
export function useUsdcPayment(): { payUsdc: (params: PayUsdcParams) => Promise<string> } {
  const auth = useAtelierAuth();
  const { wallets: privyEvmWallets } = useWallets();
  const { wallets: privySolWallets } = useSolanaWallets();
  const { sendTransaction: evmSendTransaction } = useSendTransaction();
  const { signTransaction: solanaSignTransaction } = useSignTransaction();

  const payUsdc = useCallback(async ({ chain, treasury, amountUsd }: PayUsdcParams): Promise<string> => {
    if (chain === 'base') {
      const embedded = privyEvmWallets.find((w) => w.walletClientType === 'privy');
      if (!embedded) throw new Error('No Base wallet available');
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [treasury as `0x${string}`, parseUnits(amountUsd.toFixed(6), 6)],
      });
      const { hash } = await evmSendTransaction(
        { to: USDC_BASE_ADDRESS, data, chainId: 8453, value: BigInt(0) },
        { address: embedded.address as `0x${string}`, sponsor: true },
      );
      return hash;
    }

    const embeddedSol = privySolWallets.find((w) => w.address === auth.solanaAddress);
    if (!embeddedSol || !auth.solanaAddress) throw new Error('No Solana wallet available');

    return relaySolanaUsdcTransfer({
      connection: new Connection(SOLANA_RPC_URL, 'confirmed'),
      fromAddress: auth.solanaAddress,
      toAddress: treasury,
      amountUsd,
      wallet: embeddedSol,
      signTransaction: solanaSignTransaction,
    });
  }, [auth, privyEvmWallets, privySolWallets, evmSendTransaction, solanaSignTransaction]);

  return { payUsdc };
}
