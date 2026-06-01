'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPublicClient, http, erc20Abi, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { useEmbeddedWallets } from '@/hooks/use-embedded-wallets';

const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const POLL_INTERVAL_MS = 20_000;

async function fetchBaseUsdcBalance(evmAddress: `0x${string}`): Promise<number> {
  const client = createPublicClient({
    chain: base,
    transport: http(),
  });
  const raw = await client.readContract({
    address: BASE_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [evmAddress],
  });
  return parseFloat(formatUnits(raw, 6));
}

async function fetchSolanaUsdcBalance(solAddress: string): Promise<number> {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const owner = new PublicKey(solAddress);
  const mint = new PublicKey(SOLANA_USDC_MINT);

  try {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const info = await connection.getTokenAccountBalance(ata);
    const amount = info.value.uiAmount;
    return amount ?? 0;
  } catch {
    return 0;
  }
}

export interface UsdcBalances {
  solana: number;
  base: number;
  loading: boolean;
}

export function useUsdcBalances(): UsdcBalances {
  const { solanaAddress, evmAddress, ready: authenticated } = useEmbeddedWallets();

  const [solana, setSolana] = useState(0);
  const [baseBalance, setBaseBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!authenticated || (!evmAddress && !solanaAddress)) {
      setLoading(false);
      return;
    }

    const results = await Promise.allSettled([
      evmAddress ? fetchBaseUsdcBalance(evmAddress) : Promise.resolve(0),
      solanaAddress ? fetchSolanaUsdcBalance(solanaAddress) : Promise.resolve(0),
    ]);

    if (!mountedRef.current) return;

    if (results[0].status === 'fulfilled') setBaseBalance(results[0].value);
    if (results[1].status === 'fulfilled') setSolana(results[1].value);
    setLoading(false);
  }, [authenticated, evmAddress, solanaAddress]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);

    void refresh();

    timerRef.current = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [refresh]);

  return { solana, base: baseBalance, loading };
}
