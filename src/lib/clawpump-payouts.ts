/**
 * ClawPump creator-fee payouts.
 *
 * Two generations of launches coexist:
 *  - Legacy (Atelier-funded): ClawPump pushes the 65% creator share (SOL) to the Atelier
 *    wallet supplied at launch (ATELIER_PUBKEY). This module forwards each agent its
 *    accrued SOL: read ClawPump's `totalSent`, subtract what Atelier already paid (the
 *    creator_fee_payouts ledger), transfer the delta. Idempotent and crash-safe -- the
 *    payout row is reserved (pending) before the transfer.
 *  - Agent-funded (current): the agent's own Privy server wallet paid the launch and is
 *    the creator-of-record, so ClawPump pushes the 65% straight to it. A claim simply
 *    sweeps that wallet's SOL to the owner's payout wallet -- no ledger needed, the funds
 *    physically leave the wallet.
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
  getServerWalletAddress,
  getServerWalletSolBalance,
  sendSolFromServerWallet,
} from '@/lib/privy-server-wallets';
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
/** Lamports left behind on an agent-funded sweep so the wallet can still pay its own tx fees. */
const AGENT_WALLET_RETAIN_LAMPORTS = 2_000_000; // 0.002 SOL
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
  privy_solana_wallet_id?: string | null;
};

/**
 * For agent-funded launches the creator-of-record is the agent's own server wallet.
 * Returns that wallet when it matches token_creator_wallet, else null.
 */
async function agentOwnedCreatorWallet(agent: FeeAgent): Promise<{ walletId: string; address: string } | null> {
  if (!agent.token_creator_wallet || !agent.privy_solana_wallet_id) return null;
  try {
    const address = await getServerWalletAddress(agent.privy_solana_wallet_id);
    return address === agent.token_creator_wallet
      ? { walletId: agent.privy_solana_wallet_id, address }
      : null;
  } catch {
    return null;
  }
}

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
  const target = solanaPayoutWallet(agent);
  if (!target) {
    return { agentId: agent.id, status: 'skipped', reason: 'no usable solana payout wallet' };
  }

  if (agent.token_creator_wallet && agent.token_creator_wallet !== ATELIER_PUBKEY.toBase58()) {
    // Agent-funded launch: the 65% lands directly on the agent's server wallet, so a
    // claim sweeps that wallet (minus a fee retainer). Everything in it belongs to
    // the owner -- deposits and earnings alike.
    const agentWallet = await agentOwnedCreatorWallet(agent);
    if (agentWallet) {
      const balanceSol = await getServerWalletSolBalance(agentWallet.address);
      const claimable = Math.floor(balanceSol * LAMPORTS_PER_SOL) - AGENT_WALLET_RETAIN_LAMPORTS;
      if (claimable < MIN_CLAWPUMP_PAYOUT_LAMPORTS) {
        return { agentId: agent.id, status: 'skipped', reason: `below threshold (claimable ${Math.max(0, claimable)} lamports)` };
      }
      try {
        const txHash = await sendSolFromServerWallet({
          walletId: agentWallet.walletId,
          walletAddress: agentWallet.address,
          to: target,
          lamports: claimable,
        });
        return { agentId: agent.id, status: 'paid', paidLamports: claimable, txHash };
      } catch (err) {
        return { agentId: agent.id, status: 'failed', reason: err instanceof Error ? err.message : String(err) };
      }
    }
    // Legacy sponsored launches set a ClawPump-custodied wallet as creator-of-record:
    // their 65% never reaches Atelier, so there is nothing here to pay out from.
    return { agentId: agent.id, status: 'skipped', reason: 'custodied creator wallet -- fees not pushed to Atelier' };
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

  if (agent.token_creator_wallet && agent.token_creator_wallet !== ATELIER_PUBKEY.toBase58()) {
    // Agent-funded launch: claimable is simply what sits on the agent's server
    // wallet (minus the fee retainer). Custodied legacy tokens claim nothing here.
    const agentWallet = await agentOwnedCreatorWallet(agent);
    const claimableLamports = agentWallet
      ? Math.max(0, Math.floor((await getServerWalletSolBalance(agentWallet.address)) * LAMPORTS_PER_SOL) - AGENT_WALLET_RETAIN_LAMPORTS)
      : 0;
    return {
      totalEarnedSol: earnings.totalEarnedSol,
      totalSentSol: earnings.totalSentSol,
      paidSol: 0,
      claimableSol: claimableLamports / LAMPORTS_PER_SOL,
      minClaimSol,
      payoutWallet,
    };
  }

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

  // Non-Atelier creator wallets split into agent-funded (creator = the agent's own
  // server wallet, fees claimable by sweep) and truly stuck custodied legacy tokens.
  const nonAtelier = agents.filter((a) => a.token_creator_wallet && a.token_creator_wallet !== atelier);
  const resolutions = await mapWithConcurrency(nonAtelier, 8, async (a) => ({
    agent: a,
    wallet: await agentOwnedCreatorWallet(a),
  }));
  const agentFunded: Array<{ agent: (typeof agents)[number]; wallet: { walletId: string; address: string } }> = [];
  const stuck: ClawpumpFeeSummary['stuck'] = [];
  for (const r of resolutions) {
    if (r.wallet) agentFunded.push({ agent: r.agent, wallet: r.wallet });
    else stuck.push({ agentId: r.agent.id, name: r.agent.name, mint: r.agent.token_mint as string, creatorWallet: r.agent.token_creator_wallet ?? null });
  }

  const agentFundedRows = await mapWithConcurrency(agentFunded, 8, async ({ agent: a, wallet }) => {
    try {
      const earnings = await getClawpumpAgentEarnings(a.clawpump_agent_id as string);
      const balanceSol = await getServerWalletSolBalance(wallet.address);
      const claimableLamports = Math.max(0, Math.floor(balanceSol * LAMPORTS_PER_SOL) - AGENT_WALLET_RETAIN_LAMPORTS);
      const payoutWallet = solanaPayoutWallet(a);
      const token: ClawpumpFeeSummaryToken = {
        agentId: a.id,
        name: a.name,
        mint: a.token_mint as string,
        earnedSol: earnings.totalEarnedSol,
        sentSol: earnings.totalSentSol,
        pendingSol: earnings.totalPendingSol,
        claimableSol: claimableLamports / LAMPORTS_PER_SOL,
        payoutWallet,
        eligible: claimableLamports >= MIN_CLAWPUMP_PAYOUT_LAMPORTS && payoutWallet !== null,
      };
      return { token };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

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
  for (const r of [...rows, ...agentFundedRows]) {
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
    tokenCount: selfFunded.length + agentFunded.length,
    queriedCount: perToken.length,
    failedCount,
  };

  return { totals, perToken, stuck, minClaimSol };
}
