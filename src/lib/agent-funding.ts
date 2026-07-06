import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getServerConnection } from './solana-server';
import { getAtelierAgent, setAgentServerWallets, type AtelierAgent } from './atelier-db';
import {
  provisionServerWallets,
  getServerWalletAddress,
  getServerWalletSolBalance,
  getServerWalletUsdcBalance,
  SERVER_WALLETS_ENABLED,
} from './privy-server-wallets';
import { SAID_AGENT_ACCOUNT_SIZE, SAID_FEE_BUFFER_LAMPORTS } from './said';

/**
 * Agents pay their own on-chain costs (ClawPump launch fee, SAID mint rent) from
 * their Privy server wallet. Amounts are resolved LIVE on every call -- ClawPump
 * from its fee endpoint when the partner ships one (CLAWPUMP_FEE_ENDPOINT), SAID
 * from current rent-exemption -- so nothing user-facing ever hardcodes a number.
 */

// Network-fee headroom the agent wallet must hold on top of the exact on-chain
// cost, so its own transfer/registration transactions never fail on fees.
const LAUNCH_FEE_HEADROOM_SOL = 0.002;
const SAID_FEE_HEADROOM_LAMPORTS = 20_000;

export interface AgentWalletRef {
  walletId: string;
  address: string;
}

export interface FundingRequirement {
  /** The exact on-chain cost forwarded to the external protocol, in SOL. */
  costSol: number;
  /** What the agent wallet must hold to safely run the flow (cost + headroom), in SOL. */
  requiredSol: number;
}

export interface AgentFundingStatus {
  wallet: AgentWalletRef | null;
  balanceSol: number | null;
  /** USDC sitting on the agent wallet (API agents receive marketplace payouts here). */
  balanceUsdc: number | null;
  launch: FundingRequirement;
  said: FundingRequirement;
}

function roundSol(sol: number): number {
  return Math.ceil(sol * 1e6) / 1e6;
}

/**
 * ClawPump's self-funded launch fee. ClawPump exposes no fee-discovery endpoint
 * today (probed 2026-07-03: /api/v1/config|fees|pricing all 404) -- when the
 * partner ships one, point CLAWPUMP_FEE_ENDPOINT at it and this picks it up
 * without a deploy; until then CLAWPUMP_SELFFUND_SOL (default 0.03) governs.
 */
export async function getLaunchFeeSol(): Promise<number> {
  const fallback = (() => {
    const parsed = Number(process.env.CLAWPUMP_SELFFUND_SOL || '0.03');
    return parsed > 0 ? parsed : 0.03;
  })();

  const endpoint = process.env.CLAWPUMP_FEE_ENDPOINT;
  if (!endpoint) return fallback;

  try {
    const headers: Record<string, string> = {};
    if (process.env.CLAWPUMP_API_KEY) headers.Authorization = `Bearer ${process.env.CLAWPUMP_API_KEY}`;
    const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return fallback;
    const data = await res.json();
    const sol = Number(data.launchFeeSol ?? data.feeSol ?? data.sol ?? data.fee);
    return Number.isFinite(sol) && sol > 0 ? sol : fallback;
  } catch {
    return fallback;
  }
}

export async function getLaunchRequirement(): Promise<FundingRequirement> {
  const costSol = await getLaunchFeeSol();
  return { costSol, requiredSol: roundSol(costSol + LAUNCH_FEE_HEADROOM_SOL) };
}

/** SAID mint cost: live rent for the 263-byte agent account plus fee buffers. */
export async function getSaidRequirement(): Promise<FundingRequirement> {
  const connection = getServerConnection();
  const rent = await connection.getMinimumBalanceForRentExemption(SAID_AGENT_ACCOUNT_SIZE);
  const costLamports = rent + SAID_FEE_BUFFER_LAMPORTS;
  return {
    costSol: roundSol(costLamports / LAMPORTS_PER_SOL),
    requiredSol: roundSol((costLamports + SAID_FEE_HEADROOM_LAMPORTS) / LAMPORTS_PER_SOL),
  };
}

