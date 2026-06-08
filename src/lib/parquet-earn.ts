import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
} from '@solana/spl-token';
import { Program, AnchorProvider, Wallet, type Idl } from '@coral-xyz/anchor';
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

// On-chain adapter for Parquet liquidity pools. Everything here is real and
// signs/derives against Parquet's program, but it is gated by config: until the
// program IDs and market are set in env (PENDING from the Parquet team), every
// entry point throws a clear "not configured" error so no fund-moving code can
// run against a placeholder. The flow layer checks isParquetEarnConfigured()
// first.
//
// Pool accounts (poolState, usdcVault, vaultAuthority, lpMint) are PDAs derived
// from the marketId + pool program ID, so config is minimal.

// Public, verified mainnet constants (docs.parquet.exchange/network/contracts;
// PDA derivation confirmed against live on-chain pools). Env-overridable for
// devnet/other deployments.
const MAINNET_POOL_PROGRAM_ID = 'Acme8JzWrvVqGJz7nTKVsLYisN6MtP83nrs4fVAeXJsN';
const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

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

function readMarketId(): { marketId: Uint8Array; label: string } | null {
  const hex = process.env.PARQUET_EARN_MARKET_ID_HEX;
  if (hex) {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length !== 64) {
      throw new Error('PARQUET_EARN_MARKET_ID_HEX must be 32 bytes (64 hex chars)');
    }
    return { marketId: Uint8Array.from(Buffer.from(clean, 'hex')), label: hex };
  }
  const label = process.env.PARQUET_EARN_MARKET;
  if (label) return { marketId: marketIdFromString(label), label };
  return null;
}

// The market is the enable switch: program ID and USDC mint default to verified
// mainnet constants, so setting a market turns Earn on for this deployment.
// (Fund movement additionally requires PARQUET_EARN_TREASURY_KEY.)
export function isParquetEarnConfigured(): boolean {
  return Boolean(process.env.PARQUET_EARN_MARKET || process.env.PARQUET_EARN_MARKET_ID_HEX);
}

let cachedConfig: ParquetEarnConfig | null = null;

export function getParquetEarnConfig(): ParquetEarnConfig {
  if (cachedConfig) return cachedConfig;

  const programId = process.env.PARQUET_POOL_PROGRAM_ID || MAINNET_POOL_PROGRAM_ID;
  const usdcMint = process.env.PARQUET_USDC_MINT || MAINNET_USDC_MINT;
  const market = readMarketId();

  if (!market) {
    throw new Error('Parquet Earn not configured -- set PARQUET_EARN_MARKET (e.g. spy-usdc)');
  }

  cachedConfig = {
    poolProgramId: new PublicKey(programId),
    usdcMint: new PublicKey(usdcMint),
    marketId: market.marketId,
    marketLabel: market.label,
  };
  return cachedConfig;
}

let cachedPoolClient: PoolClient | null = null;

function getPoolClient(): PoolClient {
  if (cachedPoolClient) return cachedPoolClient;
  const cfg = getParquetEarnConfig();
  const connection = getServerConnection();
  const wallet = new Wallet(getEarnTreasuryKeypair());
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  // The bundled IDL carries the deployed address; override with our configured
  // program ID so the same code works across deployments.
  const idl = { ...(poolIdl as Idl), address: cfg.poolProgramId.toBase58() };
  const program = new Program(idl as Idl, provider);
  cachedPoolClient = new PoolClient(program);
  return cachedPoolClient;
}

function lpMintFor(cfg: ParquetEarnConfig): PublicKey {
  const [lpMint] = lpMintPDA(cfg.marketId, cfg.poolProgramId);
  return lpMint;
}

// Treasury's USDC and LP associated token accounts for the configured market.
export function getTreasuryTokenAccounts(): { usdc: PublicKey; lp: PublicKey } {
  const cfg = getParquetEarnConfig();
  const treasury = getEarnTreasuryPubkey();
  return {
    usdc: getAssociatedTokenAddressSync(cfg.usdcMint, treasury),
    lp: getAssociatedTokenAddressSync(lpMintFor(cfg), treasury),
  };
}

// Deposit `amountUsdc` (micro-USDC) from the treasury into the pool. Prepends an
// idempotent create for the treasury LP ATA so the very first deposit works.
export async function buildTreasuryDepositInstructions(
  amountUsdc: bigint,
  minLpOut: bigint,
): Promise<TransactionInstruction[]> {
  const cfg = getParquetEarnConfig();
  const treasury = getEarnTreasuryPubkey();
  const { usdc: userUsdc, lp: userLp } = getTreasuryTokenAccounts();

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

// Withdraw `lpAmount` LP tokens from the pool back into treasury USDC.
export async function buildTreasuryWithdrawInstructions(
  lpAmount: bigint,
  minOut: bigint,
): Promise<TransactionInstruction[]> {
  const cfg = getParquetEarnConfig();
  const treasury = getEarnTreasuryPubkey();
  const { usdc: userUsdc, lp: userLp } = getTreasuryTokenAccounts();

  return removeLiquidity(
    { poolClient: getPoolClient(), poolProgramId: cfg.poolProgramId, marketId: cfg.marketId },
    { withdrawer: treasury, userUsdc, userLp },
    { lpAmount, minOut },
  );
}

export async function readTreasuryLpBalance(connection?: Connection): Promise<bigint> {
  const conn = connection ?? getServerConnection();
  const { lp } = getTreasuryTokenAccounts();
  const info = await conn.getTokenAccountBalance(lp).catch(() => null);
  if (!info?.value?.amount) return BigInt(0);
  return BigInt(info.value.amount);
}

export async function readPoolHealth(connection?: Connection): Promise<ParquetPoolHealth> {
  const cfg = getParquetEarnConfig();
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

// USDC value of `lpAmount` LP tokens at the pool's current ratio. Used only to
// display position value -- it does not affect share accounting, which is
// LP-denominated.
export async function valueLpInUsdc(
  lpAmount: bigint,
  connection?: Connection,
): Promise<bigint> {
  if (lpAmount <= BigInt(0)) return BigInt(0);
  const health = await readPoolHealth(connection);
  if (health.lpSupply <= BigInt(0)) return BigInt(0);
  return (lpAmount * health.totalUsdc) / health.lpSupply;
}
