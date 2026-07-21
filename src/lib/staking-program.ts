import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';
import {
  STAKING_PROGRAM_ID,
  STAKED_MINT,
  REWARD_MINT,
  STAKING_TIERS,
  findPoolPda,
  findStakedVaultPda,
  findRewardVaultPda,
  findPositionPda,
} from './staking-config';

/**
 * Hand-encoded client SDK for the atelier-staking program. Instruction layouts
 * and account order mirror `solana/programs/atelier-staking/src` exactly --
 * Anchor 8-byte discriminators are embedded as constants (browser-safe; no
 * runtime hashing). Decoders parse the borsh account layouts directly.
 *
 * Discriminators are deterministic from instruction/account names, so the
 * generated IDL from `anchor build` will match these byte-for-byte.
 */

const IX_STAKE = Buffer.from([206, 176, 202, 18, 200, 209, 179, 108]);
const IX_UNSTAKE = Buffer.from([90, 95, 107, 42, 205, 124, 50, 225]);
const IX_CLAIM = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]);
const IX_CRANK_SYNC = Buffer.from([119, 31, 241, 92, 243, 124, 115, 10]);

const ACCT_STAKE_POOL = Buffer.from([121, 34, 206, 21, 79, 127, 255, 28]);
const ACCT_STAKE_POSITION = Buffer.from([78, 165, 30, 111, 171, 125, 11, 220]);

const STAKED_TOKEN_PROGRAM = TOKEN_2022_PROGRAM_ID;
const REWARD_TOKEN_PROGRAM = TOKEN_PROGRAM_ID;

function u8(value: number): Buffer {
  return Buffer.from([value & 0xff]);
}

function u64(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(value);
  return b;
}

function stakedAta(owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(STAKED_MINT, owner, false, STAKED_TOKEN_PROGRAM);
}

function rewardAta(owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(REWARD_MINT, owner, false, REWARD_TOKEN_PROGRAM);
}

// ----- instruction builders -----

export function buildStakeIx(
  owner: PublicKey,
  tierIndex: number,
  amount: bigint,
): TransactionInstruction {
  const [pool] = findPoolPda();
  const [stakedVault] = findStakedVaultPda(pool);
  const [rewardVault] = findRewardVaultPda(pool);
  const [position] = findPositionPda(pool, owner, tierIndex);

  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: STAKED_MINT, isSigner: false, isWritable: false },
      { pubkey: stakedVault, isSigner: false, isWritable: true },
      { pubkey: stakedAta(owner), isSigner: false, isWritable: true },
      { pubkey: rewardVault, isSigner: false, isWritable: false },
      { pubkey: STAKED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([IX_STAKE, u8(tierIndex), u64(amount)]),
  });
}

export function buildUnstakeIx(
  owner: PublicKey,
  tierIndex: number,
  amount: bigint,
): TransactionInstruction {
  const [pool] = findPoolPda();
  const [stakedVault] = findStakedVaultPda(pool);
  const [rewardVault] = findRewardVaultPda(pool);
  const [position] = findPositionPda(pool, owner, tierIndex);

  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: STAKED_MINT, isSigner: false, isWritable: false },
      { pubkey: stakedVault, isSigner: false, isWritable: true },
      { pubkey: stakedAta(owner), isSigner: false, isWritable: true },
      { pubkey: rewardVault, isSigner: false, isWritable: false },
      { pubkey: STAKED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([IX_UNSTAKE, u64(amount)]),
  });
}

export function buildClaimIx(owner: PublicKey, tierIndex: number): TransactionInstruction {
  const [pool] = findPoolPda();
  const [rewardVault] = findRewardVaultPda(pool);
  const [position] = findPositionPda(pool, owner, tierIndex);

  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: REWARD_MINT, isSigner: false, isWritable: false },
      { pubkey: rewardVault, isSigner: false, isWritable: true },
      { pubkey: rewardAta(owner), isSigner: false, isWritable: true },
      { pubkey: REWARD_TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: IX_CLAIM,
  });
}

/** Idempotent: ensure the owner's wSOL ATA exists before a claim. */
export function ensureRewardAtaIx(owner: PublicKey, payer: PublicKey): TransactionInstruction {
  return createAssociatedTokenAccountIdempotentInstruction(
    payer,
    rewardAta(owner),
    owner,
    REWARD_MINT,
    REWARD_TOKEN_PROGRAM,
  );
}

/**
 * Close the owner's wSOL ATA after a claim, unwrapping the claimed rewards (plus
 * the ATA's rent) to native SOL. Claim txs are [ensureRewardAtaIx, claim, this];
 * the next claim recreates the ATA.
 */
export function unwrapRewardIx(owner: PublicKey): TransactionInstruction {
  return createCloseAccountInstruction(
    rewardAta(owner),
    owner,
    owner,
    [],
    REWARD_TOKEN_PROGRAM,
  );
}

