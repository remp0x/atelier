import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import BN from 'bn.js';
import VaultImpl from '@meteora-ag/vault-sdk';
import { getServerConnection, sendAndConfirmServerTx } from '@/lib/solana-server';
import { getEarnTreasuryKeypair, getEarnTreasuryPubkey } from '@/lib/parquet-earn-treasury';
import type { EarnVenue, EarnMarket, EarnVenueHealth, EarnWithdrawOutcome } from '../venue-types';

// Meteora Dynamic Vault (single-asset USDC) -- Earn venue. Uses the official
// @meteora-ag/vault-sdk (web3.js 1.x, clean tree): deposit USDC -> vault LP
// shares, withdraw burns shares -> USDC. Yield comes from the vault's
// auto-allocated lending strategies; share price = withdrawableAmount/lpSupply
// (with Yearn-style locked-profit smoothing handled by the SDK). units = vault LP.
//
// The SDK owns the complex withdraw path (buffer vs strategy unwind), so we lean
// on it for deposit/withdraw and read valuation via getWithdrawableAmount /
// getVaultSupply. APY is published off-chain (aggregator) -- read from the API.

const ZERO = BigInt(0);
const MARKET = 'usdc';
const VAULT_INFO_URL = 'https://merv2-api.meteora.ag/vault_info';
const APY_CACHE_MS = 60_000;

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

