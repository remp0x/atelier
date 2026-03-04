import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
  ParsedTransactionWithMeta,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getServerConnection, ATELIER_PUBKEY } from './solana-server';
import {
  upsertFeeIndexEntry,
  getIndexCursor,
  upsertIndexCursor,
  getTotalIndexedWithdrawals,
} from './atelier-db';

export { getTotalIndexedWithdrawals };

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_AMM_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');

const TX_BATCH_SIZE = 5;
const SIGS_PER_PAGE = 1000;

type VaultType = 'pump' | 'pump_amm';

interface VaultConfig {
  type: VaultType;
  address: PublicKey;
  isTokenAccount: boolean;
}

function derivePumpVault(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), ATELIER_PUBKEY.toBuffer()],
    PUMP_PROGRAM_ID,
  )[0];
}

function deriveAmmVaultAta(): PublicKey {
  const authority = PublicKey.findProgramAddressSync(
    [Buffer.from('creator_vault'), ATELIER_PUBKEY.toBuffer()],
    PUMP_AMM_PROGRAM_ID,
  )[0];
  return getAssociatedTokenAddressSync(NATIVE_MINT, authority, true, TOKEN_PROGRAM_ID);
}

function getVaults(): VaultConfig[] {
  return [
    { type: 'pump', address: derivePumpVault(), isTokenAccount: false },
    { type: 'pump_amm', address: deriveAmmVaultAta(), isTokenAccount: true },
  ];
}

async function fetchSignaturesPage(
  connection: Connection,
  address: PublicKey,
  before?: string,
  until?: string,
): Promise<ConfirmedSignatureInfo[]> {
  return connection.getSignaturesForAddress(address, {
    limit: SIGS_PER_PAGE,
    before,
    until,
  });
}

function detectWithdrawal(
  tx: ParsedTransactionWithMeta,
  vaultAddress: PublicKey,
  isTokenAccount: boolean,
): number {
  if (!tx.meta || tx.meta.err) return 0;

  if (isTokenAccount) {
    const vaultStr = vaultAddress.toBase58();
    const pre = tx.meta.preTokenBalances ?? [];
    const post = tx.meta.postTokenBalances ?? [];

    const keys = tx.transaction.message.accountKeys.map((k) =>
      typeof k === 'string' ? k : 'pubkey' in k ? k.pubkey.toBase58() : String(k),
    );

    const preEntry = pre.find((b) => keys[b.accountIndex] === vaultStr);
    const postEntry = post.find((b) => keys[b.accountIndex] === vaultStr);

    const preBal = preEntry ? Number(preEntry.uiTokenAmount.amount) : 0;
    const postBal = postEntry ? Number(postEntry.uiTokenAmount.amount) : 0;

    if (preBal > postBal) return preBal - postBal;
    return 0;
  }

  const keys = tx.transaction.message.accountKeys.map((k) =>
    typeof k === 'string' ? k : 'pubkey' in k ? k.pubkey.toBase58() : String(k),
  );
  const vaultIdx = keys.indexOf(vaultAddress.toBase58());
  if (vaultIdx === -1) return 0;

  const preBal = tx.meta.preBalances[vaultIdx];
  const postBal = tx.meta.postBalances[vaultIdx];
  if (preBal > postBal) return preBal - postBal;
  return 0;
}

async function batchGetTransactions(
  connection: Connection,
  signatures: string[],
): Promise<(ParsedTransactionWithMeta | null)[]> {
  const results: (ParsedTransactionWithMeta | null)[] = [];
  for (let i = 0; i < signatures.length; i += TX_BATCH_SIZE) {
    const batch = signatures.slice(i, i + TX_BATCH_SIZE);
    const txs = await Promise.all(
      batch.map((sig) =>
        connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 }),
      ),
    );
    results.push(...txs);
  }
  return results;
}

