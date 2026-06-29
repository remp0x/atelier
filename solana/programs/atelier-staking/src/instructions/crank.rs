use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::constants::*;
use crate::errors::StakingError;
use crate::events::RewardsSynced;
use crate::state::StakePool;

/// Permissionless: anyone can fold freshly-deposited USDC into the accumulator.
#[derive(Accounts)]
pub struct CrankSync<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool.staked_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, StakePool>,

    #[account(address = pool.reward_vault)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
}

pub fn handler(ctx: Context<CrankSync>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let amount = ctx.accounts.reward_vault.amount;
    let pool = &mut ctx.accounts.pool;

    // A balance below the recorded one can only mean ledger corruption (claims
    // decrement it in lockstep with the outflow), so reject it.
    if amount < pool.reward_vault_last_balance {
        return err!(StakingError::RewardVaultBalanceMismatch);
    }
    let delta = amount - pool.reward_vault_last_balance;

    // Drip the active rate up to now, THEN fold any new deposit into a fresh
    // window (Synthetix order: updateReward before notifyRewardAmount).
    pool.update_rewards(now)?;
    if delta > 0 {
        pool.notify_reward(delta, now)?;
        pool.total_rewards_distributed = pool
            .total_rewards_distributed
            .checked_add(delta)
            .ok_or(StakingError::MathOverflow)?;
        pool.reward_vault_last_balance = amount;
    }

    emit!(RewardsSynced {
        pool: pool.key(),
        new_rewards: delta,
        acc_reward_per_weight: pool.acc_reward_per_weight,
        total_weight: pool.total_weight,
    });
    Ok(())
}