const USDC_MINT = new PublicKey(env('METEORA_USDC_MINT', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'));
const LP_MINT = new PublicKey(env('METEORA_USDC_LP_MINT', '3RpEekjLE5cdcG15YcXJUpxSepemvq2FpmMcgo342BwC'));
const VAULT_PUBKEY = env('METEORA_USDC_VAULT', '3ESUFCnRNgZ7Mn2mPPUMmXYaKU8jpnV9VtA17M7t2mHQ');

function isMeteoraConfigured(): boolean {
  return true;
}

function createVault(conn: Connection): Promise<VaultImpl> {
  return VaultImpl.create(conn, USDC_MINT);
}

function treasuryLpAta(): PublicKey {
  return getAssociatedTokenAddressSync(LP_MINT, getEarnTreasuryPubkey());
}

function treasuryUsdcAta(): PublicKey {
  return getAssociatedTokenAddressSync(USDC_MINT, getEarnTreasuryPubkey());
}

async function readTokenAmount(conn: Connection, ata: PublicKey): Promise<bigint> {
  const info = await conn.getTokenAccountBalance(ata).catch(() => null);
  if (!info?.value?.amount) return ZERO;
  return BigInt(info.value.amount);
}

// USDC micro-value of `units` LP shares = units * withdrawableAmount / lpSupply.
async function valueLpUnits(vault: VaultImpl, units: bigint): Promise<bigint> {
  if (units <= ZERO) return ZERO;
  const [withdrawable, lpSupply] = await Promise.all([vault.getWithdrawableAmount(), vault.getVaultSupply()]);
  const supply = BigInt(lpSupply.toString());
  if (supply <= ZERO) return ZERO;
  return (units * BigInt(withdrawable.toString())) / supply;
}

let apyCache: { at: number; bps: number | undefined } | null = null;

// Meteora publishes APY off-chain. `closest_apy` is in PERCENT units (0.6046 =>
// 0.60% APY), so bps = closest_apy * 100. Cached + best-effort (undefined on fail).
async function fetchSupplyApyBps(): Promise<number | undefined> {
  if (apyCache && Date.now() - apyCache.at < APY_CACHE_MS) return apyCache.bps;
  let bps: number | undefined;
  try {
    const res = await fetch(VAULT_INFO_URL, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      const arr = (await res.json()) as Array<{ token_address?: string; pubkey?: string; closest_apy?: number }>;
      const hit = arr.find((v) => v.pubkey === VAULT_PUBKEY || v.token_address === USDC_MINT.toBase58());
      if (hit && typeof hit.closest_apy === 'number') bps = Math.round(hit.closest_apy * 100);
    }
  } catch {
    // leave undefined -- the UI falls back to "Variable"
  }
  apyCache = { at: Date.now(), bps };
  return bps;
}

export const meteoraVenue: EarnVenue = {
  id: 'meteora',
  label: 'Meteora',
  product: {
    kind: 'lending',
    label: 'Lending',
    risk: 'lower',
    aprLabel: 'Supply APY',
  },

  isConfigured(): boolean {
    return isMeteoraConfigured();
  },

  listMarkets(): EarnMarket[] {
    if (!isMeteoraConfigured()) return [];
    return [{ venue: 'meteora', market: MARKET, key: `meteora:${MARKET}`, label: 'Meteora USDC', asset: 'USDC' }];
  },

  isMarketEnabled(market: string): boolean {
    return isMeteoraConfigured() && market === MARKET;
  },

  readPositionUnits(market: string): Promise<bigint> {
    void market;
    return readTokenAmount(getServerConnection(), treasuryLpAta());
  },

  async valueUnits(market: string, units: bigint): Promise<bigint> {
    void market;
    if (units <= ZERO) return ZERO;
    const vault = await createVault(getServerConnection());
    return valueLpUnits(vault, units);
  },

  async readHealth(market: string): Promise<EarnVenueHealth> {
    void market;
    const vault = await createVault(getServerConnection());
    const [withdrawable, aprBps] = await Promise.all([vault.getWithdrawableAmount(), fetchSupplyApyBps()]);
    return {
      availableUsdc: BigInt(withdrawable.toString()),
      totalUsdc: BigInt(vault.vaultState.totalAmount.toString()),
      isPaused: vault.vaultState.enabled !== 1,
      aprBps,
    };
  },

  // Deposits treasury USDC into the vault, measuring LP minted as the treasury LP
  // balance delta. The SDK builds the tx (incl. any ATA setup); we sign + send.
  async deposit(
    market: string,
    amountUsdc: bigint,
    slippageBps: number,
  ): Promise<{ txHash: string; unitsMinted: bigint }> {
    void market;
    void slippageBps;
    const conn = getServerConnection();
    const treasury = getEarnTreasuryKeypair();
    const vault = await createVault(conn);
    const lpAta = treasuryLpAta();

    const before = await readTokenAmount(conn, lpAta);
    const tx = await vault.deposit(treasury.publicKey, new BN(amountUsdc.toString()));
    const txHash = await sendAndConfirmServerTx(conn, tx.instructions, treasury);

    const unitsMinted = (await readTokenAmount(conn, lpAta)) - before;
    if (unitsMinted <= ZERO) {
      throw new Error(`Meteora deposit ${txHash} minted no LP (before=${before})`);
    }
    return { txHash, unitsMinted };
  },

  // Burns `units` LP for USDC. The SDK routes through the vault buffer or unwinds
  // a strategy, and THROWS when neither has enough liquidity -- map that to the
  // deferred path rather than letting it propagate.
  async withdraw(
    market: string,
    units: bigint,
    slippageBps: number,
  ): Promise<EarnWithdrawOutcome> {
    void market;
    void slippageBps;
    const conn = getServerConnection();
    const treasury = getEarnTreasuryKeypair();
    const vault = await createVault(conn);
    const estimateUsdc = await valueLpUnits(vault, units);
    const usdcAta = treasuryUsdcAta();
    const before = await readTokenAmount(conn, usdcAta);

    let txHash = '';
    try {
      const tx = await vault.withdraw(treasury.publicKey, new BN(units.toString()));
      txHash = await sendAndConfirmServerTx(conn, tx.instructions, treasury);
    } catch (err) {
      console.warn('Meteora withdraw failed, deferring:', err instanceof Error ? err.message : err);
      return { status: 'illiquid', estimateUsdc };
    }

    const received = (await readTokenAmount(conn, usdcAta)) - before;
    if (received <= ZERO) {
      throw new Error('Meteora withdraw cleared no USDC -- aborting before payout');
    }
    return { status: 'settled', txHash, received };
  },
};
