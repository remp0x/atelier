import { randomBytes } from 'crypto';
import { atelierClient } from './atelier-db';

// Custodial pooled-treasury accounting for Parquet Earn.
//
// Model: ERC4626-style shares. The segregated treasury holds the aggregate LP
// position; each depositor owns `shares` of that aggregate, never a fixed USDC
// amount. Yield (harvested LP added with no new shares) and drawdown (LP value
// falling) both accrue pro-rata across shares automatically -- the only fair and
// solvent way to run a pool. A fixed-USDC-per-agent ledger breaks the first time
// the pool loses, so it is deliberately not used here.
//
// Every mutation bumps the vault `version` under an optimistic guard, which
// serializes all money operations on a vault and prevents interleaved
// deposits/withdrawals from corrupting the share supply.
//
// This module is pure bookkeeping: it records the result of on-chain actions
// (lp minted/redeemed, usdc moved, tx hashes) that the flow layer performs. It
// never touches the network or moves funds itself.

export type EarnOwnerKind = 'agent' | 'user';
export type EarnMovementKind =
  | 'deposit'
  | 'withdraw'
  | 'withdraw_settled'
  | 'harvest'
  | 'fee';
export type EarnMovementStatus = 'pending' | 'confirmed' | 'queued' | 'failed';

export interface EarnVault {
  id: string;
  poolMarket: string;
  treasuryWallet: string;
  totalShares: bigint;
  totalLpTokens: bigint;
  totalPrincipalUsdc: bigint;
  status: string;
  version: number;
}

export interface EarnPosition {
  id: string;
  vaultId: string;
  ownerKind: EarnOwnerKind;
  ownerId: string;
  shares: bigint;
  principalUsdc: bigint;
  status: string;
}

export interface EarnMovement {
  id: string;
  vaultId: string;
  positionId: string | null;
  ownerKind: EarnOwnerKind | null;
  ownerId: string | null;
  kind: EarnMovementKind;
  amountUsdc: bigint | null;
  lpDelta: bigint | null;
  sharesDelta: bigint | null;
  status: EarnMovementStatus;
  txHash: string | null;
  queueEntry: string | null;
  note: string | null;
  createdAt: string;
}

const MAX_WRITE_ATTEMPTS = 6;
const ZERO = BigInt(0);

