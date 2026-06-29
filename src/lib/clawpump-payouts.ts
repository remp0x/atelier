/**
 * ClawPump creator-fee payouts (custodial model).
 *
 * ClawPump pushes each agent token's 65% creator share (in SOL) to the Atelier wallet supplied at
 * launch (ATELIER_PUBKEY), attributed per ClawPump agent. This module forwards each agent its
 * accrued SOL to its payout wallet: read ClawPump's `totalSent`, subtract what Atelier has already
 * paid (the creator_fee_payouts ledger), and transfer the delta. Idempotent and crash-safe -- the
 * payout row is reserved (pending) before the transfer, so a retry or concurrent run cannot
 * double-pay; a failed transfer is marked failed so its amount is reclaimed next run.
 *
 * SOL only for now: agents whose payout wallet is on Base are skipped (bridge handled later).
 */

import { PublicKey, SystemProgram } from '@solana/web3.js';
import {
  getServerConnection,
  getAtelierKeypair,
  ATELIER_PUBKEY,
  sendAndConfirmServerTx,
} from '@/lib/solana-server';
import { getClawpumpAgentEarnings } from '@/lib/clawpump-client';
import {
  createFeePayout,
  completeFeePayout,
  failFeePayout,
  getReservedFeeLamportsForAgent,
  listClawpumpFeeAgents,
} from '@/lib/atelier-db';

const LAMPORTS_PER_SOL = 1_000_000_000;
/** Minimum claimable before a payout fires, so dust does not cost more in tx fees than it sends. */
export const MIN_CLAWPUMP_PAYOUT_LAMPORTS = 30_000_000; // 0.03 SOL
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type FeeAgent = {
  id: string;
  name?: string;
  clawpump_agent_id: string | null;
  token_mint: string | null;
  token_creator_wallet?: string | null;
  payout_wallet: string | null;
  payout_chain: string | null;
  owner_wallet: string | null;
};

/** The Solana wallet that should receive an agent's SOL creator fees, or null if none usable. */
function solanaPayoutWallet(a: FeeAgent): string | null {
  const candidate =
    a.payout_chain === 'solana' && a.payout_wallet
      ? a.payout_wallet
      : (!a.payout_chain || a.payout_chain === 'solana')
        ? a.owner_wallet
        : null;
  if (!candidate || !BASE58_RE.test(candidate)) return null;
  try {
    new PublicKey(candidate);
    return candidate;
  } catch {
    return null;
  }
}

export type ClawpumpPayoutResult = {
  agentId: string;
  status: 'paid' | 'skipped' | 'failed';
  reason?: string;
  paidLamports?: number;
  txHash?: string;
};

