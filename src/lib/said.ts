import { SAID, SAID_PROGRAM_ID } from 'said-sdk';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { getAtelierKeypair, getServerConnection } from './solana-server';

const SAID_API = 'https://api.saidprotocol.com/api';

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