let initialized = false;

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export async function initParquetEarnDb(): Promise<void> {
  if (initialized) return;

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS parquet_earn_vault (
      id TEXT PRIMARY KEY,
      pool_market TEXT NOT NULL UNIQUE,
      treasury_wallet TEXT NOT NULL,
      total_shares TEXT NOT NULL DEFAULT '0',
      total_lp_tokens TEXT NOT NULL DEFAULT '0',
      total_principal_usdc INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS parquet_earn_positions (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      owner_kind TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      shares TEXT NOT NULL DEFAULT '0',
      principal_usdc INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vault_id, owner_kind, owner_id)
    )
  `);

  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS parquet_earn_movements (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      position_id TEXT,
      owner_kind TEXT,
      owner_id TEXT,
      kind TEXT NOT NULL,
      amount_usdc INTEGER,
      lp_delta TEXT,
      shares_delta TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      tx_hash TEXT,
      queue_entry TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Idempotency ledger for push-model deposits: an incoming USDC transfer
  // signature may back at most one deposit. The PRIMARY KEY makes the claim
  // atomic, so a replayed incoming_tx_hash can never deploy treasury funds twice.
  await atelierClient.execute(`
    CREATE TABLE IF NOT EXISTS parquet_earn_consumed_deposits (
      incoming_tx_hash TEXT PRIMARY KEY,
      owner_kind TEXT,
      owner_id TEXT,
      amount_usdc INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await atelierClient.execute(
    'CREATE INDEX IF NOT EXISTS idx_earn_pos_owner ON parquet_earn_positions(owner_kind, owner_id)',
  );
  await atelierClient.execute(
    'CREATE INDEX IF NOT EXISTS idx_earn_pos_vault ON parquet_earn_positions(vault_id)',
  );
  await atelierClient.execute(
    'CREATE INDEX IF NOT EXISTS idx_earn_mov_vault ON parquet_earn_movements(vault_id, created_at)',
  );
  await atelierClient.execute(
    'CREATE INDEX IF NOT EXISTS idx_earn_mov_owner ON parquet_earn_movements(owner_kind, owner_id, created_at)',
  );

  initialized = true;
}

function asBigInt(value: unknown): bigint {
  if (value === null || value === undefined) return ZERO;
  return BigInt(value as string | number | bigint);
}

function mapVault(row: Record<string, unknown>): EarnVault {
  return {
    id: row.id as string,
    poolMarket: row.pool_market as string,
    treasuryWallet: row.treasury_wallet as string,
    totalShares: asBigInt(row.total_shares),
    totalLpTokens: asBigInt(row.total_lp_tokens),
    totalPrincipalUsdc: asBigInt(row.total_principal_usdc),
    status: row.status as string,
    version: Number(row.version),
  };
}

function mapPosition(row: Record<string, unknown>): EarnPosition {
  return {
    id: row.id as string,
    vaultId: row.vault_id as string,
    ownerKind: row.owner_kind as EarnOwnerKind,
    ownerId: row.owner_id as string,
    shares: asBigInt(row.shares),
    principalUsdc: asBigInt(row.principal_usdc),
    status: row.status as string,
  };
}

export async function getOrCreateVault(
  poolMarket: string,
  treasuryWallet: string,
): Promise<EarnVault> {
  await initParquetEarnDb();
  const existing = await atelierClient.execute({
    sql: 'SELECT * FROM parquet_earn_vault WHERE pool_market = ?',
    args: [poolMarket],
  });
  if (existing.rows[0]) {
    return mapVault(existing.rows[0] as unknown as Record<string, unknown>);
  }

  const id = genId('pqvault');
  await atelierClient.execute({
    sql: 'INSERT INTO parquet_earn_vault (id, pool_market, treasury_wallet) VALUES (?, ?, ?) ON CONFLICT(pool_market) DO NOTHING',
    args: [id, poolMarket, treasuryWallet],
  });

  const created = await atelierClient.execute({
    sql: 'SELECT * FROM parquet_earn_vault WHERE pool_market = ?',
    args: [poolMarket],
  });
  return mapVault(created.rows[0] as unknown as Record<string, unknown>);
}

export async function getVaultById(vaultId: string): Promise<EarnVault | null> {
  await initParquetEarnDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM parquet_earn_vault WHERE id = ?',
    args: [vaultId],
  });
  return result.rows[0]
    ? mapVault(result.rows[0] as unknown as Record<string, unknown>)
    : null;
}

export async function getPosition(
  vaultId: string,
  ownerKind: EarnOwnerKind,
  ownerId: string,
): Promise<EarnPosition | null> {
  await initParquetEarnDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM parquet_earn_positions WHERE vault_id = ? AND owner_kind = ? AND owner_id = ?',
    args: [vaultId, ownerKind, ownerId],
  });
  return result.rows[0]
    ? mapPosition(result.rows[0] as unknown as Record<string, unknown>)
    : null;
}

export async function listPositionsByOwner(
  ownerKind: EarnOwnerKind,
  ownerId: string,
): Promise<EarnPosition[]> {
  await initParquetEarnDb();
  const result = await atelierClient.execute({
    sql: 'SELECT * FROM parquet_earn_positions WHERE owner_kind = ? AND owner_id = ? AND status = ?',
    args: [ownerKind, ownerId, 'active'],
  });
  return result.rows.map((r) => mapPosition(r as unknown as Record<string, unknown>));
}

