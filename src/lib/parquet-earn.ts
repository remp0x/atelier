import { Connection, PublicKey, TransactionInstruction, Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
} from '@solana/spl-token';
import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor';
import {
  PoolClient,
  addLiquidity,
  removeLiquidity,
  marketIdFromString,
  lpMintPDA,
  poolStatePDA,
  decodePoolState,
} from '@parqxchange/sdk';
import poolIdl from '@parqxchange/sdk/idl/pool_program.json';
import { getServerConnection } from './solana-server';
import { getEarnTreasuryKeypair, getEarnTreasuryPubkey } from './parquet-earn-treasury';

// On-chain adapter for Parquet liquidity pools. Multi-market: every entry point
// takes a `market` (e.g. "intc-usdc") and resolves its pool accounts as PDAs of
// the marketId + pool program ID. Deposits are restricted to an allowlist of
// enabled markets; everything is gated by config so no fund-moving code runs
// against a placeholder.

// Public, verified mainnet constants (docs.parquet.exchange/network/contracts;
// PDA derivation confirmed against live on-chain pools). Env-overridable.
const MAINNET_POOL_PROGRAM_ID = 'Acme8JzWrvVqGJz7nTKVsLYisN6MtP83nrs4fVAeXJsN';
const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Markets users can deposit into: the current (252-byte) pools that owe the
// payout queue nothing. Excludes dead 240-byte pools (gld) and stressed pools
// that owe the queue more than they hold (qqq, tsla). Override with
// PARQUET_EARN_MARKETS (comma list). Re-scan the pool program for new markets.
const DEFAULT_ENABLED_MARKETS = [
  'aapl-usdc', 'amd-usdc', 'amzn-usdc', 'asml-usdc', 'avgo-usdc', 'baba-usdc', 'coin-usdc',
  'cost-usdc', 'crcl-usdc', 'crwv-usdc', 'dell-usdc', 'googl-usdc', 'hood-usdc', 'ibm-usdc',
  'intc-usdc', 'lly-usdc', 'meta-usdc', 'mrvl-usdc', 'msft-usdc', 'mstr-usdc', 'mu-usdc',
  'nflx-usdc', 'nvda-usdc', 'orcl-usdc', 'pltr-usdc', 'rivn-usdc', 'sndk-usdc', 'spy-usdc', 'tsm-usdc',
];

const ZERO = BigInt(0);

export interface ParquetEarnConfig {
  poolProgramId: PublicKey;
  usdcMint: PublicKey;
  marketId: Uint8Array;
  marketLabel: string;
}

export interface ParquetPoolHealth {
  totalUsdc: bigint;
  reservedUsdc: bigint;
  queueTotalOwed: bigint;
  lpSupply: bigint;
}

function poolProgramId(): PublicKey {
  return new PublicKey(process.env.PARQUET_POOL_PROGRAM_ID || MAINNET_POOL_PROGRAM_ID);
}

function usdcMint(): PublicKey {
  return new PublicKey(process.env.PARQUET_USDC_MINT || MAINNET_USDC_MINT);
}

// Earn is enabled for this deployment when PARQUET_EARN_MARKET is set (the switch).
export function isParquetEarnConfigured(): boolean {
  return Boolean(process.env.PARQUET_EARN_MARKET || process.env.PARQUET_EARN_MARKET_ID_HEX);
}

// The markets users can deposit into. Empty when Earn is off.
export function getEnabledMarkets(): string[] {
  if (!isParquetEarnConfigured()) return [];
  const env = process.env.PARQUET_EARN_MARKETS;
  const list = env ? env.split(',').map((s) => s.trim()).filter(Boolean) : [...DEFAULT_ENABLED_MARKETS];
  const def = process.env.PARQUET_EARN_MARKET;
  if (def && !list.includes(def)) list.unshift(def);
  return list;
}

export function isMarketEnabled(market: string): boolean {
  return getEnabledMarkets().includes(market);
}

export function getDefaultMarket(): string {
  const def = process.env.PARQUET_EARN_MARKET;
  if (def) return def;
  const enabled = getEnabledMarkets();
  if (enabled.length === 0) throw new Error('Parquet Earn not configured -- set PARQUET_EARN_MARKET');
  return enabled[0];
}

export function getParquetEarnConfig(market?: string): ParquetEarnConfig {
  // Legacy hex marketId via env (only when no explicit market is requested).
  if (!market && process.env.PARQUET_EARN_MARKET_ID_HEX) {
    const hex = process.env.PARQUET_EARN_MARKET_ID_HEX;
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length !== 64) throw new Error('PARQUET_EARN_MARKET_ID_HEX must be 32 bytes (64 hex chars)');
    return { poolProgramId: poolProgramId(), usdcMint: usdcMint(), marketId: Uint8Array.from(Buffer.from(clean, 'hex')), marketLabel: hex };
  }
  const label = market ?? getDefaultMarket();
  if (!isMarketEnabled(label)) {
    throw new Error(`market "${label}" is not enabled for Earn`);
  }
  return { poolProgramId: poolProgramId(), usdcMint: usdcMint(), marketId: marketIdFromString(label), marketLabel: label };
}

