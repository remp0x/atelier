import { Connection, PublicKey, TransactionInstruction, Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
} from '@solana/spl-token';
import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor';
import {
  PoolClient,
  marketIdFromString,
  categoryPoolPDA,
  categoryVaultPDA,
  categoryVaultAuthorityPDA,
  categoryLpMintPDA,
  categoryLpDeadPDA,
  decodeCategoryPool,
} from '@parqxchange/sdk';
import poolIdl from '@parqxchange/sdk/idl/pool_program.json';
import { getServerConnection } from './solana-server';
import { getEarnTreasuryKeypair, getEarnTreasuryPubkey } from './parquet-earn-treasury';

// On-chain adapter for Parquet liquidity. Parquet consolidated its per-market
// pools into shared CATEGORY pools: every equity market (aapl, msft, ...) is now
// backed by one unified `equity-us` CategoryPool with a single LP mint, and the
// per-market risk (reserved/queue/OI) lives in separate MarketRisk accounts. So
// Earn deposits into and reads from the category pool, not the dead legacy
// per-market pools. The "market" string threaded through the DB/routes/positions
// is now a CATEGORY id (e.g. "equity-us"); we keep the term at those layers to
// avoid churning column names and URLs, but on-chain everything is category-keyed.

// Public, verified mainnet constants (docs.parquet.exchange/network/contracts).
// Env-overridable.
const MAINNET_POOL_PROGRAM_ID = 'Acme8JzWrvVqGJz7nTKVsLYisN6MtP83nrs4fVAeXJsN';
const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Live categories today. Override via PARQUET_EARN_CATEGORIES.
const DEFAULT_ENABLED_CATEGORIES = ['equity-us', 'crypto-usd'];

// Constituent markets of the equity-us category, keyed by bare uppercase ticker.
// The category pool aggregates all of these; the list is used only to sum
// per-ticker fee accrual into a category-level APR (the indexer has no category
// endpoint). Override via PARQUET_EARN_<CATEGORY>_TICKERS not needed today.
const CATEGORY_TICKERS: Record<string, string[]> = {
  'equity-us': [
    'AAPL', 'AMD', 'ASML', 'AVGO', 'BABA', 'COIN', 'COST', 'CRCL', 'CRWV', 'DELL',
    'HOOD', 'IBM', 'INTC', 'LLY', 'META', 'MSFT', 'MU', 'NFLX', 'ORCL', 'PLTR',
    'RIVN', 'SNDK', 'SPY', 'TSM', 'AMZN', 'GOOGL', 'MRVL', 'MSTR', 'NVDA', 'TSLA',
    'QQQ',
  ],
  'crypto-usd': ['BTC', 'ETH', 'SOL'],
};

const ZERO = BigInt(0);

export interface ParquetEarnConfig {
  poolProgramId: PublicKey;
  usdcMint: PublicKey;
  categoryId: Uint8Array;
  categoryLabel: string;
}

// Pool health, mapped from CategoryPool. `reservedUsdc`/`queueTotalOwed` are the
// category-wide sums across its markets; `totalUsdc` is LP NAV (gross). The
// immediately-withdrawable amount is `availableLiquidity()`, which nets out the
// trader-owed portions that LPs cannot pull until traders close.
export interface ParquetPoolHealth {
  totalUsdc: bigint;
  escrowedUsdc: bigint;
  reservedUsdc: bigint;
  queueTotalOwed: bigint;
  lpSupply: bigint;
  isPaused: boolean;
}

function poolProgramId(): PublicKey {
  return new PublicKey(process.env.PARQUET_POOL_PROGRAM_ID || MAINNET_POOL_PROGRAM_ID);
}

function usdcMint(): PublicKey {
  return new PublicKey(process.env.PARQUET_USDC_MINT || MAINNET_USDC_MINT);
}

// Earn is enabled for this deployment when a category is configured (the switch).
// PARQUET_EARN_MARKET is accepted as a back-compat alias for PARQUET_EARN_CATEGORY.
export function isParquetEarnConfigured(): boolean {
  return Boolean(process.env.PARQUET_EARN_CATEGORY || process.env.PARQUET_EARN_MARKET);
}

