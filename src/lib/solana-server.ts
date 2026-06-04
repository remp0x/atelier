import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

export const ATELIER_PUBKEY = new PublicKey(
  'EZkoXXZ5HEWdKwfv7wua7k6Dqv8aQxxHWNakq2gG2Qpb',
);

export function getAtelierKeypair(): Keypair {
  const encoded = process.env.ATELIER_PRIVATE_KEY;
  if (!encoded) throw new Error('ATELIER_PRIVATE_KEY env var not set');

  const secretKey = bs58.decode(encoded);
  const keypair = Keypair.fromSecretKey(secretKey);

  if (!keypair.publicKey.equals(ATELIER_PUBKEY)) {
    throw new Error(
      `ATELIER_PRIVATE_KEY derives pubkey ${keypair.publicKey.toBase58()}, expected ${ATELIER_PUBKEY.toBase58()}`,
    );
  }

  return keypair;
}

export function getServerConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  return new Connection(rpc, 'confirmed');
}

export async function pollTransactionConfirmation(
  connection: Connection,
  signature: string,
  timeoutMs = 60_000,
  pollIntervalMs = 2_000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value?.[0];

    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }

    if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
      return;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Transaction confirmation timed out after ${timeoutMs}ms: ${signature}`);
}

async function confirmUntilBlockhashExpiry(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  pollIntervalMs = 2_000,
): Promise<'confirmed' | 'expired'> {
  while (true) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value?.[0];

    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
      return 'confirmed';
    }

    if ((await connection.getBlockHeight('confirmed')) > lastValidBlockHeight) {
      const { value: final } = await connection.getSignatureStatuses([signature]);
      const finalStatus = final?.[0];
      if (finalStatus?.err) throw new Error(`Transaction failed: ${JSON.stringify(finalStatus.err)}`);
      if (finalStatus && (finalStatus.confirmationStatus === 'confirmed' || finalStatus.confirmationStatus === 'finalized')) {
        return 'confirmed';
      }
      return 'expired';
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

// Double-pay safety: each blockhash window has a single signed tx. Re-broadcasting that
// exact serialized tx is idempotent (the network dedupes by signature), and we only build
// a fresh tx after the previous blockhash has provably expired -- once block height passes
// lastValidBlockHeight the old tx can never land, so a rebuild cannot duplicate a transfer.
export async function sendAndConfirmServerTx(
  connection: Connection,
  instructions: TransactionInstruction[],
  keypair: Keypair,
  maxAttempts = 3,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const messageV0 = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([keypair]);
    const raw = tx.serialize();

    const signature = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 5,
    });

    const outcome = await confirmUntilBlockhashExpiry(connection, signature, lastValidBlockHeight);
    if (outcome === 'confirmed') return signature;

    lastError = new Error(`Transaction expired before confirmation (attempt ${attempt + 1}/${maxAttempts}): ${signature}`);
  }

  throw lastError ?? new Error('Transaction failed to confirm');
}
