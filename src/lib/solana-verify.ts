import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { getServerConnection, ATELIER_PUBKEY } from '@/lib/solana-server';
import { USDC_MINT } from '@/lib/solana-pay';

const USDC_DECIMALS = 6;
const TX_POLL_ATTEMPTS = 8;
const TX_POLL_INTERVAL_MS = 2_500;

interface VerifyResult {
  verified: boolean;
  error?: string;
}

async function fetchTransactionWithRetry(
  connection: ReturnType<typeof getServerConnection>,
  txSignature: string,
) {
  for (let attempt = 0; attempt < TX_POLL_ATTEMPTS; attempt++) {
    const tx = await connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
    });
    if (tx) return tx;
    if (attempt < TX_POLL_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL_MS));
    }
  }
  return null;
}

export async function verifySolanaUsdcReceived(
  txSignature: string,
  expectedAmountUsd: number,
): Promise<VerifyResult> {
  const connection = getServerConnection();
  const tx = await fetchTransactionWithRetry(connection, txSignature);

  if (!tx) {
    return { verified: false, error: 'Transaction not found after polling' };
  }

  if (tx.meta?.err) {
    return { verified: false, error: 'Transaction failed on-chain' };
  }

  const treasuryWallet = process.env.ATELIER_TREASURY_WALLET || ATELIER_PUBKEY.toBase58();
  const treasuryPubkey = new PublicKey(treasuryWallet);
  const treasuryAta = await getAssociatedTokenAddress(USDC_MINT, treasuryPubkey);
  const treasuryAtaStr = treasuryAta.toBase58();

  const preBalances = tx.meta?.preTokenBalances ?? [];
  const postBalances = tx.meta?.postTokenBalances ?? [];

  const usdcMintStr = USDC_MINT.toBase58();

  const accountKeys = buildAccountKeys(tx);

  const preAmount = findTokenBalance(preBalances, treasuryAtaStr, usdcMintStr, accountKeys);
  const postAmount = findTokenBalance(postBalances, treasuryAtaStr, usdcMintStr, accountKeys);

  const delta = postAmount - preAmount;
  const expectedRaw = Math.round(expectedAmountUsd * 10 ** USDC_DECIMALS);

  if (delta < expectedRaw) {
    return {
      verified: false,
      error: `Insufficient payment: expected $${expectedAmountUsd}, received $${(delta / 10 ** USDC_DECIMALS).toFixed(2)}`,
    };
  }

  return { verified: true };
}

export async function verifySolanaUsdcPayment(
  txSignature: string,
  expectedSender: string,
  expectedAmountUsd: number,
): Promise<VerifyResult> {
  const connection = getServerConnection();
  const tx = await fetchTransactionWithRetry(connection, txSignature);

  if (!tx) {
    return { verified: false, error: 'Transaction not found after polling' };
  }

  if (tx.meta?.err) {
    return { verified: false, error: 'Transaction failed on-chain' };
  }

  const treasuryWallet = process.env.ATELIER_TREASURY_WALLET || ATELIER_PUBKEY.toBase58();
  const treasuryPubkey = new PublicKey(treasuryWallet);
  const treasuryAta = await getAssociatedTokenAddress(USDC_MINT, treasuryPubkey);
  const treasuryAtaStr = treasuryAta.toBase58();

  const preBalances = tx.meta?.preTokenBalances ?? [];
  const postBalances = tx.meta?.postTokenBalances ?? [];

  const usdcMintStr = USDC_MINT.toBase58();
  const accountKeys = buildAccountKeys(tx);

  const preAmount = findTokenBalance(preBalances, treasuryAtaStr, usdcMintStr, accountKeys);
  const postAmount = findTokenBalance(postBalances, treasuryAtaStr, usdcMintStr, accountKeys);

  const delta = postAmount - preAmount;
  const expectedRaw = Math.round(expectedAmountUsd * 10 ** USDC_DECIMALS);

  if (delta < expectedRaw) {
    return {
      verified: false,
      error: `Insufficient payment: expected $${expectedAmountUsd}, received $${(delta / 10 ** USDC_DECIMALS).toFixed(2)}`,
    };
  }

  const senderPubkey = new PublicKey(expectedSender);
  const signers = getSigners(tx);
  if (!signers.some((s) => s.equals(senderPubkey))) {
    return { verified: false, error: 'Transaction not signed by expected sender' };
  }

  return { verified: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAccountKeys(tx: any): string[] {
  const keys: string[] = [];
  const message = tx.transaction.message;

  if ('staticAccountKeys' in message) {
    for (const k of message.staticAccountKeys) {
      keys.push(k.toBase58());
    }
  } else if ('getAccountKeys' in message) {
    const ak = message.getAccountKeys();
    const len = ak.length ?? ak.keySegments?.()?.flat()?.length ?? 0;
    for (let i = 0; i < len; i++) {
      const k = ak.get(i);
      if (k) keys.push(k.toBase58());
      else keys.push('');
    }
  }

  const loaded = tx.meta?.loadedAddresses;
  if (loaded) {
    for (const addr of loaded.writable ?? []) {
      keys.push(typeof addr === 'string' ? addr : addr.toBase58());
    }
    for (const addr of loaded.readonly ?? []) {
      keys.push(typeof addr === 'string' ? addr : addr.toBase58());
    }
  }

  return keys;
}

function findTokenBalance(
  balances: Array<{ accountIndex: number; mint: string; uiTokenAmount: { amount: string } }>,
  ataAddress: string,
  mintAddress: string,
  accountKeys: string[],
): number {
  for (const b of balances) {
    if (b.mint !== mintAddress) continue;
    const accountKey = accountKeys[b.accountIndex] ?? null;
    if (accountKey === ataAddress) {
      return parseInt(b.uiTokenAmount.amount, 10);
    }
  }
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSigners(tx: any): PublicKey[] {
  const keys = buildAccountKeys(tx);
  const message = tx.transaction.message;
  const numSigners = message.header?.numRequiredSignatures ?? 1;
  const result: PublicKey[] = [];
  for (let i = 0; i < numSigners && i < keys.length; i++) {
    if (keys[i]) result.push(new PublicKey(keys[i]));
  }
  return result;
}
