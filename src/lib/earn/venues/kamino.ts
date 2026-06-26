import {
  Connection,
  PublicKey,
  TransactionInstruction,
  ComputeBudgetProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { getServerConnection, sendAndConfirmServerTx } from '@/lib/solana-server';
import { getEarnTreasuryKeypair, getEarnTreasuryPubkey } from '@/lib/parquet-earn-treasury';
import type { EarnVenue, EarnMarket, EarnVenueHealth, EarnWithdrawOutcome } from '../venue-types';

// Kamino (klend) USDC lending -- Earn venue. Hand-rolled on @solana/web3.js 1.x
// (klend-sdk is @solana/kit-2.x, incompatible): klend is an Anchor program, so
// deposit/redeem/refresh are 8-byte discriminators + borsh args, and the Reserve
// is a fixed-size account decoded at offsets taken verbatim from klend-sdk source
// and cross-checked against the live mainnet reserve. cToken (collateral) model,
// same 6 decimals as USDC. No obligation -- the standalone reserve-liquidity path.

const ZERO = BigInt(0);
// Kamino's scaled-fraction (Fraction) scale is 2^60 -- borrowed/fees are stored
// as value * 2^60. (Verified on-chain: only /2^60 yields a cToken rate >= 1.0,
// which is required since collateral starts at 1:1 and only appreciates.)
const SF = BigInt(1) << BigInt(60);
const SLOTS_PER_YEAR = 63_072_000;

// Anchor discriminators (sha256("global:<ix>")[:8]).
const DISC_DEPOSIT = Buffer.from([169, 201, 30, 126, 6, 205, 102, 68]);
const DISC_REDEEM = Buffer.from([234, 117, 181, 125, 185, 142, 220, 29]);
const DISC_REFRESH = Buffer.from([2, 218, 138, 235, 79, 201, 25, 102]);

const MAINNET = {
  programId: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
  market: '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF',
  usdcReserve: 'D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59',
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

const MARKET = 'usdc';

function isKaminoConfigured(): boolean {
  return true;
}

interface KaminoConfig {
  programId: PublicKey;
  market: PublicKey;
  marketAuthority: PublicKey;
  reserve: PublicKey;
  usdcMint: PublicKey;
}

let cachedConfig: KaminoConfig | null = null;

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function getConfig(): KaminoConfig {
  if (cachedConfig) return cachedConfig;
  const programId = new PublicKey(env('KAMINO_PROGRAM_ID', MAINNET.programId));
  const market = new PublicKey(env('KAMINO_MARKET', MAINNET.market));
  // lendingMarketAuthority PDA: seeds = ["lma", market].
  const [marketAuthority] = PublicKey.findProgramAddressSync([Buffer.from('lma'), market.toBuffer()], programId);
  cachedConfig = {
    programId,
    market,
    marketAuthority,
    reserve: new PublicKey(env('KAMINO_USDC_RESERVE', MAINNET.usdcReserve)),
    usdcMint: new PublicKey(env('KAMINO_USDC_MINT', MAINNET.usdcMint)),
  };
  return cachedConfig;
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
  return buf.readBigUInt64LE(offset) + (buf.readBigUInt64LE(offset + 8) << BigInt(64));
}

// Verified byte offsets into the klend Reserve account (8624 bytes), validated
// against the live mainnet USDC reserve (availableAmount == supplyVault balance).
const RESERVE_MIN_LEN = 5256;
const OFF = {
  liquidityMint: 128,
  supplyVault: 160,
  availableAmount: 224, // u64
  borrowedAmountSf: 232, // u128 SF.64
  accProtocolFeesSf: 344, // u128 SF.64
  accReferrerFeesSf: 360, // u128 SF.64
  pendingReferrerFeesSf: 376, // u128 SF.64
  collateralMint: 2560,
  collateralSupply: 2592, // u64
  status: 4856, // u8 (0 = Active)
  protocolTakeRatePct: 4870, // u8
  borrowRateCurve: 4920, // 11 x (u32 utilBps, u32 rateBps)
  scopePrices: 5112,
  switchboardPrice: 5160,
  switchboardTwap: 5192,
  pythPrice: 5224,
} as const;

interface DecodedReserve {
  supplyVault: PublicKey;
  collateralMint: PublicKey;
  availableAmount: bigint;
  borrowedAmountSf: bigint;
  accProtocolFeesSf: bigint;
  accReferrerFeesSf: bigint;
  pendingReferrerFeesSf: bigint;
  collateralSupply: bigint;
  status: number;
  protocolTakeRatePct: number;
  curve: Array<[number, number]>; // [utilBps, rateBps]
  pyth: PublicKey;
  switchboardPrice: PublicKey;
  switchboardTwap: PublicKey;
  scope: PublicKey;
}

function decodeReserve(data: Buffer): DecodedReserve {
  if (data.length < RESERVE_MIN_LEN) {
    throw new Error(`unexpected Kamino reserve account size ${data.length}`);
  }
  const curve: Array<[number, number]> = [];
  for (let i = 0; i < 11; i++) {
    const o = OFF.borrowRateCurve + i * 8;
    curve.push([data.readUInt32LE(o), data.readUInt32LE(o + 4)]);
  }
  return {
    supplyVault: new PublicKey(data.subarray(OFF.supplyVault, OFF.supplyVault + 32)),
    collateralMint: new PublicKey(data.subarray(OFF.collateralMint, OFF.collateralMint + 32)),
    availableAmount: data.readBigUInt64LE(OFF.availableAmount),
    borrowedAmountSf: readU128LE(data, OFF.borrowedAmountSf),
    accProtocolFeesSf: readU128LE(data, OFF.accProtocolFeesSf),
    accReferrerFeesSf: readU128LE(data, OFF.accReferrerFeesSf),
    pendingReferrerFeesSf: readU128LE(data, OFF.pendingReferrerFeesSf),
    collateralSupply: data.readBigUInt64LE(OFF.collateralSupply),
    status: data.readUInt8(OFF.status),
    protocolTakeRatePct: data.readUInt8(OFF.protocolTakeRatePct),
    curve,
    pyth: new PublicKey(data.subarray(OFF.pythPrice, OFF.pythPrice + 32)),
    switchboardPrice: new PublicKey(data.subarray(OFF.switchboardPrice, OFF.switchboardPrice + 32)),
    switchboardTwap: new PublicKey(data.subarray(OFF.switchboardTwap, OFF.switchboardTwap + 32)),
    scope: new PublicKey(data.subarray(OFF.scopePrices, OFF.scopePrices + 32)),
  };
}

async function fetchReserve(conn: Connection, cfg: KaminoConfig): Promise<DecodedReserve> {
  const info = await conn.getAccountInfo(cfg.reserve);
  if (!info) throw new Error(`Kamino USDC reserve ${cfg.reserve.toBase58()} not found on-chain`);
  return decodeReserve(info.data);
}

// Total underlying USDC backing the cTokens, in SF.64 scaled-fraction units, so
// valuation keeps full precision against the scaled borrowed/fees fields.
function totalSupplySf(r: DecodedReserve): bigint {
  return r.availableAmount * SF + r.borrowedAmountSf - r.accProtocolFeesSf - r.accReferrerFeesSf - r.pendingReferrerFeesSf;
}

// USDC micro-value of `units` cTokens = units * totalSupply / collateralSupply.
function cTokenToUsdc(units: bigint, r: DecodedReserve): bigint {
  if (units <= ZERO || r.collateralSupply <= ZERO) return ZERO;
  const tsSf = totalSupplySf(r);
  if (tsSf <= ZERO) return ZERO;
  return (units * tsSf) / (SF * r.collateralSupply);
}

// Supply APY from the borrow-rate curve (klend reserve.ts replica): piecewise
// linear borrow rate over utilization, supply APR = util * borrowAPR *
// (1 - protocolTakeRate), then per-slot compounded to APY.
function supplyApyBps(r: DecodedReserve): number {
  const tsSf = totalSupplySf(r);
  if (tsSf <= ZERO) return 0;
  const total = Number(tsSf) / Number(SF);
  const borrowed = Number(r.borrowedAmountSf) / Number(SF);
  const util = total > 0 ? borrowed / total : 0;
  const utilBps = util * 10_000;

  let rateBps = r.curve.length ? r.curve[r.curve.length - 1][1] : 0;
  for (let i = 0; i < r.curve.length - 1; i++) {
    const [u0, rt0] = r.curve[i];
    const [u1, rt1] = r.curve[i + 1];
    if (utilBps <= u0) { rateBps = rt0; break; }
    if (utilBps <= u1) { rateBps = rt0 + ((utilBps - u0) / (u1 - u0)) * (rt1 - rt0); break; }
  }
  const supplyApr = util * (rateBps / 10_000) * (1 - r.protocolTakeRatePct / 100);
  const apy = (1 + supplyApr / SLOTS_PER_YEAR) ** SLOTS_PER_YEAR - 1;
  return Math.round(apy * 10_000);
}

function treasuryUsdcAta(cfg: KaminoConfig): PublicKey {
  return getAssociatedTokenAddressSync(cfg.usdcMint, getEarnTreasuryPubkey());
}

function treasuryCollateralAta(collateralMint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(collateralMint, getEarnTreasuryPubkey());
}

// Pass the klend program id in place of an unused (default/all-1s) oracle, as
// klend's own `optionalAccount` helper does.
function oracleOrPlaceholder(decoded: PublicKey, programId: PublicKey): PublicKey {
  return decoded.equals(PublicKey.default) ? programId : decoded;
}

function refreshReserveIx(cfg: KaminoConfig, r: DecodedReserve): TransactionInstruction {
  return new TransactionInstruction({
    programId: cfg.programId,
    data: DISC_REFRESH,
    keys: [
      { pubkey: cfg.reserve, isSigner: false, isWritable: true },
      { pubkey: cfg.market, isSigner: false, isWritable: false },
      { pubkey: oracleOrPlaceholder(r.pyth, cfg.programId), isSigner: false, isWritable: false },
      { pubkey: oracleOrPlaceholder(r.switchboardPrice, cfg.programId), isSigner: false, isWritable: false },
      { pubkey: oracleOrPlaceholder(r.switchboardTwap, cfg.programId), isSigner: false, isWritable: false },
      { pubkey: oracleOrPlaceholder(r.scope, cfg.programId), isSigner: false, isWritable: false },
    ],
  });
}

function depositIx(
  cfg: KaminoConfig,
  r: DecodedReserve,
  amount: bigint,
  userUsdc: PublicKey,
  userCollateral: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: cfg.programId,
    data: Buffer.concat([DISC_DEPOSIT, u64le(amount)]),
    keys: [
      { pubkey: getEarnTreasuryPubkey(), isSigner: true, isWritable: true },
      { pubkey: cfg.reserve, isSigner: false, isWritable: true },
      { pubkey: cfg.market, isSigner: false, isWritable: false },
      { pubkey: cfg.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: cfg.usdcMint, isSigner: false, isWritable: false },
      { pubkey: r.supplyVault, isSigner: false, isWritable: true },
      { pubkey: r.collateralMint, isSigner: false, isWritable: true },
      { pubkey: userUsdc, isSigner: false, isWritable: true },
      { pubkey: userCollateral, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
  });
}

function redeemIx(
  cfg: KaminoConfig,
  r: DecodedReserve,
  units: bigint,
  userCollateral: PublicKey,
  userUsdc: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: cfg.programId,
    data: Buffer.concat([DISC_REDEEM, u64le(units)]),
    keys: [
      { pubkey: getEarnTreasuryPubkey(), isSigner: true, isWritable: true },
      { pubkey: cfg.market, isSigner: false, isWritable: false },
      { pubkey: cfg.reserve, isSigner: false, isWritable: true },
      { pubkey: cfg.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: cfg.usdcMint, isSigner: false, isWritable: false },
      { pubkey: r.collateralMint, isSigner: false, isWritable: true },
      { pubkey: r.supplyVault, isSigner: false, isWritable: true },
      { pubkey: userCollateral, isSigner: false, isWritable: true },
      { pubkey: userUsdc, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
  });
}

export const kaminoVenue: EarnVenue = {
  id: 'kamino',
  label: 'Kamino',
  product: {
    kind: 'lending',
    label: 'Lending',
    risk: 'lower',
    aprLabel: 'Supply APY',
  },

  isConfigured(): boolean {
    return isKaminoConfigured();
  },

  listMarkets(): EarnMarket[] {
    if (!isKaminoConfigured()) return [];
    return [{ venue: 'kamino', market: MARKET, key: `kamino:${MARKET}`, label: 'Kamino USDC', asset: 'USDC' }];
  },

  isMarketEnabled(market: string): boolean {
    return isKaminoConfigured() && market === MARKET;
  },

  async readPositionUnits(market: string): Promise<bigint> {
    void market;
    const conn = getServerConnection();
    const reserve = await fetchReserve(conn, getConfig());
    return readTokenAmount(conn, treasuryCollateralAta(reserve.collateralMint));
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
      totalUsdc: totalSupplySf(reserve) / SF,
      isPaused: reserve.status !== 0,
      aprBps: supplyApyBps(reserve),
    };
  },

  // Deposits treasury USDC, measuring cTokens minted as the treasury collateral
  // balance delta. refreshReserve must precede the deposit (else the program
  // rejects a stale reserve). Lending mints at the on-chain rate -- no slippage.
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
    const reserve = await fetchReserve(conn, cfg);
    const usdcAta = treasuryUsdcAta(cfg);
    const collateralAta = treasuryCollateralAta(reserve.collateralMint);

    const before = await readTokenAmount(conn, collateralAta);
    const ixs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, collateralAta, treasury.publicKey, reserve.collateralMint),
      refreshReserveIx(cfg, reserve),
      depositIx(cfg, reserve, amountUsdc, usdcAta, collateralAta),
    ];
    const txHash = await sendAndConfirmServerTx(conn, ixs, treasury);

    const unitsMinted = (await readTokenAmount(conn, collateralAta)) - before;
    if (unitsMinted <= ZERO) {
      throw new Error(`Kamino deposit ${txHash} minted no cTokens (before=${before})`);
    }
    return { txHash, unitsMinted };
  },

  // Redeems cTokens for treasury USDC, gated on the reserve holding enough free
  // liquidity (else illiquid -> deferred); a revert also defers.
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
    const collateralAta = treasuryCollateralAta(reserve.collateralMint);
    const before = await readTokenAmount(conn, usdcAta);

    let txHash = '';
    try {
      const ixs = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        refreshReserveIx(cfg, reserve),
        redeemIx(cfg, reserve, units, collateralAta, usdcAta),
      ];
      txHash = await sendAndConfirmServerTx(conn, ixs, treasury);
    } catch (err) {
      console.warn('Kamino redeem failed, deferring:', err instanceof Error ? err.message : err);
      return { status: 'illiquid', estimateUsdc };
    }

    const received = (await readTokenAmount(conn, usdcAta)) - before;
    if (received <= ZERO) {
      throw new Error('Kamino redeem cleared no USDC -- aborting before payout');
    }
    return { status: 'settled', txHash, received };
  },
};
