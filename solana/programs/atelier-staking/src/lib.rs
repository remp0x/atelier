use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::Tier;

// Placeholder id (valid Anchor example key). Run `anchor keys sync` after the
// first build to replace with the real keypair. See DEPLOY_AUDIT_RUNBOOK.md.
declare_id!("5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq");

/// Atelier $ATELIER staking.
///
/// Custodial-free, on-chain revenue-share staking. Stakers lock $ATELIER
/// (Token-2022) into one of three lock tiers that scale their reward weight.
/// USDC funded by Atelier's backend (or anyone) accrues pro-rata to weighted
/// stake via a MasterChef/Synthetix `acc_reward_per_weight` accumulator.
///
/// Trust model: the program holds staked tokens and USDC in PDA-owned vaults.
/// There is intentionally NO admin instruction that can move vault funds; the
/// only outflows are user `unstake` (their own principal) and user `claim`
/// (their own accrued rewards). `set_paused` can only block NEW stakes -- it can
/// never block unstake or claim. See SECURITY.md.
#[program]
pub mod atelier_staking {
    use super::*;

    /// One-time pool creation for a given staked mint. Sets the three lock
    /// tiers and the reward-drip window (both immutable thereafter) and rejects
    /// unsafe Token-2022 extensions.
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        tiers: [Tier; 3],
        reward_duration_secs: i64,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, tiers, reward_duration_secs)
    }

    /// Stake `amount` into `tier_index`. Creates the position on first use,
    /// adds to it (re-locking) thereafter.
    pub fn stake(ctx: Context<Stake>, tier_index: u8, amount: u64) -> Result<()> {
        instructions::stake::handler(ctx, tier_index, amount)
    }

    /// Withdraw `amount` of staked principal once the lock has expired.
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        instructions::unstake::handler(ctx, amount)
    }

    /// Claim all accrued USDC rewards for a position without unstaking.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }

    /// Permissionless: fold any USDC sitting in the reward vault into the
    /// accumulator. Anyone can call this (the backend cranks it after funding).
    pub fn crank_sync(ctx: Context<CrankSync>) -> Result<()> {
        instructions::crank::handler(ctx)
    }

    /// Admin-only: pause/unpause NEW stakes. Cannot affect unstake or claim.
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::set_paused::handler(ctx, paused)
    }
}
