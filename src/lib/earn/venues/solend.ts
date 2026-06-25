import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { getServerConnection, sendAndConfirmServerTx } from '@/lib/solana-server';
import { getEarnTreasuryKeypair, getEarnTreasuryPubkey } from '@/lib/parquet-earn-treasury';
import type { EarnVenue, EarnMarket, EarnVenueHealth, EarnWithdrawOutcome } from '../venue-types';

// Solend / Save Finance USDC lending -- Earn venue #2. Supply USDC to the main
// pool's USDC reserve, hold the cUSDC collateral token, earn supply interest.
//
// This is hand-rolled on @solana/web3.js 1.x (no SDK runtime dependency): the
// Solend program is a token-lending fork, so deposit/redeem/refresh are fixed
// [u8 tag, u64 LE] instructions with fixed account lists, and the only state we
// read is a handful of fields decoded from the reserve account at verified
// offsets. The encoding + offsets were taken verbatim from @solendprotocol/
// solend-sdk@0.14.27 source (instructions/*, state/reserve.ts, RESERVE_SIZE=619).
//
// units = cUSDC (collateral) amount. cUSDC has the same 6 decimals as USDC.

const ZERO = BigInt(0);
const WAD = BigInt('1000000000000000000'); // 10^18, Solend's fixed-point scale

// LendingInstruction tags (spl token-lending enum, used by Solend).
const IX_REFRESH_RESERVE = 3;
const IX_DEPOSIT_RESERVE_LIQUIDITY = 4;
const IX_REDEEM_RESERVE_COLLATERAL = 5;

