use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use constants::TIER_COUNT;
use instructions::*;
use state::Tier;

// Live program id. The keypair (target/deploy/atelier_staking-keypair.json,
// gitignored) is Atelier-controlled and matches the deployed mainnet program;
// post-deploy the program is governed by its separate upgrade authority.
declare_id!("5VrSQib1ahpywtzB1eCs44fbR4QeQHUh1PdfCtdNDYdq");

/// Atelier $ATELIER staking.
///
/// Custodial-free, on-chain revenue-share staking. Stakers lock $ATELIER
/// (Token-2022) into one of four lock tiers that scale their reward weight.
/// The reward mint (wrapped SOL in production) funded by Atelier's backend (or
/// anyone) accrues pro-rata to weighted stake via a MasterChef/Synthetix
/// `acc_reward_per_weight` accumulator.
///
/// Trust model: the program holds staked tokens and reward tokens in PDA-owned
/// vaults.
/// There is intentionally NO admin instruction that can move vault funds; the
/// only outflows are user `unstake` (their own principal) and user `claim`
/// (their own accrued rewards). `set_paused` can only block NEW stakes -- it can
/// never block unstake or claim. See SECURITY.md.
#[program]
pub mod atelier_staking {
    use super::*;

    /// One-time pool creation for a given (staked mint, pool_id). Sets the
    /// four lock tiers, the reward-drip window, and the `funder` allowed to
    /// crank (all immutable thereafter) and rejects unsafe Token-2022
    /// extensions. A `funder` of `Pubkey::default()` defaults to `admin`.
    /// `pool_id` disambiguates successive pools for the same mint (retired
    /// pools keep their address; a new id derives a fresh one).
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        pool_id: u8,
        tiers: [Tier; TIER_COUNT],
        reward_duration_secs: i64,
        funder: Pubkey,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, pool_id, tiers, reward_duration_secs, funder)
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

    /// Fold any USDC sitting in the reward vault into the accumulator and start
    /// its linear drip. Restricted to the pool `funder`: notify resets the drip
    /// window, so leaving it open let anyone re-notify with dust and stretch
    /// unvested rewards (griefing). The backend funder cranks after each deposit.
    pub fn crank_sync(ctx: Context<CrankSync>) -> Result<()> {
        instructions::crank::handler(ctx)
    }

    /// Admin-only: pause/unpause NEW stakes. Cannot affect unstake or claim.
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::set_paused::handler(ctx, paused)
    }
}