export function buildCrankSyncIx(funder: PublicKey): TransactionInstruction {
  const [pool] = findPoolPda();
  const [rewardVault] = findRewardVaultPda(pool);
  return new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: funder, isSigner: true, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: rewardVault, isSigner: false, isWritable: false },
    ],
    data: IX_CRANK_SYNC,
  });
}

// ----- account decoders -----

class Cursor {
  private offset = 0;
  constructor(private readonly buf: Buffer) {}
  pubkey(): PublicKey {
    const pk = new PublicKey(this.buf.subarray(this.offset, this.offset + 32));
    this.offset += 32;
    return pk;
  }
  u64(): bigint {
    const v = this.buf.readBigUInt64LE(this.offset);
    this.offset += 8;
    return v;
  }
  i64(): bigint {
    const v = this.buf.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }
  u128(): bigint {
    const lo = this.buf.readBigUInt64LE(this.offset);
    const hi = this.buf.readBigUInt64LE(this.offset + 8);
    this.offset += 16;
    return lo + (hi << 64n);
  }
  u8(): number {
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }
  bool(): boolean {
    return this.u8() === 1;
  }
  skip(n: number): void {
    this.offset += n;
  }
}

export interface StakeTierConfig {
  durationSecs: bigint;
  multiplierBps: bigint;
}

export interface StakePoolAccount {
  admin: PublicKey;
  poolId: number;
  funder: PublicKey;
  stakedMint: PublicKey;
  rewardMint: PublicKey;
  stakedVault: PublicKey;
  rewardVault: PublicKey;
  tiers: StakeTierConfig[];
  totalStaked: bigint;
  totalWeight: bigint;
  accRewardPerWeight: bigint;
  rewardRate: bigint;
  periodFinish: bigint;
  lastUpdateTime: bigint;
  rewardDuration: bigint;
  rewardVaultLastBalance: bigint;
  totalRewardsDistributed: bigint;
  totalRewardsClaimed: bigint;
  paused: boolean;
}

export interface StakePositionAccount {
  pool: PublicKey;
  owner: PublicKey;
  amount: bigint;
  weight: bigint;
  tierIndex: number;
  lockUntil: bigint;
  rewardDebt: bigint;
  pendingReward: bigint;
}

function assertDiscriminator(buf: Buffer, expected: Buffer, label: string): void {
  if (!buf.subarray(0, 8).equals(expected)) {
    throw new Error(`Unexpected discriminator for ${label}`);
  }
}

export function decodeStakePool(data: Buffer): StakePoolAccount {
  assertDiscriminator(data, ACCT_STAKE_POOL, 'StakePool');
  const c = new Cursor(data.subarray(8));
  const admin = c.pubkey();
  const poolId = c.u8();
  const funder = c.pubkey();
  const stakedMint = c.pubkey();
  const rewardMint = c.pubkey();
  const stakedVault = c.pubkey();
  const rewardVault = c.pubkey();
  const tiers: StakeTierConfig[] = [];
  for (let i = 0; i < STAKING_TIERS.length; i += 1) {
    tiers.push({ durationSecs: c.i64(), multiplierBps: c.u64() });
  }
  return {
    admin,
    poolId,
    funder,
    stakedMint,
    rewardMint,
    stakedVault,
    rewardVault,
    tiers,
    totalStaked: c.u64(),
    totalWeight: c.u128(),
    accRewardPerWeight: c.u128(),
    rewardRate: c.u128(),
    periodFinish: c.i64(),
    lastUpdateTime: c.i64(),
    rewardDuration: c.i64(),
    rewardVaultLastBalance: c.u64(),
    totalRewardsDistributed: c.u64(),
    totalRewardsClaimed: c.u64(),
    paused: c.bool(),
  };
}

export function decodeStakePosition(data: Buffer): StakePositionAccount {
  assertDiscriminator(data, ACCT_STAKE_POSITION, 'StakePosition');
  const c = new Cursor(data.subarray(8));
  return {
    pool: c.pubkey(),
    owner: c.pubkey(),
    amount: c.u64(),
    weight: c.u128(),
    tierIndex: c.u8(),
    lockUntil: c.i64(),
    rewardDebt: c.u128(),
    pendingReward: c.u64(),
  };
}

// ----- chain reads -----

export async function fetchPool(connection: Connection): Promise<StakePoolAccount | null> {
  const [pool] = findPoolPda();
  const info = await connection.getAccountInfo(pool);
  if (!info) return null;
  return decodeStakePool(info.data);
}

export async function fetchPosition(
  connection: Connection,
  owner: PublicKey,
  tierIndex: number,
): Promise<StakePositionAccount | null> {
  const [pool] = findPoolPda();
  const [position] = findPositionPda(pool, owner, tierIndex);
  const info = await connection.getAccountInfo(position);
  if (!info) return null;
  return decodeStakePosition(info.data);
}

export async function fetchAllPositions(
  connection: Connection,
): Promise<StakePositionAccount[]> {
  const accounts = await connection.getProgramAccounts(STAKING_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(ACCT_STAKE_POSITION) } }],
  });
  return accounts.map((a) => decodeStakePosition(a.account.data as Buffer));
}
