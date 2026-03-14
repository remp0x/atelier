import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
  ParsedTransactionWithMeta,
} from '@solana/web3.js';
import { getServerConnection, ATELIER_PUBKEY } from './solana-server';
import {
  upsertFeeIndexEntry,
  getIndexCursor,
  upsertIndexCursor,
  getTotalIndexedWithdrawals,
  resetFeeIndexCursors,
} from './atelier-db';

export { getTotalIndexedWithdrawals };

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_AMM_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const PUMP_PROGRAM_STRS = [PUMP_PROGRAM_ID.toBase58(), PUMP_AMM_PROGRAM_ID.toBase58()];

const VAULT_TYPE = 'creator_income';
const TX_BATCH_SIZE = 10;
const SIGS_PER_PAGE = 100;
const MAX_SIGS_PER_CALL = 300;

function detectCreatorFeeIncome(tx: ParsedTransactionWithMeta): number {
  if (!tx.meta || tx.meta.err) return 0;

  const keys = tx.transaction.message.accountKeys.map((k) =>
    typeof k === 'string' ? k : 'pubkey' in k ? k.pubkey.toBase58() : String(k),
  );

  const hasPumpProgram = keys.some((k) => PUMP_PROGRAM_STRS.includes(k));
  if (!hasPumpProgram) return 0;

  const walletIdx = keys.indexOf(ATELIER_PUBKEY.toBase58());
  if (walletIdx === -1) return 0;

  const preBal = tx.meta.preBalances[walletIdx];
  const postBal = tx.meta.postBalances[walletIdx];
  if (postBal > preBal) return postBal - preBal;

  return 0;
}

async function fetchSignaturesPage(
  connection: Connection,
  before?: string,
  until?: string,
): Promise<ConfirmedSignatureInfo[]> {
  return connection.getSignaturesForAddress(ATELIER_PUBKEY, {
    limit: SIGS_PER_PAGE,
    before,
    until,
  });
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

export interface IndexResult {
  vault_type: string;
  signatures_processed: number;
  withdrawals_found: number;
  total_withdrawal_lamports: number;
  done: boolean;
}

async function indexCreatorFees(
  connection: Connection,
  mode: 'backfill' | 'incremental',
): Promise<IndexResult> {
  const cursor = await getIndexCursor(VAULT_TYPE);
  const result: IndexResult = {
    vault_type: VAULT_TYPE,
    signatures_processed: 0,
    withdrawals_found: 0,
    total_withdrawal_lamports: 0,
    done: false,
  };

  if (mode === 'backfill') {
    if (cursor?.fully_backfilled) { result.done = true; return result; }

    let before = cursor?.last_signature ?? undefined;
    let newestSig = cursor?.newest_signature ?? undefined;

    while (result.signatures_processed < MAX_SIGS_PER_CALL) {
      const sigs = await fetchSignaturesPage(connection, before);
      if (sigs.length === 0) {
        await upsertIndexCursor({
          vault_type: VAULT_TYPE,
          fully_backfilled: true,
          ...(newestSig ? { newest_signature: newestSig } : {}),
        });
        result.done = true;
        break;
      }

      if (!newestSig) newestSig = sigs[0].signature;

      const txSigs = sigs.map((s) => s.signature);
      const txs = await batchGetTransactions(connection, txSigs);

      for (let i = 0; i < sigs.length; i++) {
        const tx = txs[i];
        if (!tx) continue;

        const amount = detectCreatorFeeIncome(tx);
        if (amount > 0) {
          await upsertFeeIndexEntry({
            vault_type: VAULT_TYPE,
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
        vault_type: VAULT_TYPE,
        last_signature: before,
        newest_signature: newestSig,
      });

      if (sigs.length < SIGS_PER_PAGE) {
        await upsertIndexCursor({ vault_type: VAULT_TYPE, fully_backfilled: true });
        result.done = true;
        break;
      }
    }
  } else {
    const until = cursor?.newest_signature ?? undefined;
    let before: string | undefined;
    let newestSig: string | undefined;

    while (result.signatures_processed < MAX_SIGS_PER_CALL) {
      const sigs = await fetchSignaturesPage(connection, before, until);
      if (sigs.length === 0) { result.done = true; break; }

      if (!newestSig) newestSig = sigs[0].signature;

      const txSigs = sigs.map((s) => s.signature);
      const txs = await batchGetTransactions(connection, txSigs);

      for (let i = 0; i < sigs.length; i++) {
        const tx = txs[i];
        if (!tx) continue;

        const amount = detectCreatorFeeIncome(tx);
        if (amount > 0) {
          await upsertFeeIndexEntry({
            vault_type: VAULT_TYPE,
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

      if (sigs.length < SIGS_PER_PAGE) { result.done = true; break; }
    }

    if (newestSig) {
      await upsertIndexCursor({ vault_type: VAULT_TYPE, newest_signature: newestSig });
    }
  }

  return result;
}

export async function runFeeIndex(
  mode: 'backfill' | 'incremental',
  force = false,
): Promise<{ results: IndexResult[]; total_indexed_lamports: number; done: boolean }> {
  if (force) await resetFeeIndexCursors();

  const connection = getServerConnection();

  let indexResult: IndexResult;
  try {
    indexResult = await indexCreatorFees(connection, mode);
  } catch (err) {
    console.error('Fee indexer failed:', err);
    indexResult = {
      vault_type: VAULT_TYPE,
      signatures_processed: 0,
      withdrawals_found: 0,
      total_withdrawal_lamports: 0,
      done: false,
    };
  }

  const total_indexed_lamports = await getTotalIndexedWithdrawals();
  return { results: [indexResult], total_indexed_lamports, done: indexResult.done };
}