// Mainnet main-pool USDC reserve constants (env-overridable). The lending-market
// authority is a PDA of the market, so it is derived rather than hardcoded; the
// reserve's oracle accounts are read live from the reserve (robust to rotation).
const MAINNET = {
  programId: 'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo',
  market: '4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY',
  usdcReserve: 'BgxfHJDzm44T7XG68MYKx7YisTjZu73tVovyZSjJMpmw',
  cusdcMint: '993dVFL2uXWYeoXuEBFXR4BijeXdTv4s6BzsCjJZuwqk',
  reserveLiquiditySupply: '8SheGtsopRUDzdiD6v6BR9a6bqZ9QwywYQY99Fp5meNf',
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

const MARKET = 'usdc';

// Solend is always on (mainnet constants are baked in). Deposits stay gated by
// the global EARN_DEPOSITS_OPEN admin switch, same as every venue.
function isSolendConfigured(): boolean {
  return true;
}

interface SolendConfig {
  programId: PublicKey;
  market: PublicKey;
  marketAuthority: PublicKey;
  reserve: PublicKey;
  cusdcMint: PublicKey;
  reserveLiquiditySupply: PublicKey;
  usdcMint: PublicKey;
}

let cachedConfig: SolendConfig | null = null;

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function getConfig(): SolendConfig {
  if (cachedConfig) return cachedConfig;
  const programId = new PublicKey(env('SOLEND_PROGRAM_ID', MAINNET.programId));
  const market = new PublicKey(env('SOLEND_MARKET', MAINNET.market));
  // Lending-market authority PDA: findProgramAddress([market], program).
  const [marketAuthority] = PublicKey.findProgramAddressSync([market.toBuffer()], programId);
  cachedConfig = {
    programId,
    market,
    marketAuthority,
    reserve: new PublicKey(env('SOLEND_USDC_RESERVE', MAINNET.usdcReserve)),
    cusdcMint: new PublicKey(env('SOLEND_CUSDC_MINT', MAINNET.cusdcMint)),
    reserveLiquiditySupply: new PublicKey(env('SOLEND_RESERVE_LIQUIDITY_SUPPLY', MAINNET.reserveLiquiditySupply)),
    usdcMint: new PublicKey(env('SOLEND_USDC_MINT', MAINNET.usdcMint)),
  };
  return cachedConfig;
}

function treasuryCusdcAta(cfg: SolendConfig): PublicKey {
  return getAssociatedTokenAddressSync(cfg.cusdcMint, getEarnTreasuryPubkey());
}

function treasuryUsdcAta(cfg: SolendConfig): PublicKey {
  return getAssociatedTokenAddressSync(cfg.usdcMint, getEarnTreasuryPubkey());
}

async function readTokenAmount(conn: Connection, ata: PublicKey): Promise<bigint> {
  const info = await conn.getTokenAccountBalance(ata).catch(() => null);
  if (!info?.value?.amount) return ZERO;
  return BigInt(info.value.amount);
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function readU128LE(buf: Buffer, offset: number): bigint {
  const lo = buf.readBigUInt64LE(offset);
  const hi = buf.readBigUInt64LE(offset + 8);
  return lo + (hi << BigInt(64));
}

// Verified byte offsets into the Solend Reserve account (RESERVE_SIZE = 619),
// derived from ReserveLayout in solend-sdk state/reserve.ts (LastUpdate = 9B).
// RESERVE_SIZE = 619. The interest-rate config fields after the 56-byte
// RateLimiter (maxUtilizationRate @470, superMaxBorrowRate @471) are placed by
// the layout closing exactly at 619; all offsets are cross-checked against live
// mainnet (see scratchpad verify script).
const RESERVE_DATA_LEN = 619;
const OFF = {
  pythOracle: 107,
  switchboardOracle: 139,
  availableAmount: 171, // u64
  borrowedAmountWads: 179, // u128
  optimalUtilizationRate: 299, // u8 (percent)
  minBorrowRate: 303, // u8 (percent)
  optimalBorrowRate: 304, // u8 (percent)
  maxBorrowRate: 305, // u8 (percent)
  cTokenSupply: 259, // u64 (collateral.mintTotalSupply)
  depositLimit: 323, // u64
  borrowLimit: 331, // u64
  protocolTakeRate: 372, // u8 (percent)
  protocolFeesWads: 373, // u128
  maxUtilizationRate: 470, // u8 (percent)
  superMaxBorrowRate: 471, // u64 (percent)
} as const;

interface DecodedReserve {
  pythOracle: PublicKey;
  switchboardOracle: PublicKey;
  availableAmount: bigint;
  borrowedAmountWads: bigint;
  accumulatedProtocolFeesWads: bigint;
  cTokenSupply: bigint;
  depositLimit: bigint;
  borrowLimit: bigint;
  optimalUtilizationRate: number;
  maxUtilizationRate: number;
  minBorrowRate: number;
  optimalBorrowRate: number;
  maxBorrowRate: number;
  superMaxBorrowRate: bigint;
  protocolTakeRate: number;
}

function decodeReserve(data: Buffer): DecodedReserve {
  if (data.length < RESERVE_DATA_LEN) {
    throw new Error(`unexpected Solend reserve account size ${data.length} (expected ${RESERVE_DATA_LEN})`);
  }
  return {
    pythOracle: new PublicKey(data.subarray(OFF.pythOracle, OFF.pythOracle + 32)),
    switchboardOracle: new PublicKey(data.subarray(OFF.switchboardOracle, OFF.switchboardOracle + 32)),
    availableAmount: data.readBigUInt64LE(OFF.availableAmount),
    borrowedAmountWads: readU128LE(data, OFF.borrowedAmountWads),
    accumulatedProtocolFeesWads: readU128LE(data, OFF.protocolFeesWads),
    cTokenSupply: data.readBigUInt64LE(OFF.cTokenSupply),
    depositLimit: data.readBigUInt64LE(OFF.depositLimit),
    borrowLimit: data.readBigUInt64LE(OFF.borrowLimit),
    optimalUtilizationRate: data.readUInt8(OFF.optimalUtilizationRate),
    maxUtilizationRate: data.readUInt8(OFF.maxUtilizationRate),
    minBorrowRate: data.readUInt8(OFF.minBorrowRate),
    optimalBorrowRate: data.readUInt8(OFF.optimalBorrowRate),
    maxBorrowRate: data.readUInt8(OFF.maxBorrowRate),
    superMaxBorrowRate: data.readBigUInt64LE(OFF.superMaxBorrowRate),
    protocolTakeRate: data.readUInt8(OFF.protocolTakeRate),
  };
}

// Supply APY, replicating solend-sdk core/utils/rates.ts. Config rate fields are
// integer percents (/100). Borrow APR is a 3-slope piecewise of utilization;
// supply APR = utilization * borrowAPR * (1 - protocolTakeRate); APY compounds
// per-slot over SLOTS_PER_YEAR. Float math is ample for a displayed percentage.
const SLOTS_PER_YEAR = 63_072_000;

function supplyAprFraction(r: DecodedReserve): number {
  const borrowed = Number(r.borrowedAmountWads) / 1e18; // -> micro-USDC
  const available = Number(r.availableAmount);
  const total = borrowed + available;
  if (total <= 0) return 0;
  const u = borrowed / total;

  const optimalUtil = r.optimalUtilizationRate / 100;
  const maxUtil = r.maxUtilizationRate / 100;
  const minR = r.minBorrowRate / 100;
  const optR = r.optimalBorrowRate / 100;
  const maxR = r.maxBorrowRate / 100;
  const superR = Number(r.superMaxBorrowRate) / 100;

  let borrowApr: number;
  if (u <= optimalUtil) {
    borrowApr = optimalUtil === 0 ? minR : (u / optimalUtil) * (optR - minR) + minR;
  } else if (u <= maxUtil) {
    const w = (u - optimalUtil) / (maxUtil - optimalUtil);
    borrowApr = w * (maxR - optR) + optR;
  } else {
    const w = (u - maxUtil) / (1 - maxUtil);
    borrowApr = w * (superR - maxR) + maxR;
  }
  return u * borrowApr * (1 - r.protocolTakeRate / 100);
}

function supplyApyBps(r: DecodedReserve): number {
  const apr = supplyAprFraction(r);
  const apy = (1 + apr / SLOTS_PER_YEAR) ** SLOTS_PER_YEAR - 1;
  return Math.round(apy * 10_000);
}

async function fetchReserve(conn: Connection, cfg: SolendConfig): Promise<DecodedReserve> {
  const info = await conn.getAccountInfo(cfg.reserve);
  if (!info) throw new Error(`Solend USDC reserve ${cfg.reserve.toBase58()} not found on-chain`);
  return decodeReserve(info.data);
}

// cUSDC NAV in micro-USDC. exchangeRate = totalDeposits / cTokenSupply, where
// totalDepositsWads = borrowedAmountWads + availableAmount*WAD - protocolFeesWads.
// usdcMicro = cTokenMicro * totalDepositsWads / (cTokenSupply * WAD). cUSDC and
// USDC share 6 decimals, so the micro scales cancel.
function cTokenToUsdc(units: bigint, r: DecodedReserve): bigint {
  if (units <= ZERO || r.cTokenSupply <= ZERO) return ZERO;
  const totalDepositsWads = r.borrowedAmountWads + r.availableAmount * WAD - r.accumulatedProtocolFeesWads;
  if (totalDepositsWads <= ZERO) return ZERO;
  return (units * totalDepositsWads) / (r.cTokenSupply * WAD);
}

function refreshReserveIx(cfg: SolendConfig, r: DecodedReserve): TransactionInstruction {
  return new TransactionInstruction({
    programId: cfg.programId,
    data: Buffer.from([IX_REFRESH_RESERVE]),
    keys: [
      { pubkey: cfg.reserve, isSigner: false, isWritable: true },
      { pubkey: r.pythOracle, isSigner: false, isWritable: false },
      { pubkey: r.switchboardOracle, isSigner: false, isWritable: false },
    ],
  });
}

function depositReserveLiquidityIx(
  cfg: SolendConfig,
  amount: bigint,
  sourceLiquidity: PublicKey,
  destinationCollateral: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: cfg.programId,
    data: Buffer.concat([Buffer.from([IX_DEPOSIT_RESERVE_LIQUIDITY]), u64le(amount)]),
    keys: [
      { pubkey: sourceLiquidity, isSigner: false, isWritable: true },
      { pubkey: destinationCollateral, isSigner: false, isWritable: true },
      { pubkey: cfg.reserve, isSigner: false, isWritable: true },
      { pubkey: cfg.reserveLiquiditySupply, isSigner: false, isWritable: true },
      { pubkey: cfg.cusdcMint, isSigner: false, isWritable: true },
      { pubkey: cfg.market, isSigner: false, isWritable: false },
      { pubkey: cfg.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: getEarnTreasuryPubkey(), isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

function redeemReserveCollateralIx(
  cfg: SolendConfig,
  amount: bigint,
  sourceCollateral: PublicKey,
  destinationLiquidity: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: cfg.programId,
    data: Buffer.concat([Buffer.from([IX_REDEEM_RESERVE_COLLATERAL]), u64le(amount)]),
    keys: [
      { pubkey: sourceCollateral, isSigner: false, isWritable: true },
      { pubkey: destinationLiquidity, isSigner: false, isWritable: true },
      { pubkey: cfg.reserve, isSigner: false, isWritable: true },
      { pubkey: cfg.cusdcMint, isSigner: false, isWritable: true },
      { pubkey: cfg.reserveLiquiditySupply, isSigner: false, isWritable: true },
      // lendingMarket is WRITABLE in the redeem instruction (0.14.x).
      { pubkey: cfg.market, isSigner: false, isWritable: true },
      { pubkey: cfg.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: getEarnTreasuryPubkey(), isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

export const solendVenue: EarnVenue = {
  id: 'solend',
  label: 'Solend',
  product: {
    kind: 'lending',
    label: 'Lending',
    risk: 'lower',
    aprLabel: 'Supply APY',
  },

  isConfigured(): boolean {
    return isSolendConfigured();
  },

  listMarkets(): EarnMarket[] {
    if (!isSolendConfigured()) return [];
    return [{ venue: 'solend', market: MARKET, key: `solend:${MARKET}`, label: 'Solend USDC', asset: 'USDC' }];
  },

  isMarketEnabled(market: string): boolean {
    return isSolendConfigured() && market === MARKET;
  },

  readPositionUnits(market: string): Promise<bigint> {
    void market;
    return readTokenAmount(getServerConnection(), treasuryCusdcAta(getConfig()));
  },

  async valueUnits(market: string, units: bigint): Promise<bigint> {
    void market;
    if (units <= ZERO) return ZERO;
    const reserve = await fetchReserve(getServerConnection(), getConfig());
    return cTokenToUsdc(units, reserve);
  },

  async readHealth(market: string): Promise<EarnVenueHealth> {
    void market;
    const reserve = await fetchReserve(getServerConnection(), getConfig());
    return {
      availableUsdc: reserve.availableAmount,
      totalUsdc: reserve.availableAmount + reserve.borrowedAmountWads / WAD,
      isPaused: reserve.depositLimit === ZERO && reserve.borrowLimit === ZERO,
      aprBps: supplyApyBps(reserve),
    };
  },

  // Deposits treasury USDC into the reserve and measures cUSDC minted as the
  // treasury cUSDC balance delta. Lending deposits mint at the on-chain exchange
  // rate (no AMM-style slippage), so slippageBps is accepted but unused.
  async deposit(
    market: string,
    amountUsdc: bigint,
    slippageBps: number,
  ): Promise<{ txHash: string; unitsMinted: bigint }> {
    void market;
    void slippageBps;
    const conn = getServerConnection();
    const cfg = getConfig();
    const treasury = getEarnTreasuryKeypair();
    const cusdcAta = treasuryCusdcAta(cfg);
    const usdcAta = treasuryUsdcAta(cfg);

    const reserve = await fetchReserve(conn, cfg);
    const before = await readTokenAmount(conn, cusdcAta);

    const ixs = [
      createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, cusdcAta, treasury.publicKey, cfg.cusdcMint),
      refreshReserveIx(cfg, reserve),
      depositReserveLiquidityIx(cfg, amountUsdc, usdcAta, cusdcAta),
    ];
    const txHash = await sendAndConfirmServerTx(conn, ixs, treasury);

    const unitsMinted = (await readTokenAmount(conn, cusdcAta)) - before;
    if (unitsMinted <= ZERO) {
      throw new Error(`Solend deposit ${txHash} minted no cUSDC (before=${before})`);
    }
    return { txHash, unitsMinted };
  },

  // Redeems cUSDC for treasury USDC. Gated on the reserve holding enough free
  // liquidity to cover the redeem (else illiquid -> the flow defers to the cron);
  // a revert (liquidity moved between read and send) also defers.
  async withdraw(
    market: string,
    units: bigint,
    slippageBps: number,
  ): Promise<EarnWithdrawOutcome> {
    void market;
    void slippageBps;
    const conn = getServerConnection();
    const cfg = getConfig();
    const treasury = getEarnTreasuryKeypair();

    const reserve = await fetchReserve(conn, cfg);
    const estimateUsdc = cTokenToUsdc(units, reserve);
    if (estimateUsdc <= ZERO || reserve.availableAmount < estimateUsdc) {
      return { status: 'illiquid', estimateUsdc };
    }

    const usdcAta = treasuryUsdcAta(cfg);
    const cusdcAta = treasuryCusdcAta(cfg);
    const before = await readTokenAmount(conn, usdcAta);

    let txHash = '';
    try {
      const ixs = [
        refreshReserveIx(cfg, reserve),
        redeemReserveCollateralIx(cfg, units, cusdcAta, usdcAta),
      ];
      txHash = await sendAndConfirmServerTx(conn, ixs, treasury);
    } catch (err) {
      console.warn('Solend redeem failed, deferring:', err instanceof Error ? err.message : err);
      return { status: 'illiquid', estimateUsdc };
    }

    const received = (await readTokenAmount(conn, usdcAta)) - before;
    if (received <= ZERO) {
      throw new Error('Solend redeem cleared no USDC -- aborting before payout');
    }
    return { status: 'settled', txHash, received };
  },
};