/** Forward one agent its accrued ClawPump creator fees. Safe to call repeatedly. */
export async function payoutAgentClawpumpFees(agent: FeeAgent): Promise<ClawpumpPayoutResult> {
  if (!agent.clawpump_agent_id || !agent.token_mint) {
    return { agentId: agent.id, status: 'skipped', reason: 'no clawpump token' };
  }
  // Legacy sponsored launches set a ClawPump-custodied wallet as creator-of-record: ClawPump
  // pushes their 65% to that wallet, never to the Atelier wallet. Paying them out from the
  // Atelier wallet would spend funds we never received, so skip them (surfaced as "stuck").
  if (agent.token_creator_wallet && agent.token_creator_wallet !== ATELIER_PUBKEY.toBase58()) {
    return { agentId: agent.id, status: 'skipped', reason: 'custodied creator wallet -- fees not pushed to Atelier' };
  }
  const target = solanaPayoutWallet(agent);
  if (!target) {
    return { agentId: agent.id, status: 'skipped', reason: 'no usable solana payout wallet' };
  }

  const earnings = await getClawpumpAgentEarnings(agent.clawpump_agent_id);
  const sentLamports = Math.floor(earnings.totalSentSol * LAMPORTS_PER_SOL);
  const reserved = await getReservedFeeLamportsForAgent(agent.id);
  const owed = sentLamports - reserved;

  if (owed < MIN_CLAWPUMP_PAYOUT_LAMPORTS) {
    return { agentId: agent.id, status: 'skipped', reason: `below threshold (owed ${owed} lamports)` };
  }

  // Reserve the payout (pending) BEFORE moving funds so a concurrent run / crash cannot double-pay.
  const payoutId = await createFeePayout(target, agent.id, agent.token_mint, owed);
  try {
    const connection = getServerConnection();
    const keypair = getAtelierKeypair();
    const transferIx = SystemProgram.transfer({
      fromPubkey: ATELIER_PUBKEY,
      toPubkey: new PublicKey(target),
      lamports: owed,
    });
    const txHash = await sendAndConfirmServerTx(connection, [transferIx], keypair);
    await completeFeePayout(payoutId, txHash);
    return { agentId: agent.id, status: 'paid', paidLamports: owed, txHash };
  } catch (err) {
    await failFeePayout(payoutId).catch(() => {});
    return { agentId: agent.id, status: 'failed', reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Forward every ClawPump-token agent its accrued fees (the daily cron entrypoint). */
export async function runClawpumpPayouts(): Promise<{
  results: ClawpumpPayoutResult[];
  paidCount: number;
  paidLamports: number;
}> {
  const agents = await listClawpumpFeeAgents();
  const results: ClawpumpPayoutResult[] = [];
  for (const agent of agents) {
    try {
      results.push(await payoutAgentClawpumpFees(agent));
    } catch (err) {
      results.push({ agentId: agent.id, status: 'failed', reason: err instanceof Error ? err.message : String(err) });
    }
  }
  const paid = results.filter((r) => r.status === 'paid');
  return {
    results,
    paidCount: paid.length,
    paidLamports: paid.reduce((sum, r) => sum + (r.paidLamports || 0), 0),
  };
}

export type ClawpumpClaimPreview = {
  totalEarnedSol: number;
  totalSentSol: number;
  paidSol: number;
  claimableSol: number;
  minClaimSol: number;
  payoutWallet: string | null;
};

/** Read-only: how much an agent could claim right now (for the UI). No funds move. */
export async function previewAgentClawpumpClaim(agent: FeeAgent): Promise<ClawpumpClaimPreview> {
  const payoutWallet = solanaPayoutWallet(agent);
  const minClaimSol = MIN_CLAWPUMP_PAYOUT_LAMPORTS / LAMPORTS_PER_SOL;
  if (!agent.clawpump_agent_id) {
    return { totalEarnedSol: 0, totalSentSol: 0, paidSol: 0, claimableSol: 0, minClaimSol, payoutWallet };
  }
  const earnings = await getClawpumpAgentEarnings(agent.clawpump_agent_id);
  const reserved = await getReservedFeeLamportsForAgent(agent.id);
  const sentLamports = Math.floor(earnings.totalSentSol * LAMPORTS_PER_SOL);
  const claimable = Math.max(0, sentLamports - reserved);
  return {
    totalEarnedSol: earnings.totalEarnedSol,
    totalSentSol: earnings.totalSentSol,
    paidSol: reserved / LAMPORTS_PER_SOL,
    claimableSol: claimable / LAMPORTS_PER_SOL,
    minClaimSol,
    payoutWallet,
  };
}

export interface ClawpumpFeeSummaryToken {
  agentId: string;
  name: string;
  mint: string;
  earnedSol: number;
  sentSol: number;
  pendingSol: number;
  claimableSol: number;
  payoutWallet: string | null;
  eligible: boolean;
}

export interface ClawpumpFeeSummary {
  totals: {
    earnedSol: number;
    sentSol: number;
    pendingSol: number;
    claimableSol: number;
    eligibleCount: number;
    tokenCount: number;
    queriedCount: number;
    failedCount: number;
  };
  perToken: ClawpumpFeeSummaryToken[];
  stuck: Array<{ agentId: string; name: string; mint: string; creatorWallet: string | null }>;
  minClaimSol: number;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Read-only ClawPump fee picture for the admin dashboard: aggregate earned/sent/pending across
 * every self-funded ClawPump token (creator = Atelier wallet), the per-token claimable breakdown,
 * and the "stuck" custodied tokens whose 65% never reaches us. Queries ClawPump's earnings API per
 * agent with bounded concurrency; a failed query drops that token from totals (counted separately).
 */
export async function summarizeClawpumpFees(): Promise<ClawpumpFeeSummary> {
  const minClaimSol = MIN_CLAWPUMP_PAYOUT_LAMPORTS / LAMPORTS_PER_SOL;
  const agents = await listClawpumpFeeAgents();
  const atelier = ATELIER_PUBKEY.toBase58();

  const stuck = agents
    .filter((a) => a.token_creator_wallet && a.token_creator_wallet !== atelier)
    .map((a) => ({ agentId: a.id, name: a.name, mint: a.token_mint as string, creatorWallet: a.token_creator_wallet ?? null }));

  const selfFunded = agents.filter((a) => a.clawpump_agent_id && (!a.token_creator_wallet || a.token_creator_wallet === atelier));

  const rows = await mapWithConcurrency(selfFunded, 8, async (a) => {
    try {
      const earnings = await getClawpumpAgentEarnings(a.clawpump_agent_id as string);
      const reserved = await getReservedFeeLamportsForAgent(a.id);
      const sentLamports = Math.floor(earnings.totalSentSol * LAMPORTS_PER_SOL);
      const claimableLamports = Math.max(0, sentLamports - reserved);
      const payoutWallet = solanaPayoutWallet(a);
      const eligible = claimableLamports >= MIN_CLAWPUMP_PAYOUT_LAMPORTS && payoutWallet !== null;
      const token: ClawpumpFeeSummaryToken = {
        agentId: a.id,
        name: a.name,
        mint: a.token_mint as string,
        earnedSol: earnings.totalEarnedSol,
        sentSol: earnings.totalSentSol,
        pendingSol: earnings.totalPendingSol,
        claimableSol: claimableLamports / LAMPORTS_PER_SOL,
        payoutWallet,
        eligible,
      };
      return { token };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  const perToken: ClawpumpFeeSummaryToken[] = [];
  let failedCount = 0;
  for (const r of rows) {
    if ('token' in r && r.token) perToken.push(r.token);
    else failedCount++;
  }
  perToken.sort((a, b) => b.claimableSol - a.claimableSol);

  const totals = {
    earnedSol: perToken.reduce((s, t) => s + t.earnedSol, 0),
    sentSol: perToken.reduce((s, t) => s + t.sentSol, 0),
    pendingSol: perToken.reduce((s, t) => s + t.pendingSol, 0),
    claimableSol: perToken.filter((t) => t.eligible).reduce((s, t) => s + t.claimableSol, 0),
    eligibleCount: perToken.filter((t) => t.eligible).length,
    tokenCount: selfFunded.length,
    queriedCount: perToken.length,
    failedCount,
  };

  return { totals, perToken, stuck, minClaimSol };
}
