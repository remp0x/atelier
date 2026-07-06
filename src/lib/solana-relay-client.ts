import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import { getPrivyAccessToken } from '@/lib/privy-client';
import { USDC_MINT } from '@/lib/solana-pay';

const USDC_DECIMALS = 6;

/**
 * Fee payer for the gas-sponsorship relay -- the public Atelier wallet. Clients
 * build a transaction with this as the fee payer, sign it with the user's
 * embedded wallet, and POST it to `/api/relay/solana`, which validates the
 * transaction and adds the fee-payer signature. This replaces Privy's blanket
 * `sponsor: true` (see src/lib/solana-relay.ts for the why).
 */
export const RELAY_FEE_PAYER = new PublicKey('EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb');

type SignTransactionFn<W> = (input: {
  transaction: Uint8Array;
  wallet: W;
  chain: 'solana:mainnet';
}) => Promise<{ signedTransaction: Uint8Array }>;

function usdcMicros(amountUsd: number): bigint {
  const [whole, frac = ''] = String(amountUsd).split('.');
  const padded = (frac + '0'.repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(padded);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export interface RelaySolanaUsdcParams<W> {
  connection: Connection;
  fromAddress: string;
  toAddress: string;
  amountUsd: number;
  wallet: W;
  signTransaction: SignTransactionFn<W>;
}

/**
 * Send a gas-sponsored USDC transfer from the user's embedded Solana wallet.
 *
 * The relay refuses to create Associated Token Accounts, so the recipient must
 * already hold a USDC account; this is always true for the Atelier treasury and
 * for any wallet that has received USDC before.
 */
export async function relaySolanaUsdcTransfer<W>(params: RelaySolanaUsdcParams<W>): Promise<string> {
  const { connection, fromAddress, toAddress, amountUsd, wallet, signTransaction } = params;

  const from = new PublicKey(fromAddress);
  const to = new PublicKey(toAddress);
  const senderAta = await getAssociatedTokenAddress(USDC_MINT, from);
  const recipientAta = await getAssociatedTokenAddress(USDC_MINT, to);
  const micros = usdcMicros(amountUsd);

  try {
    const senderAccount = await getAccount(connection, senderAta);
    if (senderAccount.amount < micros) {
      const have = Number(senderAccount.amount) / 10 ** USDC_DECIMALS;
      throw new Error(`Insufficient USDC balance. Need $${amountUsd.toFixed(2)}, have $${have.toFixed(2)}`);
    }
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError || err instanceof TokenInvalidAccountOwnerError) {
      throw new Error('No USDC in this wallet. Fund it with USDC on Solana first.');
    }
    throw err;
  }

  const recipientInfo = await connection.getAccountInfo(recipientAta);
  if (!recipientInfo) {
    throw new Error('Recipient has no USDC account yet. Gasless sends require the recipient to already hold USDC.');
  }

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: RELAY_FEE_PAYER,
    recentBlockhash: blockhash,
    instructions: [createTransferInstruction(senderAta, recipientAta, from, micros)],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);

  const { signedTransaction } = await signTransaction({ transaction: tx.serialize(), wallet, chain: 'solana:mainnet' });

  const token = await getPrivyAccessToken();
  const response = await fetch('/api/relay/solana', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ transaction: toBase64(signedTransaction) }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) {
    throw new Error(json?.error || 'Gas sponsorship failed');
  }

  const signature = json.data.signature as string;

  for (let i = 0; i < 40; i++) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status) {
      if (status.err) throw new Error(`Payment failed on-chain: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
        return signature;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return signature;
}