function parseCategoryList(value: string | undefined): string[] {
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

// The default/switch var (singular) is meant to hold one category id, but may be
// set to a comma list by mistake -- the default is always its FIRST token, never
// the raw comma string (which is no valid category and renders an empty card).
function configuredDefault(): string | undefined {
  return parseCategoryList(process.env.PARQUET_EARN_CATEGORY || process.env.PARQUET_EARN_MARKET)[0];
}

// The categories users can deposit into. Empty when Earn is off. Sourced from the
// plural list var, else a multi-value singular switch, else the built-in default.
export function getEnabledCategories(): string[] {
  if (!isParquetEarnConfigured()) return [];
  const explicit = parseCategoryList(process.env.PARQUET_EARN_CATEGORIES || process.env.PARQUET_EARN_MARKETS);
  const fromSwitch = parseCategoryList(process.env.PARQUET_EARN_CATEGORY || process.env.PARQUET_EARN_MARKET);
  const list = explicit.length > 0
    ? explicit
    : fromSwitch.length > 1
      ? fromSwitch
      : [...DEFAULT_ENABLED_CATEGORIES];
  const def = configuredDefault();
  if (def && !list.includes(def)) list.unshift(def);
  return Array.from(new Set(list));
}

export function isCategoryEnabled(category: string): boolean {
  return getEnabledCategories().includes(category);
}

export function getDefaultCategory(): string {
  const def = configuredDefault();
  if (def) return def;
  const enabled = getEnabledCategories();
  if (enabled.length === 0) throw new Error('Parquet Earn not configured -- set PARQUET_EARN_CATEGORY');
  return enabled[0];
}

// Bare uppercase tickers that make up a category, for fee aggregation.
export function getCategoryTickers(category: string): string[] {
  return CATEGORY_TICKERS[category] ?? [];
}

export function getParquetEarnConfig(category?: string): ParquetEarnConfig {
  const label = category ?? getDefaultCategory();
  if (!isCategoryEnabled(label)) {
    throw new Error(`category "${label}" is not enabled for Earn`);
  }
  return {
    poolProgramId: poolProgramId(),
    usdcMint: usdcMint(),
    categoryId: marketIdFromString(label),
    categoryLabel: label,
  };
}

// The pool program client is category-agnostic (the categoryId is passed per
// call via derived PDAs), so it is built once from the global program ID.
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

interface CategoryAccounts {
  categoryPool: PublicKey;
  usdcVault: PublicKey;
  vaultAuthority: PublicKey;
  lpMint: PublicKey;
  lpDead: PublicKey;
}

function categoryAccounts(cfg: ParquetEarnConfig): CategoryAccounts {
  return {
    categoryPool: categoryPoolPDA(cfg.categoryId, cfg.poolProgramId)[0],
    usdcVault: categoryVaultPDA(cfg.categoryId, cfg.poolProgramId)[0],
    vaultAuthority: categoryVaultAuthorityPDA(cfg.categoryId, cfg.poolProgramId)[0],
    lpMint: categoryLpMintPDA(cfg.categoryId, cfg.poolProgramId)[0],
    lpDead: categoryLpDeadPDA(cfg.categoryId, cfg.poolProgramId)[0],
  };
}

function lpMintFor(cfg: ParquetEarnConfig): PublicKey {
  return categoryLpMintPDA(cfg.categoryId, cfg.poolProgramId)[0];
}

// Treasury's USDC and category-LP associated token accounts.
export function getTreasuryTokenAccounts(category?: string): { usdc: PublicKey; lp: PublicKey } {
  const cfg = getParquetEarnConfig(category);
  const treasury = getEarnTreasuryPubkey();
  return {
    usdc: getAssociatedTokenAddressSync(cfg.usdcMint, treasury),
    lp: getAssociatedTokenAddressSync(lpMintFor(cfg), treasury),
  };
}

// Deposit `amountUsdc` (micro-USDC) from the treasury into `category`'s pool.
export async function buildTreasuryDepositInstructions(
  category: string,
  amountUsdc: bigint,
  minLpOut: bigint,
): Promise<TransactionInstruction[]> {
  const cfg = getParquetEarnConfig(category);
  const treasury = getEarnTreasuryPubkey();
  const accts = categoryAccounts(cfg);
  const { usdc: userUsdc, lp: userLp } = getTreasuryTokenAccounts(category);

  const ensureLpAta = createAssociatedTokenAccountIdempotentInstruction(
    treasury,
    userLp,
    treasury,
    accts.lpMint,
  );

  const depositIx = await getPoolClient().depositCategoryIx(
    {
      categoryPool: accts.categoryPool,
      usdcVault: accts.usdcVault,
      vaultAuthority: accts.vaultAuthority,
      lpMint: accts.lpMint,
      userLp,
      userUsdc,
      lpDead: accts.lpDead,
      depositor: treasury,
    },
    { amount: amountUsdc, minLpOut },
  );

  return [ensureLpAta, depositIx];
}

// Withdraw `lpAmount` category-LP tokens from `category`'s pool to treasury USDC.
export async function buildTreasuryWithdrawInstructions(
  category: string,
  lpAmount: bigint,
  minOut: bigint,
): Promise<TransactionInstruction[]> {
  const cfg = getParquetEarnConfig(category);
  const treasury = getEarnTreasuryPubkey();
  const accts = categoryAccounts(cfg);
  const { usdc: userUsdc, lp: userLp } = getTreasuryTokenAccounts(category);

  const withdrawIx = await getPoolClient().withdrawCategoryIx(
    {
      categoryPool: accts.categoryPool,
      usdcVault: accts.usdcVault,
      vaultAuthority: accts.vaultAuthority,
      lpMint: accts.lpMint,
      userLp,
      userUsdc,
      withdrawer: treasury,
    },
    { lpAmount, minOut },
  );

  return [withdrawIx];
}

export async function readTreasuryLpBalance(category: string, connection?: Connection): Promise<bigint> {
  const conn = connection ?? getServerConnection();
  const { lp } = getTreasuryTokenAccounts(category);
  const info = await conn.getTokenAccountBalance(lp).catch(() => null);
  if (!info?.value?.amount) return ZERO;
  return BigInt(info.value.amount);
}

export async function readPoolHealth(category?: string, connection?: Connection): Promise<ParquetPoolHealth> {
  const cfg = getParquetEarnConfig(category);
  const conn = connection ?? getServerConnection();
  const accts = categoryAccounts(cfg);

  const info = await conn.getAccountInfo(accts.categoryPool);
  if (!info) throw new Error(`category pool ${accts.categoryPool.toBase58()} not found on-chain`);
  const cp = decodeCategoryPool(info.data);
  const lpMint = await getMint(conn, accts.lpMint);

  return {
    totalUsdc: BigInt(cp.totalUsdc.toString()),
    escrowedUsdc: BigInt(cp.escrowedCollateralUsdc.toString()),
    reservedUsdc: BigInt(cp.sumReservedUsdc.toString()),
    queueTotalOwed: BigInt(cp.sumQueueOwedUsdc.toString()),
    lpSupply: lpMint.supply,
    isPaused: cp.isPaused,
  };
}

// USDC immediately withdrawable by LPs: NAV minus the trader-owed portions held
// in the pool (escrowed collateral, reserved, queued payouts).
export function availableLiquidity(health: ParquetPoolHealth): bigint {
  const owed = health.escrowedUsdc + health.reservedUsdc + health.queueTotalOwed;
  return health.totalUsdc > owed ? health.totalUsdc - owed : ZERO;
}

// USDC NAV of `lpAmount` category-LP tokens. LP is backed by the pool's EQUITY
// (`availableLiquidity` = total minus the trader-owed escrow/reserved/queue), NOT
// gross `totalUsdc` -- the program mints and redeems LP against that equity, so
// valuing against gross total overstates positions and is what the program pays
// on withdraw. Verified on mainnet: full treasury LP redeems to exactly its
// equity value.
export async function valueLpInUsdc(
  category: string,
  lpAmount: bigint,
  connection?: Connection,
): Promise<bigint> {
  if (lpAmount <= ZERO) return ZERO;
  const health = await readPoolHealth(category, connection);
  if (health.lpSupply <= ZERO) return ZERO;
  return (lpAmount * availableLiquidity(health)) / health.lpSupply;
}

// SPL mint `supply` is a u64 LE at offset 36 of the account data.
function readMintSupply(data: Uint8Array): bigint {
  return Buffer.from(data).readBigUInt64LE(36);
}

// Reads health for ALL enabled categories in two batched RPC calls (category
// pools + LP mints), so the UI can show every pool's stats at once. Categories
// that fail to decode are omitted.
export async function readEnabledPoolHealths(
  connection?: Connection,
): Promise<Map<string, ParquetPoolHealth>> {
  const conn = connection ?? getServerConnection();
  const categories = getEnabledCategories();
  const program = poolProgramId();
  const poolPdas = categories.map((c) => categoryPoolPDA(marketIdFromString(c), program)[0]);
  const lpMintPdas = categories.map((c) => categoryLpMintPDA(marketIdFromString(c), program)[0]);

  const [poolInfos, mintInfos] = await Promise.all([
    conn.getMultipleAccountsInfo(poolPdas),
    conn.getMultipleAccountsInfo(lpMintPdas),
  ]);

  const out = new Map<string, ParquetPoolHealth>();
  categories.forEach((c, i) => {
    const pInfo = poolInfos[i];
    if (!pInfo) return;
    try {
      const cp = decodeCategoryPool(pInfo.data);
      const mInfo = mintInfos[i];
      out.set(c, {
        totalUsdc: BigInt(cp.totalUsdc.toString()),
        escrowedUsdc: BigInt(cp.escrowedCollateralUsdc.toString()),
        reservedUsdc: BigInt(cp.sumReservedUsdc.toString()),
        queueTotalOwed: BigInt(cp.sumQueueOwedUsdc.toString()),
        lpSupply: mInfo ? readMintSupply(mInfo.data) : ZERO,
        isPaused: cp.isPaused,
      });
    } catch {
      // undecodable category pool (e.g. a stale layout) -- omit it
    }
  });
  return out;
}
