use anchor_lang::prelude::*;

#[constant]
pub const POOL_SEED: &[u8] = b"pool";
#[constant]
pub const STAKED_VAULT_SEED: &[u8] = b"staked_vault";
#[constant]
pub const REWARD_VAULT_SEED: &[u8] = b"reward_vault";
#[constant]
pub const POSITION_SEED: &[u8] = b"position";

/// Fixed-point scale for the reward-per-weight accumulator. 1e18 keeps
/// per-distribution precision well below 1 base unit of USDC for any realistic
/// `total_weight` (see SECURITY.md "Precision").
pub const ACC_SCALE: u128 = 1_000_000_000_000_000_000;

/// Basis-point denominator for tier multipliers (10_000 bps = 1.0x).
pub const BPS_DENOM: u64 = 10_000;

/// Number of lock tiers per pool.
pub const TIER_COUNT: usize = 3;

/// A tier must grant at least 1.0x (no penalty multipliers).
pub const MIN_MULTIPLIER_BPS: u64 = BPS_DENOM;

/// Cap multipliers at 100x to bound `weight = amount * mult` against overflow.
pub const MAX_MULTIPLIER_BPS: u64 = 1_000_000;

/// Cap lock duration at 4 years.
pub const MAX_TIER_DURATION_SECS: i64 = 4 * 365 * 24 * 60 * 60;

/// Reward-drip window bounds. Funded USDC is paid out linearly over the pool's
/// `reward_duration` (Synthetix-style) so a position must be staked across real
/// time to earn -- this is what defeats crank front-running / JIT capture. The
/// window should be >> slot time and ideally >= the funding cadence. Capped at 1
/// year. (A very short duration re-opens the JIT vector; see SECURITY.md.)
pub const MAX_REWARD_DURATION_SECS: i64 = 365 * 24 * 60 * 60;
