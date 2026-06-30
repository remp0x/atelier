import { SAID, SAID_PROGRAM_ID } from 'said-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { getAtelierKeypair, getServerConnection, sendAndConfirmServerTx } from './solana-server';

const SAID_API = 'https://api.saidprotocol.com/api';

// SAID's on-chain agent account is 263 bytes (AGENT_ACCOUNT_SIZE in said-sdk). The
// register instruction debits this account's rent from the owner wallet, so we fund
// the owner with exactly that rent plus a small fee buffer -- the SDK's createAgent
// transfers 2x and strands ~one rent's worth of SOL in a throwaway wallet.
const SAID_AGENT_ACCOUNT_SIZE = 263;
const FEE_BUFFER_LAMPORTS = 10_000;

export interface SAIDCreateResult {
  walletAddress: string;
  secretKey: string;
  agentPDA: string;
  txSignature: string;
}

export async function createSAIDAgent(
  agentId: string,
  metadataUri: string
): Promise<SAIDCreateResult> {
  const connection = getServerConnection();
  const funder = getAtelierKeypair();

  const said = new SAID({
    rpcUrl: connection.rpcEndpoint,
    commitment: 'confirmed',
  });

  const result = await said.createAgent(
    { name: agentId },
    funder,
    metadataUri,
  );

  return {
    walletAddress: result.walletAddress,
    secretKey: result.secretKey,
    agentPDA: result.agentPDA,
    txSignature: result.txSignature,
  };
}

// Drain a partially-funded owner wallet back to the treasury when registration fails,
// so a failed mint never strands SOL in a wallet we won't persist. Treasury pays the
// fee, so the owner wallet can be emptied to zero.
async function reclaimUnusedFunding(
  connection: Connection,
  funder: Keypair,
  wallet: Keypair,
): Promise<void> {
  const balance = await connection.getBalance(wallet.publicKey);
  if (balance === 0) return;

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: funder.publicKey,
      lamports: balance,
    }),
  );
  tx.feePayer = funder.publicKey;
  await sendAndConfirmTransaction(connection, tx, [funder, wallet], { commitment: 'confirmed' });
}

// Lean variant of createSAIDAgent: funds the generated owner wallet with just the
// register rent (+ buffer) instead of the SDK's 2x over-fund, then registers via the
// public registerAgent (treasury stays the fee payer). Halves the SOL each mint costs.
export async function createSAIDAgentLean(
  agentId: string,
  metadataUri: string,
): Promise<SAIDCreateResult> {
  const connection = getServerConnection();
  const funder = getAtelierKeypair();

  const said = new SAID({
    rpcUrl: connection.rpcEndpoint,
    commitment: 'confirmed',
  });

  const wallet = said.generateWallet();
  const rentExempt = await connection.getMinimumBalanceForRentExemption(SAID_AGENT_ACCOUNT_SIZE);

  await sendAndConfirmServerTx(
    connection,
    [
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: wallet.publicKey,
        lamports: rentExempt + FEE_BUFFER_LAMPORTS,
      }),
    ],
    funder,
  );

  try {
    const { agentPDA, txSignature } = await said.registerAgent(wallet, metadataUri, funder);
    return {
      walletAddress: wallet.publicKey.toBase58(),
      secretKey: bs58.encode(wallet.secretKey),
      agentPDA,
      txSignature,
    };
  } catch (err) {
    await reclaimUnusedFunding(connection, funder, wallet).catch((reclaimErr) => {
      console.error(`SAID mint reclaim failed for ${agentId}:`, reclaimErr);
    });
    throw err;
  }
}

export async function lookupSAIDAgent(wallet: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${SAID_API}/agents/${wallet}`);
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

export async function submitSAIDFeedback(
  toWallet: string,
  score: number,
  comment?: string,
): Promise<{ success: boolean; error?: string }> {
  const treasuryKeypair = getAtelierKeypair();
  const fromWallet = treasuryKeypair.publicKey.toBase58();
  const timestamp = Date.now();

  const message = `SAID:feedback:${toWallet}:${score}:${timestamp}`;
  const msgBytes = new TextEncoder().encode(message);
  const signature = bs58.encode(nacl.sign.detached(msgBytes, treasuryKeypair.secretKey));

  const res = await fetch(`${SAID_API}/agents/${toWallet}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromWallet,
      score,
      signature,
      timestamp,
      comment,
      source: 'atelier',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `SAID feedback failed (${res.status}): ${body}` };
  }

  return { success: true };
}

export async function isSAIDRegistered(wallet: string): Promise<boolean> {
  const connection = getServerConnection();
  const ownerKey = new PublicKey(wallet);
  const [agentPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), ownerKey.toBuffer()],
    SAID_PROGRAM_ID,
  );
  const accountInfo = await connection.getAccountInfo(agentPDA);
  return accountInfo !== null && accountInfo.owner.equals(SAID_PROGRAM_ID);
}
