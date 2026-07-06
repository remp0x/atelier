import 'server-only';
import nacl from 'tweetnacl';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import {
  getAtelierKeypair,
  getServerConnection,
  ATELIER_PUBKEY,
} from '@/lib/solana-server';

/**
 * Solana gas-sponsorship relay.
 *
 * Replaces Privy's blanket `sponsor: true` (which sponsors ANY transaction and
 * was farmed for ~$145 of credits via the ATA rent-refund exploit -- see
 * https://docs.privy.io/wallets/gas-and-asset-management/gas/security). Here the
 * Atelier wallet is the fee payer, and this module co-signs ONLY transactions
 * that pass a strict policy.
 *
 * The load-bearing rule is NO SPONSORED ACCOUNT CREATION: the Associated Token
 * Account program is not on the allowlist, so we never pay ATA rent for anyone.
 * That removes the attacker's profit entirely -- a plain transfer to an existing
 * token account costs only the ~5000-lamport base fee and refunds nothing, so
 * there is nothing to farm. Auth-gating, per-user rate limits (in the route),
 * and a per-transaction amount cap are defense in depth.
 */

export const SOLANA_RELAY_ENABLED: boolean = !!process.env.ATELIER_PRIVATE_KEY;

/** Public key clients MUST set as the fee payer (index 0) of a relayed tx. */
export const RELAY_FEE_PAYER = ATELIER_PUBKEY;

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey('ComputeBudget111111111111111111111111111111');

const SPL_TRANSFER = 3;
const SPL_TRANSFER_CHECKED = 12;

const USDC_DECIMALS = 6;
const MAX_SPONSORED_USD = Number(process.env.RELAY_MAX_USD || '2000');
const MAX_SPONSORED_MICROS = BigInt(Math.round(MAX_SPONSORED_USD * 10 ** USDC_DECIMALS));

/** A transaction that violates the sponsorship policy. Maps to HTTP 400. */
export class RelayPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelayPolicyError';
  }
}

function readU64LE(data: Uint8Array, offset: number): bigint {
  if (offset + 8 > data.length) throw new RelayPolicyError('Malformed token instruction');
  let value = BigInt(0);
  let place = BigInt(1);
  for (let i = 0; i < 8; i++) {
    value = value + BigInt(data[offset + i]) * place;
    place = place * BigInt(256);
  }
  return value;
}

export interface RelayResult {
  signature: string;
}

/**
 * Validate a user-signed transaction against the sponsorship policy, add the
 * Atelier fee-payer signature, broadcast, and return the confirmed signature.
 *
 * @param serializedTxBase64 base64 v0 VersionedTransaction, fee payer = RELAY_FEE_PAYER,
 *   already signed by the user's embedded wallet.
 * @param userWallets the authenticated user's linked Solana wallet addresses --
 *   every non-fee-payer signer must be one of these, binding the sponsorship to
 *   the caller so nobody can have us pay for a stranger's transaction.
 */
export async function sponsorAndSendSolanaTx(params: {
  serializedTxBase64: string;
  userWallets: string[];
}): Promise<RelayResult> {
  if (!SOLANA_RELAY_ENABLED) throw new Error('Solana relay is not enabled');

  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(params.serializedTxBase64, 'base64'));
  } catch {
    throw new RelayPolicyError('Malformed transaction');
  }

  if (tx.version !== 0) {
    throw new RelayPolicyError('Only v0 transactions may be sponsored');
  }

  const message = tx.message;

  // Address lookup tables can hide account identities from this validator; a
  // simple USDC transfer never needs them, so reject rather than resolve.
  if (message.addressTableLookups.length > 0) {
    throw new RelayPolicyError('Address lookup tables are not allowed');
  }

  const keys = message.staticAccountKeys;
  if (!keys[0]?.equals(RELAY_FEE_PAYER)) {
    throw new RelayPolicyError('Fee payer must be the Atelier relay wallet');
  }

  const numSigners = message.header.numRequiredSignatures;
  const nonFeePayerSigners = keys.slice(1, numSigners);
  if (nonFeePayerSigners.length === 0) {
    throw new RelayPolicyError('Transaction has no user signer');
  }
  const ownedWallets = new Set(params.userWallets);
  for (const signer of nonFeePayerSigners) {
    if (!ownedWallets.has(signer.toBase58())) {
      throw new RelayPolicyError('Transaction is not signed by a wallet you own');
    }
  }

  let totalTransferMicros = BigInt(0);
  for (const ix of message.compiledInstructions) {
    const programId = keys[ix.programIdIndex];
    if (!programId) throw new RelayPolicyError('Malformed instruction');

    if (programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) continue;

    if (programId.equals(TOKEN_PROGRAM_ID)) {
      const kind = ix.data[0];
      if (kind !== SPL_TRANSFER && kind !== SPL_TRANSFER_CHECKED) {
        throw new RelayPolicyError('Only SPL token transfers may be sponsored');
      }

      // The transfer authority MUST be the caller, never the fee payer. The fee
      // payer is the Atelier treasury and it signs every relayed tx; if we let a
      // transfer be authorized by the fee payer, that same signature would
      // authorize draining the treasury's own token account.
      const authorityIndex = kind === SPL_TRANSFER
        ? ix.accountKeyIndexes[2]
        : ix.accountKeyIndexes[3];
      const authority = keys[authorityIndex];
      if (!authority || !ownedWallets.has(authority.toBase58())) {
        throw new RelayPolicyError('Transfer authority must be a wallet you own');
      }

      totalTransferMicros += readU64LE(ix.data, 1);
      continue;
    }

    // Anything else -- crucially the Associated Token Account program -- is
    // refused. No sponsored account creation means no rent to farm.
    throw new RelayPolicyError('Transaction contains a non-sponsorable instruction');
  }

  if (totalTransferMicros > MAX_SPONSORED_MICROS) {
    throw new RelayPolicyError(`Amount exceeds the $${MAX_SPONSORED_USD} sponsorship limit`);
  }

  const keypair = getAtelierKeypair();
  const signature = nacl.sign.detached(message.serialize(), keypair.secretKey);
  tx.addSignature(keypair.publicKey, signature);

  // Preflight (skipPreflight: false) simulates the tx, so a transfer that would
  // fail is rejected here rather than sponsored. We return once the cluster
  // accepts the broadcast; the client polls for confirmation.
  const connection = getServerConnection();
  const txSignature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });

  return { signature: txSignature };
}