/**
 * Resolve (provisioning on demand) the agent's Solana server wallet. Returns null
 * only when server wallets are disabled or Privy provisioning fails.
 */
export async function ensureAgentSolanaWallet(agent: AtelierAgent): Promise<AgentWalletRef | null> {
  if (!SERVER_WALLETS_ENABLED) return null;

  let walletId = agent.privy_solana_wallet_id;
  if (!walletId) {
    try {
      const provisioned = await provisionServerWallets(agent.id);
      if (provisioned.evm || provisioned.solana) {
        await setAgentServerWallets(agent.id, {
          evmWalletId: provisioned.evm?.id,
          evmAddress: provisioned.evm?.address,
          solanaWalletId: provisioned.solana?.id,
          solanaAddress: provisioned.solana?.address,
        });
      }
      if (provisioned.solana) {
        return { walletId: provisioned.solana.id, address: provisioned.solana.address };
      }
      const refreshed = await getAtelierAgent(agent.id);
      walletId = refreshed?.privy_solana_wallet_id ?? null;
    } catch (err) {
      console.error('[agent-funding] wallet provisioning failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }
  if (!walletId) return null;

  try {
    const address = await getServerWalletAddress(walletId);
    return { walletId, address };
  } catch (err) {
    console.error('[agent-funding] wallet address lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getAgentFundingStatus(agent: AtelierAgent): Promise<AgentFundingStatus> {
  const [wallet, launch, said] = await Promise.all([
    ensureAgentSolanaWallet(agent),
    getLaunchRequirement(),
    getSaidRequirement(),
  ]);

  let balanceSol: number | null = null;
  let balanceUsdc: number | null = null;
  if (wallet) {
    const [solRead, usdcRead] = await Promise.allSettled([
      getServerWalletSolBalance(wallet.address),
      getServerWalletUsdcBalance(wallet.address, 'solana'),
    ]);
    if (solRead.status === 'fulfilled') balanceSol = solRead.value;
    else console.error('[agent-funding] SOL balance read failed:', solRead.reason);
    if (usdcRead.status === 'fulfilled') balanceUsdc = usdcRead.value;
    else console.error('[agent-funding] USDC balance read failed:', usdcRead.reason);
  }

  return { wallet, balanceSol, balanceUsdc, launch, said };
}

/**
 * The standard "fund your agent wallet first" API error body. Every surface
 * (launch, SAID, web form) derives its messaging from these fields so the agent
 * is told the live amount and deposit address BEFORE any irreversible step.
 */
export function insufficientSolBody(params: {
  action: 'token_launch' | 'said_identity';
  requirement: FundingRequirement;
  wallet: AgentWalletRef;
  balanceSol: number | null;
}): {
  success: false;
  error: string;
  code: 'agent_wallet_underfunded';
  data: {
    action: string;
    required_sol: number;
    cost_sol: number;
    balance_sol: number | null;
    deposit_address: string;
    how_to_fund: string;
  };
} {
  const label = params.action === 'token_launch' ? 'token launch' : 'SAID identity mint';
  return {
    success: false,
    error: `Insufficient SOL in the agent wallet for the ${label}. Deposit at least ${params.requirement.requiredSol} SOL to ${params.wallet.address} (current balance: ${params.balanceSol ?? 0} SOL). The agent pays its own on-chain fees.`,
    code: 'agent_wallet_underfunded',
    data: {
      action: params.action,
      required_sol: params.requirement.requiredSol,
      cost_sol: params.requirement.costSol,
      balance_sol: params.balanceSol,
      deposit_address: params.wallet.address,
      how_to_fund: 'Send SOL on Solana mainnet to deposit_address, or fund it from your Atelier wallet at /wallet.',
    },
  };
}
