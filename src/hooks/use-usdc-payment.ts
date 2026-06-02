'use client';

import { useCallback } from 'react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import { encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import bs58 from 'bs58';
import { useWallets, useSendTransaction } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { USDC_MINT, sendUsdcPayment } from '@/lib/solana-pay';
import { sendBaseUsdcPayment } from '@/lib/base-pay';
import { USDC_BASE_ADDRESS } from '@/lib/base-server';
import { useAtelierAuth } from '@/hooks/use-atelier-auth';

const SOLANA_USDC_DECIMALS = 6;
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export interface PayUsdcParams {
  chain: 'solana' | 'base';
  treasury: string;
  amountUsd: number;
}

/**
 * Sends a USDC payment from whichever wallet the user has. External wallets use
 * the normal (self-paid-gas) path; Privy EMBEDDED wallets use gas-sponsored
 * sends (Privy rewrites the fee payer / pays gas), so the user needs no native
 * gas token. Returns the on-chain signature / tx hash.
 */
export function useUsdcPayment(): { payUsdc: (params: PayUsdcParams) => Promise<string> } {
  const auth = useAtelierAuth();
  const { wallets: privyEvmWallets } = useWallets();
  const { wallets: privySolWallets } = useSolanaWallets();
  const { sendTransaction: evmSendTransaction } = useSendTransaction();
  const { signAndSendTransaction: solanaSignAndSend } = useSignAndSendTransaction();

  const payUsdc = useCallback(async ({ chain, treasury, amountUsd }: PayUsdcParams): Promise<string> => {
    if (chain === 'base') {
      const external = await auth.getEvmWalletClient();
      if (external) {
        return sendBaseUsdcPayment(external.client, external.account, treasury as `0x${string}`, amountUsd);
      }
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

    const externalSol = auth.getTransactionWallet();
    if (externalSol) {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      return sendUsdcPayment(connection, externalSol, new PublicKey(treasury), amountUsd);
    }

    const embeddedSol = privySolWallets.find((w) => w.address === auth.solanaAddress);
    if (!embeddedSol || !auth.solanaAddress) throw new Error('No Solana wallet available');

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const fromPubkey = new PublicKey(auth.solanaAddress);
    const toPubkey = new PublicKey(treasury);
    const senderAta = await getAssociatedTokenAddress(USDC_MINT, fromPubkey);
    const recipientAta = await getAssociatedTokenAddress(USDC_MINT, toPubkey);

    const [whole, frac = ''] = String(amountUsd).split('.');
    const padded = (frac + '000000').slice(0, SOLANA_USDC_DECIMALS);
    const lamports = BigInt(whole) * BigInt(10 ** SOLANA_USDC_DECIMALS) + BigInt(padded);

    try {
      const senderAccount = await getAccount(connection, senderAta);
      if (senderAccount.amount < lamports) {
        const have = Number(senderAccount.amount) / 10 ** SOLANA_USDC_DECIMALS;
        throw new Error(`Insufficient USDC balance. Need $${amountUsd.toFixed(2)}, have $${have.toFixed(2)}`);
      }
    } catch (err) {
      if (err instanceof TokenAccountNotFoundError || err instanceof TokenInvalidAccountOwnerError) {
        throw new Error('No USDC in this wallet. Fund it with USDC on Solana first.');
      }
      throw err;
    }

    const tx = new Transaction();
    const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
    if (!recipientAtaInfo) {
      tx.add(createAssociatedTokenAccountInstruction(fromPubkey, recipientAta, toPubkey, USDC_MINT));
    }
    tx.add(createTransferInstruction(senderAta, recipientAta, fromPubkey, lamports));

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;

    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const result = await solanaSignAndSend({
      transaction: new Uint8Array(serialized),
      wallet: embeddedSol,
      chain: 'solana:mainnet',
      options: { sponsor: true },
    });
    const sig = bs58.encode(result.signature);

    // Privy sponsorship rewrites the blockhash; poll status instead of confirming
    // against the original lastValidBlockHeight (avoids false "block height exceeded").
    for (let i = 0; i < 40; i++) {
      const { value } = await connection.getSignatureStatuses([sig]);
      const status = value[0];
      if (status) {
        if (status.err) throw new Error(`Payment failed on-chain: ${JSON.stringify(status.err)}`);
        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
          return sig;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return sig;
  }, [auth, privyEvmWallets, privySolWallets, evmSendTransaction, solanaSignAndSend]);

  return { payUsdc };
}