// The pool program client is market-agnostic (the marketId is passed per call),
// so it is built once from the global program ID.
let cachedPoolClient: PoolClient | null = null;

function getPoolClient(): PoolClient {
  if (cachedPoolClient) return cachedPoolClient;
  const connection = getServerConnection();
  // anchor's Wallet export is not a usable constructor in the Vercel runtime, so
  // build the provider wallet directly. Instruction building never signs through
  // it -- the flow layer signs with the treasury keypair via sendAndConfirmServerTx.
  const treasury = getEarnTreasuryKeypair();
  const wallet = {
    publicKey: treasury.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => txs,
  };
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const idl = { ...(poolIdl as Idl), address: poolProgramId().toBase58() };
  const program = new Program(idl as Idl, provider);
  cachedPoolClient = new PoolClient(program);
  return cachedPoolClient;
}

function lpMintFor(cfg: ParquetEarnConfig): PublicKey {
  const [lpMint] = lpMintPDA(cfg.marketId, cfg.poolProgramId);
  return lpMint;
}

// Treasury's USDC and LP associated token accounts for a market.
export function getTreasuryTokenAccounts(market?: string): { usdc: PublicKey; lp: PublicKey } {
  const cfg = getParquetEarnConfig(market);
  const treasury = getEarnTreasuryPubkey();
  return {
    usdc: getAssociatedTokenAddressSync(cfg.usdcMint, treasury),
    lp: getAssociatedTokenAddressSync(lpMintFor(cfg), treasury),
  };
}

// Deposit `amountUsdc` (micro-USDC) from the treasury into `market`'s pool.
export async function buildTreasuryDepositInstructions(
  market: string,
  amountUsdc: bigint,
  minLpOut: bigint,
): Promise<TransactionInstruction[]> {
  const cfg = getParquetEarnConfig(market);
  const treasury = getEarnTreasuryPubkey();
  const { usdc: userUsdc, lp: userLp } = getTreasuryTokenAccounts(market);

  const ensureLpAta = createAssociatedTokenAccountIdempotentInstruction(
    treasury,
    userLp,
    treasury,
    lpMintFor(cfg),
  );

  const liquidityIxs = await addLiquidity(
    { poolClient: getPoolClient(), poolProgramId: cfg.poolProgramId, marketId: cfg.marketId },
    { depositor: treasury, userUsdc, userLp },
    { amountUsdc, minLpOut },
  );

  return [ensureLpAta, ...liquidityIxs];
}

// Withdraw `lpAmount` LP tokens from `market`'s pool back into treasury USDC.
export async function buildTreasuryWithdrawInstructions(
  market: string,
  lpAmount: bigint,
  minOut: bigint,
): Promise<TransactionInstruction[]> {
  const cfg = getParquetEarnConfig(market);
  const treasury = getEarnTreasuryPubkey();
  const { usdc: userUsdc, lp: userLp } = getTreasuryTokenAccounts(market);

  return removeLiquidity(
    { poolClient: getPoolClient(), poolProgramId: cfg.poolProgramId, marketId: cfg.marketId },
    { withdrawer: treasury, userUsdc, userLp },
    { lpAmount, minOut },
  );
}

export async function readTreasuryLpBalance(market: string, connection?: Connection): Promise<bigint> {
  const conn = connection ?? getServerConnection();
  const { lp } = getTreasuryTokenAccounts(market);
  const info = await conn.getTokenAccountBalance(lp).catch(() => null);
  if (!info?.value?.amount) return ZERO;
  return BigInt(info.value.amount);
}

export async function readPoolHealth(market?: string, connection?: Connection): Promise<ParquetPoolHealth> {
  const cfg = getParquetEarnConfig(market);
  const conn = connection ?? getServerConnection();
  const [poolState] = poolStatePDA(cfg.marketId, cfg.poolProgramId);

  const info = await conn.getAccountInfo(poolState);
  if (!info) throw new Error(`pool state ${poolState.toBase58()} not found on-chain`);
  const ps = decodePoolState(info.data);
  const lpMint = await getMint(conn, lpMintFor(cfg));

  return {
    totalUsdc: BigInt(ps.totalUsdc.toString()),
    reservedUsdc: BigInt(ps.reservedUsdc.toString()),
    queueTotalOwed: BigInt(ps.queueTotalOwed.toString()),
    lpSupply: lpMint.supply,
  };
}

// USDC value of `lpAmount` LP tokens in `market` at the pool's current ratio.
export async function valueLpInUsdc(
  market: string,
  lpAmount: bigint,
  connection?: Connection,
): Promise<bigint> {
  if (lpAmount <= ZERO) return ZERO;
  const health = await readPoolHealth(market, connection);
  if (health.lpSupply <= ZERO) return ZERO;
  return (lpAmount * health.totalUsdc) / health.lpSupply;
}