// Shares to mint for an LP deposit. First deposit bootstraps 1:1 with LP so the
// share unit is well-defined; afterwards new shares are proportional to the LP
// added relative to the LP already held, which keeps share price continuous
// across yield and drawdown.
export function computeSharesForDeposit(vault: EarnVault, lpMinted: bigint): bigint {
  if (lpMinted <= ZERO) throw new Error('lpMinted must be positive');
  if (vault.totalLpTokens === ZERO || vault.totalShares === ZERO) return lpMinted;
  return (lpMinted * vault.totalShares) / vault.totalLpTokens;
}

// LP tokens owed when burning `shares`, proportional to the share's slice of the
// vault's total LP holdings.
export function computeLpForShares(vault: EarnVault, shares: bigint): bigint {
  if (shares <= ZERO) throw new Error('shares must be positive');
  if (vault.totalShares === ZERO) return ZERO;
  return (shares * vault.totalLpTokens) / vault.totalShares;
}

// Current USDC value of a position, given the live USDC value of the vault's
// total LP holdings (read from Parquet by the caller -- this layer stays pure).
export function positionValueUsdc(
  vault: EarnVault,
  position: EarnPosition,
  totalLpValueUsdc: bigint,
): bigint {
  if (vault.totalShares === ZERO) return ZERO;
  return (position.shares * totalLpValueUsdc) / vault.totalShares;
}

class VaultConflictError extends Error {
  constructor() {
    super('vault version conflict');
    this.name = 'VaultConflictError';
  }
}

async function withVaultLock<T>(
  vaultId: string,
  mutate: (vault: EarnVault) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const vault = await getVaultById(vaultId);
    if (!vault) throw new Error(`vault ${vaultId} not found`);
    try {
      return await mutate(vault);
    } catch (err) {
      if (err instanceof VaultConflictError) continue;
      throw err;
    }
  }
  throw new Error(`vault ${vaultId} write contended after ${MAX_WRITE_ATTEMPTS} attempts`);
}

// Atomically claims an incoming deposit transfer signature. Returns true if this
// is the first time the signature is seen (caller may proceed to deploy), false
// if it was already consumed (replay -- caller must abort). The claim survives a
// later deploy failure/refund: a consumed transfer is never reusable.
export async function claimIncomingDepositTx(params: {
  incomingTxHash: string;
  ownerKind: EarnOwnerKind;
  ownerId: string;
  amountUsdc: bigint;
}): Promise<boolean> {
  await initParquetEarnDb();
  const result = await atelierClient.execute({
    sql: `INSERT INTO parquet_earn_consumed_deposits (incoming_tx_hash, owner_kind, owner_id, amount_usdc)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(incoming_tx_hash) DO NOTHING`,
    args: [params.incomingTxHash, params.ownerKind, params.ownerId, params.amountUsdc.toString()],
  });
  return Number(result.rowsAffected) > 0;
}