interface IndexResult {
  vault_type: VaultType;
  signatures_processed: number;
  withdrawals_found: number;
  total_withdrawal_lamports: number;
}

async function indexVault(
  connection: Connection,
  vault: VaultConfig,
  mode: 'backfill' | 'incremental',
): Promise<IndexResult> {
  const cursor = await getIndexCursor(vault.type);
  const result: IndexResult = {
    vault_type: vault.type,
    signatures_processed: 0,
    withdrawals_found: 0,
    total_withdrawal_lamports: 0,
  };

  if (mode === 'backfill') {
    if (cursor?.fully_backfilled) return result;

    let before = cursor?.last_signature ?? undefined;
    let newestSig = cursor?.newest_signature ?? undefined;

    while (true) {
      const sigs = await fetchSignaturesPage(connection, vault.address, before);
      if (sigs.length === 0) {
        await upsertIndexCursor({
          vault_type: vault.type,
          fully_backfilled: true,
          ...(newestSig ? { newest_signature: newestSig } : {}),
        });
        break;
      }

      if (!newestSig) newestSig = sigs[0].signature;

      const txSigs = sigs.map((s) => s.signature);
      const txs = await batchGetTransactions(connection, txSigs);

      for (let i = 0; i < sigs.length; i++) {
        const tx = txs[i];
        if (!tx) continue;

        const amount = detectWithdrawal(tx, vault.address, vault.isTokenAccount);
        if (amount > 0) {
          await upsertFeeIndexEntry({
            vault_type: vault.type,
            tx_signature: sigs[i].signature,
            amount_lamports: amount,
            block_time: sigs[i].blockTime ?? null,
            slot: sigs[i].slot,
          });
          result.withdrawals_found++;
          result.total_withdrawal_lamports += amount;
        }
      }

      result.signatures_processed += sigs.length;
      before = sigs[sigs.length - 1].signature;

      await upsertIndexCursor({
        vault_type: vault.type,
        last_signature: before,
        newest_signature: newestSig,
      });

      if (sigs.length < SIGS_PER_PAGE) {
        await upsertIndexCursor({ vault_type: vault.type, fully_backfilled: true });
        break;
      }
    }
  } else {
    const until = cursor?.newest_signature ?? undefined;
    let before: string | undefined;
    let newestSig: string | undefined;

    while (true) {
      const sigs = await fetchSignaturesPage(connection, vault.address, before, until);
      if (sigs.length === 0) break;

      if (!newestSig) newestSig = sigs[0].signature;

      const txSigs = sigs.map((s) => s.signature);
      const txs = await batchGetTransactions(connection, txSigs);

      for (let i = 0; i < sigs.length; i++) {
        const tx = txs[i];
        if (!tx) continue;

        const amount = detectWithdrawal(tx, vault.address, vault.isTokenAccount);
        if (amount > 0) {
          await upsertFeeIndexEntry({
            vault_type: vault.type,
            tx_signature: sigs[i].signature,
            amount_lamports: amount,
            block_time: sigs[i].blockTime ?? null,
            slot: sigs[i].slot,
          });
          result.withdrawals_found++;
          result.total_withdrawal_lamports += amount;
        }
      }

      result.signatures_processed += sigs.length;
      before = sigs[sigs.length - 1].signature;

      if (sigs.length < SIGS_PER_PAGE) break;
    }

    if (newestSig) {
      await upsertIndexCursor({ vault_type: vault.type, newest_signature: newestSig });
    }
  }

  return result;
}

export async function runFeeIndex(
  mode: 'backfill' | 'incremental',
): Promise<{ results: IndexResult[]; total_indexed_lamports: number }> {
  const connection = getServerConnection();
  const vaults = getVaults();

  const results: IndexResult[] = [];
  for (const vault of vaults) {
    const r = await indexVault(connection, vault, mode);
    results.push(r);
  }

  const total_indexed_lamports = await getTotalIndexedWithdrawals();
  return { results, total_indexed_lamports };
}
