import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { USDC_MINT } from '@/lib/solana-pay';
import { getServerConnection, sendAndConfirmServerTx } from '@/lib/solana-server';
import { getEarnTreasuryKeypair, getEarnTreasuryPubkey } from '@/lib/parquet-earn-treasury';
import {
  isParquetEarnConfigured,
  isCategoryEnabled,
  getEnabledCategories,
  buildTreasuryDepositInstructions,
  buildTreasuryWithdrawInstructions,
  readTreasuryLpBalance,
  readPoolHealth,
  availableLiquidity,
  valueLpInUsdc,
  type ParquetPoolHealth,
} from '@/lib/parquet-earn';
import type { EarnVenue, EarnMarket, EarnVenueHealth, EarnWithdrawOutcome } from '../venue-types';

// Parquet category LP pools -- Earn's first venue. This wraps the on-chain
// adapter in `parquet-earn.ts` and owns the deposit/withdraw orchestration and
// slippage math that used to live inline in the flows layer; the behaviour is
// preserved exactly so existing positions are unaffected.

const ZERO = BigInt(0);
const BPS = BigInt(10_000);

function applySlippageDown(amount: bigint, slippageBps: number): bigint {
  return (amount * (BPS - BigInt(slippageBps))) / BPS;
}

// LP is priced against pool EQUITY (availableLiquidity = total minus trader-owed
// escrow/reserved/queue), which is what the program mints and redeems against.
function computeMinLpOut(amountUsdc: bigint, health: ParquetPoolHealth, slippageBps: number): bigint {
  const equity = availableLiquidity(health);
  if (equity <= ZERO || health.lpSupply <= ZERO) return ZERO;
  const expectedLp = (amountUsdc * health.lpSupply) / equity;
  return applySlippageDown(expectedLp, slippageBps);
}

function computeMinOut(lpAmount: bigint, health: ParquetPoolHealth, slippageBps: number): bigint {
  if (health.lpSupply <= ZERO) return ZERO;
  const expectedUsdc = (lpAmount * availableLiquidity(health)) / health.lpSupply;
  return applySlippageDown(expectedUsdc, slippageBps);
}

function expectedUsdcForLp(lp: bigint, health: ParquetPoolHealth): bigint {
  return health.lpSupply > ZERO ? (lp * availableLiquidity(health)) / health.lpSupply : ZERO;
}

function treasuryUsdcAta(): PublicKey {
  return getAssociatedTokenAddressSync(USDC_MINT, getEarnTreasuryPubkey());
}

async function readSplBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  const info = await conn.getTokenAccountBalance(ata).catch(() => null);
  if (!info?.value?.amount) return ZERO;
  return BigInt(info.value.amount);
}

export const parquetVenue: EarnVenue = {
  id: 'parquet',
  label: 'Parquet',

  isConfigured(): boolean {
    return isParquetEarnConfigured();
  },

  listMarkets(): EarnMarket[] {
    return getEnabledCategories().map((market) => ({
      venue: 'parquet',
      market,
      key: market,
      label: market,
      asset: 'USDC',
    }));
  },

  isMarketEnabled(market: string): boolean {
    return isCategoryEnabled(market);
  },

  readPositionUnits(market: string): Promise<bigint> {
    return readTreasuryLpBalance(market);
  },

  valueUnits(market: string, units: bigint): Promise<bigint> {
    return valueLpInUsdc(market, units);
  },

  async readHealth(market: string): Promise<EarnVenueHealth> {
    const health = await readPoolHealth(market);
    return { availableUsdc: availableLiquidity(health), isPaused: health.isPaused };
  },

  // Deposits USDC already in the treasury and measures the LP minted as the
  // treasury LP balance delta for the category.
  async deposit(
    market: string,
    amountUsdc: bigint,
    slippageBps: number,
  ): Promise<{ txHash: string; unitsMinted: bigint }> {
    const conn = getServerConnection();
    const treasury = getEarnTreasuryKeypair();
    const health = await readPoolHealth(market, conn);
    const minLpOut = computeMinLpOut(amountUsdc, health, slippageBps);

    const lpBefore = await readTreasuryLpBalance(market, conn);
    const ixs = await buildTreasuryDepositInstructions(market, amountUsdc, minLpOut);
    const txHash = await sendAndConfirmServerTx(conn, ixs, treasury);
    const lpAfter = await readTreasuryLpBalance(market, conn);

    const unitsMinted = lpAfter - lpBefore;
    if (unitsMinted <= ZERO) {
      throw new Error(`deposit ${txHash} produced no LP (before=${lpBefore} after=${lpAfter})`);
    }
    return { txHash, unitsMinted };
  },

  // Tries to redeem LP to treasury USDC. withdraw_category is atomic, so the
  // attempt is gated on free liquidity covering minOut; a revert (liquidity moved
  // between read and send) defers, while a cleared-but-zero redeem is a hard error
  // (LP would have burned for nothing) raised before any payout.
  async withdraw(
    market: string,
    units: bigint,
    slippageBps: number,
  ): Promise<EarnWithdrawOutcome> {
    const conn = getServerConnection();
    const treasury = getEarnTreasuryKeypair();
    const health = await readPoolHealth(market, conn);
    const minOut = computeMinOut(units, health, slippageBps);
    const estimateUsdc = expectedUsdcForLp(units, health);

    if (!health.isPaused && minOut > ZERO && availableLiquidity(health) >= minOut) {
      const usdcAta = treasuryUsdcAta();
      const usdcBefore = await readSplBalance(conn, usdcAta);
      let txCleared = false;
      let redeemTx = '';
      try {
        const ixs = await buildTreasuryWithdrawInstructions(market, units, minOut);
        redeemTx = await sendAndConfirmServerTx(conn, ixs, treasury);
        txCleared = true;
      } catch (err) {
        console.warn('immediate category withdraw failed, deferring:', err instanceof Error ? err.message : err);
      }

      if (txCleared) {
        const received = (await readSplBalance(conn, usdcAta)) - usdcBefore;
        if (received <= ZERO) {
          throw new Error('category withdraw cleared no USDC -- aborting before payout');
        }
        return { status: 'settled', txHash: redeemTx, received };
      }
    }

    return { status: 'illiquid', estimateUsdc };
  },
};