// Records a confirmed deposit: mints shares for the depositor and grows the
// vault's LP holdings. `amountUsdc` and `lpMinted` come from the on-chain action
// the flow layer already performed.
export async function recordDeposit(params: {
  vaultId: string;
  ownerKind: EarnOwnerKind;
  ownerId: string;
  amountUsdc: bigint;
  lpMinted: bigint;
  txHash?: string;
}): Promise<{ position: EarnPosition; sharesMinted: bigint }> {
  await initParquetEarnDb();
  const { vaultId, ownerKind, ownerId, amountUsdc, lpMinted, txHash } = params;

  return withVaultLock(vaultId, async (vault) => {
    const sharesMinted = computeSharesForDeposit(vault, lpMinted);
    const existing = await getPosition(vaultId, ownerKind, ownerId);
    const positionId = existing?.id ?? genId('pqpos');
    const newShares = (existing?.shares ?? ZERO) + sharesMinted;
    const newPrincipal = (existing?.principalUsdc ?? ZERO) + amountUsdc;

    const results = await atelierClient.batch(
      [
        {
          sql: `UPDATE parquet_earn_vault
                SET total_shares = ?, total_lp_tokens = ?,
                    total_principal_usdc = total_principal_usdc + ?,
                    version = version + 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND version = ?`,
          args: [
            (vault.totalShares + sharesMinted).toString(),
            (vault.totalLpTokens + lpMinted).toString(),
            amountUsdc.toString(),
            vaultId,
            vault.version,
          ],
        },
        {
          sql: `INSERT INTO parquet_earn_positions (id, vault_id, owner_kind, owner_id, shares, principal_usdc)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(vault_id, owner_kind, owner_id)
                DO UPDATE SET shares = ?, principal_usdc = ?, updated_at = CURRENT_TIMESTAMP`,
          args: [
            positionId, vaultId, ownerKind, ownerId, newShares.toString(), amountUsdc.toString(),
            newShares.toString(), newPrincipal.toString(),
          ],
        },
        {
          sql: `INSERT INTO parquet_earn_movements
                (id, vault_id, position_id, owner_kind, owner_id, kind, amount_usdc, lp_delta, shares_delta, status, tx_hash)
                VALUES (?, ?, ?, ?, ?, 'deposit', ?, ?, ?, 'confirmed', ?)`,
          args: [
            genId('pqmov'), vaultId, positionId, ownerKind, ownerId,
            amountUsdc.toString(), lpMinted.toString(), sharesMinted.toString(), txHash ?? null,
          ],
        },
      ],
      'write',
    );

    if (Number(results[0].rowsAffected) === 0) throw new VaultConflictError();

    const position = await getPosition(vaultId, ownerKind, ownerId);
    if (!position) throw new Error('position vanished after deposit');
    return { position, sharesMinted };
  });
}

// Records a withdrawal: burns shares and shrinks the vault's LP holdings.
// `lpRedeemed` is the LP removed from the pool for these shares. If Parquet
// settled the payout immediately, pass `amountUsdc` + `txHash` and status
// 'confirmed'; if it returned a FIFO queue claim instead, pass `queueEntry` and
// status 'queued' -- the cron settles it later via recordWithdrawalSettled.
export async function recordWithdrawal(params: {
  vaultId: string;
  ownerKind: EarnOwnerKind;
  ownerId: string;
  shares: bigint;
  lpRedeemed: bigint;
  amountUsdc?: bigint;
  txHash?: string;
  queueEntry?: string;
  note?: string;
}): Promise<{ position: EarnPosition; movementId: string }> {
  await initParquetEarnDb();
  const { vaultId, ownerKind, ownerId, shares, lpRedeemed, amountUsdc, txHash, queueEntry, note } = params;

  return withVaultLock(vaultId, async (vault) => {
    const existing = await getPosition(vaultId, ownerKind, ownerId);
    if (!existing) throw new Error('no position to withdraw from');
    if (shares <= ZERO || shares > existing.shares) {
      throw new Error('withdrawal shares exceed position balance');
    }
    if (lpRedeemed > vault.totalLpTokens) {
      throw new Error('lpRedeemed exceeds vault holdings');
    }

    const remainingShares = existing.shares - shares;
    // Reduce principal pro-rata to the shares burned so PnL stays meaningful.
    const principalBurned = existing.shares === ZERO
      ? ZERO
      : (existing.principalUsdc * shares) / existing.shares;
    const remainingPrincipal = existing.principalUsdc - principalBurned;
    const movementId = genId('pqmov');
    const status: EarnMovementStatus = queueEntry ? 'queued' : 'confirmed';

    const results = await atelierClient.batch(
      [
        {
          sql: `UPDATE parquet_earn_vault
                SET total_shares = ?, total_lp_tokens = ?,
                    total_principal_usdc = total_principal_usdc - ?,
                    version = version + 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND version = ?`,
          args: [
            (vault.totalShares - shares).toString(),
            (vault.totalLpTokens - lpRedeemed).toString(),
            principalBurned.toString(),
            vaultId,
            vault.version,
          ],
        },
        {
          sql: `UPDATE parquet_earn_positions
                SET shares = ?, principal_usdc = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
          args: [remainingShares.toString(), remainingPrincipal.toString(), existing.id],
        },
        {
          sql: `INSERT INTO parquet_earn_movements
                (id, vault_id, position_id, owner_kind, owner_id, kind, amount_usdc, lp_delta, shares_delta, status, tx_hash, queue_entry, note)
                VALUES (?, ?, ?, ?, ?, 'withdraw', ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            movementId, vaultId, existing.id, ownerKind, ownerId,
            amountUsdc !== undefined ? amountUsdc.toString() : null,
            (-lpRedeemed).toString(), (-shares).toString(), status, txHash ?? null, queueEntry ?? null, note ?? null,
          ],
        },
      ],
      'write',
    );

    if (Number(results[0].rowsAffected) === 0) throw new VaultConflictError();

    const position = await getPosition(vaultId, ownerKind, ownerId);
    if (!position) throw new Error('position vanished after withdrawal');
    return { position, movementId };
  });
}

