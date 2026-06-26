'use client';

import { useCallback } from 'react';
import { Connection } from '@solana/web3.js';
import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';
import bs58 from 'bs58';
import {
  createClient,
  getClient,
  adaptViemWallet,
  MAINNET_RELAY_API,
  type ProgressData,
  type AdaptedWallet,
} from '@relayprotocol/relay-sdk';
import { configureDynamicChains } from '@relayprotocol/relay-sdk/chain-utils';
import { adaptSolanaWallet } from '@relayprotocol/relay-svm-wallet-adapter';
import { useWallets, useSendTransaction } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { USDC_MINT } from '@/lib/solana-pay';
import { USDC_BASE_ADDRESS } from '@/lib/base-constants';

const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_DECIMALS = 6;

const RELAY_CHAIN_ID = { solana: 792703809, base: 8453 } as const;
const RELAY_USDC_CURRENCY = {
  solana: USDC_MINT.toBase58(),
  base: USDC_BASE_ADDRESS,
} as const;

export type BridgeChain = 'solana' | 'base';

export interface BridgeUsdcParams {
  fromChain: BridgeChain;
  toChain: BridgeChain;
  amountUsd: number;
  /** EXACT_INPUT spends amountUsd on the source; EXACT_OUTPUT delivers amountUsd on the destination. */
  tradeType?: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  onProgress?: (data: ProgressData) => void;
}

export interface BridgeUsdcResult {
  destinationTxHash: string | null;
}

let relayReady: Promise<void> | null = null;

function ensureRelayClient(): Promise<void> {
  if (!relayReady) {
    createClient({ baseApiUrl: MAINNET_RELAY_API, source: 'useatelier.ai' });
    relayReady = configureDynamicChains()
      .then(() => undefined)
      .catch((e) => {
        relayReady = null;
        throw e;
      });
  }
  return relayReady;
}

function usdcBaseUnits(amountUsd: number): string {
  const [whole, frac = ''] = amountUsd.toFixed(USDC_DECIMALS).split('.');
  const padded = (frac + '0'.repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return (BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(padded)).toString();
}

/**
 * Bridges native USDC between Solana and Base in either direction using Relay,
 * signing from the user's Privy embedded wallets (gas-sponsored on the Solana
 * deposit). Funds are delivered to the same user's embedded wallet on the
 * destination chain.
 */
export function useBridgeUsdc(): { bridgeUsdc: (params: BridgeUsdcParams) => Promise<BridgeUsdcResult> } {
  const { wallets: evmWallets } = useWallets();
  const { wallets: solWallets } = useSolanaWallets();
  const { signAndSendTransaction: solSignAndSend } = useSignAndSendTransaction();
  const { sendTransaction: evmSendTransaction } = useSendTransaction();

  const bridgeUsdc = useCallback(
    async ({ fromChain, toChain, amountUsd, tradeType = 'EXACT_INPUT', onProgress }: BridgeUsdcParams): Promise<BridgeUsdcResult> => {
      if (fromChain === toChain) throw new Error('Source and destination chains must differ');
      await ensureRelayClient();

      const evmEmbedded = evmWallets.find((w) => w.walletClientType === 'privy') ?? null;
      const solEmbedded = solWallets.find((w) => w.address) ?? null;
      const evmAddress = evmEmbedded?.address as `0x${string}` | undefined;
      const solanaAddress = solEmbedded?.address;

      const buildSolanaWallet = () => {
        if (!solEmbedded || !solanaAddress) throw new Error('Embedded Solana wallet not available');
        const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
        return adaptSolanaWallet(solanaAddress, RELAY_CHAIN_ID.solana, connection, async (tx) => {
          const { signature } = await solSignAndSend({
            transaction: tx.serialize(),
            wallet: solEmbedded,
            chain: 'solana:mainnet',
            options: { sponsor: true },
          });
          return { signature: bs58.encode(signature) };
        });
      };

      const buildBaseWallet = async (): Promise<AdaptedWallet> => {
        if (!evmEmbedded || !evmAddress) throw new Error('Embedded Base wallet not available');
        const provider = await evmEmbedded.getEthereumProvider();
        const walletClient = createWalletClient({ account: evmAddress, chain: base, transport: custom(provider) });
        const adapted = adaptViemWallet(walletClient, { disableCapabilitiesCheck: true });
        return {
          ...adapted,
          // Privy embedded EOAs hold no ETH, so a raw send fails with
          // "insufficient funds for gas". Route Base sends through Privy's
          // gas-sponsored sendTransaction -- same path as checkout.
          handleSendTransactionStep: async (_chainId, item) => {
            const { hash } = await evmSendTransaction(
              {
                to: item.data.to,
                data: item.data.data,
                value: item.data.value ? BigInt(item.data.value) : BigInt(0),
                chainId: base.id,
              },
              { address: evmAddress, sponsor: true },
            );
            return hash;
          },
        };
      };

      const originWallet = fromChain === 'solana' ? buildSolanaWallet() : await buildBaseWallet();
      const user = fromChain === 'solana' ? solanaAddress : evmAddress;
      if (!user) throw new Error(`Embedded ${fromChain === 'base' ? 'Base' : 'Solana'} wallet not available to send funds`);
      const recipient = toChain === 'solana' ? solanaAddress : evmAddress;
      if (!recipient) throw new Error(`Embedded ${toChain === 'base' ? 'Base' : 'Solana'} wallet not available to receive funds`);

      const client = getClient();
      const quote = await client.actions.getQuote({
        chainId: RELAY_CHAIN_ID[fromChain],
        toChainId: RELAY_CHAIN_ID[toChain],
        currency: RELAY_USDC_CURRENCY[fromChain],
        toCurrency: RELAY_USDC_CURRENCY[toChain],
        amount: usdcBaseUnits(amountUsd),
        tradeType,
        wallet: originWallet,
        user,
        recipient,
      });

      let destinationTxHash: string | null = null;
      await client.actions.execute({
        quote,
        wallet: originWallet,
        onProgress: (data) => {
          const hit = data.txHashes?.find((t) => t.chainId === RELAY_CHAIN_ID[toChain]);
          if (hit) destinationTxHash = hit.txHash;
          onProgress?.(data);
        },
      });

      return { destinationTxHash };
    },
    [evmWallets, solWallets, solSignAndSend, evmSendTransaction],
  );

  return { bridgeUsdc };
}
