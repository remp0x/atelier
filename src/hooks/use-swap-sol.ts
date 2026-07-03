'use client';

import { useCallback } from 'react';
import { useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';
import { getPrivyAccessToken } from '@/lib/privy-client';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export interface SwapUsdcToSolParams {
  amountUsd: number;
  /** Where the SOL lands. Defaults to the user's own embedded wallet. */
  receiver?: string;
}

/**
 * USDC -> SOL swap from the user's embedded wallet via Jupiter Swap v2 (proxied
 * through /api/swap/*). Jupiter auto-sponsors gas for ~$10+ swaps when the taker
 * holds no SOL, so a USDC-only wallet can still convert. The order transaction is
 * partially signed here and broadcast by Jupiter's /execute (never our RPC).
 */
export function useSwapUsdcToSol(): {
  swapUsdcToSol: (params: SwapUsdcToSolParams) => Promise<{ signature: string }>;
} {
  const { solanaAddress } = useAtelierAuth();
  const { wallets } = useSolanaWallets();
  const { signTransaction } = useSignTransaction();

  const swapUsdcToSol = useCallback(async ({ amountUsd, receiver }: SwapUsdcToSolParams): Promise<{ signature: string }> => {
    if (!solanaAddress) throw new Error('No Solana wallet available');
    const embedded = wallets.find((w) => w.address === solanaAddress);
    if (!embedded) throw new Error('Embedded Solana wallet not available');

    const privyToken = await getPrivyAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (privyToken) headers.Authorization = `Bearer ${privyToken}`;

    const orderRes = await fetch('/api/swap/order', {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount_usd: amountUsd, taker: solanaAddress, receiver }),
    });
    const orderJson = await orderRes.json();
    if (!orderRes.ok || !orderJson.success) {
      throw new Error(orderJson.error || 'Swap quote failed');
    }
    const order = orderJson.data as {
      transaction: string | null;
      requestId: string;
      errorMessage?: string;
    };
    if (!order.transaction || !order.requestId) {
      throw new Error(order.errorMessage || 'Swap unavailable for this amount. Try $10 or more.');
    }

    const { signedTransaction } = await signTransaction({
      transaction: base64ToBytes(order.transaction),
      wallet: embedded,
      chain: 'solana:mainnet',
    });

    const execRes = await fetch('/api/swap/execute', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        signed_transaction: bytesToBase64(signedTransaction),
        request_id: order.requestId,
      }),
    });
    const execJson = await execRes.json();
    if (!execRes.ok || !execJson.success) {
      throw new Error(execJson.error || 'Swap execution failed');
    }
    const exec = execJson.data as { status?: string; signature?: string; error?: string };
    if (exec.status && exec.status !== 'Success') {
      throw new Error(exec.error || `Swap failed (${exec.status})`);
    }
    return { signature: exec.signature || '' };
  }, [solanaAddress, wallets, signTransaction]);

  return { swapUsdcToSol };
}