// Marks a previously-queued withdrawal as settled once the FIFO payout lands.
export async function recordWithdrawalSettled(
  movementId: string,
  amountUsdc: bigint,
  txHash: string,
): Promise<void> {
  await initParquetEarnDb();
  await atelierClient.execute({
    sql: `UPDATE parquet_earn_movements
          SET status = 'withdraw_settled', amount_usdc = ?, tx_hash = ?
          WHERE id = ? AND status = 'queued'`,
    args: [amountUsdc.toString(), txHash, movementId],
  });
}

// Records harvested fees: LP added to the vault with NO new shares, so the gain
// accrues pro-rata to every existing share (this is how yield reaches holders).
export async function recordHarvest(
  vaultId: string,
  lpAdded: bigint,
  txHash?: string,
): Promise<void> {
  await initParquetEarnDb();
  if (lpAdded <= ZERO) return;

  await withVaultLock(vaultId, async (vault) => {
    const results = await atelierClient.batch(
      [
        {
          sql: `UPDATE parquet_earn_vault
                SET total_lp_tokens = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND version = ?`,
          args: [(vault.totalLpTokens + lpAdded).toString(), vaultId, vault.version],
        },
        {
          sql: `INSERT INTO parquet_earn_movements
                (id, vault_id, kind, lp_delta, status, tx_hash)
                VALUES (?, ?, 'harvest', ?, 'confirmed', ?)`,
          args: [genId('pqmov'), vaultId, lpAdded.toString(), txHash ?? null],
        },
      ],
      'write',
    );
    if (Number(results[0].rowsAffected) === 0) throw new VaultConflictError();
  });
}

export async function listQueuedWithdrawals(vaultId: string): Promise<EarnMovement[]> {
  await initParquetEarnDb();
  const result = await atelierClient.execute({
    sql: `SELECT * FROM parquet_earn_movements WHERE vault_id = ? AND status = 'queued' ORDER BY created_at ASC`,
    args: [vaultId],
  });
  return result.rows.map((r) => mapMovement(r as unknown as Record<string, unknown>));
}

function mapMovement(row: Record<string, unknown>): EarnMovement {
  return {
    id: row.id as string,
    vaultId: row.vault_id as string,
    positionId: (row.position_id as string) ?? null,
    ownerKind: (row.owner_kind as EarnOwnerKind) ?? null,
    ownerId: (row.owner_id as string) ?? null,
    kind: row.kind as EarnMovementKind,
    amountUsdc: row.amount_usdc !== null && row.amount_usdc !== undefined ? asBigInt(row.amount_usdc) : null,
    lpDelta: row.lp_delta !== null && row.lp_delta !== undefined ? asBigInt(row.lp_delta) : null,
    sharesDelta: row.shares_delta !== null && row.shares_delta !== undefined ? asBigInt(row.shares_delta) : null,
    status: row.status as EarnMovementStatus,
    txHash: (row.tx_hash as string) ?? null,
    queueEntry: (row.queue_entry as string) ?? null,
    note: (row.note as string) ?? null,
    createdAt: row.created_at as string,
  };
}
