use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::StakingError;

/// One lock tier: how long the stake is locked and the reward-weight
/// multiplier it earns (in basis points; 10_000 = 1.0x).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct Tier {
    pub duration_secs: i64,
    pub multiplier_bps: u64,
}

/// Aggregate pool state for one staked mint. Holds the global accumulator and
/// the running totals; the PDA is also the authority over both vaults.
#[account]
#[derive(InitSpace)]
pub struct StakePool {
    pub admin: Pubkey,
    pub staked_mint: Pubkey,
    pub reward_mint: Pubkey,
    pub staked_vault: Pubkey,
    pub reward_vault: Pubkey,
    pub tiers: [Tier; TIER_COUNT],
    /// Raw staked principal (sum of position.amount). TVL numerator.
    pub total_staked: u64,
    /// Sum of position weights. Distribution denominator.
    pub total_weight: u128,
    /// Cumulative USDC distributed per unit of weight, scaled by ACC_SCALE.
    pub acc_reward_per_weight: u128,
    /// Last observed reward-vault balance; deposits are detected as the delta.
    pub reward_vault_last_balance: u64,
    pub total_rewards_distributed: u64,
    pub total_rewards_claimed: u64,
    pub paused: bool,
    pub bump: u8,
    pub staked_vault_bump: u8,
    pub reward_vault_bump: u8,
}

impl StakePool {
    /// Fold any USDC that arrived in the reward vault since the last observation
    /// into the accumulator, pro-rata across current weight.
    ///
    /// If no one is staked (`total_weight == 0`) the delta is intentionally NOT
    /// consumed -- `reward_vault_last_balance` is left behind so the funds wait
    /// in the vault and distribute to the first stakers. A balance lower than
    /// the recorded one can only mean ledger corruption (claims decrement it in
    /// lockstep), so it is rejected rather than silently floored.
    pub fn sync_rewards(&mut self, reward_vault_amount: u64) -> Result<u64> {
        if reward_vault_amount < self.reward_vault_last_balance {
            return err!(StakingError::RewardVaultBalanceMismatch);
        }
        let delta = reward_vault_amount - self.reward_vault_last_balance;
        if delta == 0 || self.total_weight == 0 {
            return Ok(0);
        }
        let scaled = (delta as u128)
            .checked_mul(ACC_SCALE)
            .ok_or(StakingError::MathOverflow)?
            .checked_div(self.total_weight)
            .ok_or(StakingError::MathOverflow)?;
        self.acc_reward_per_weight = self
            .acc_reward_per_weight
            .checked_add(scaled)
            .ok_or(StakingError::MathOverflow)?;
        self.total_rewards_distributed = self
            .total_rewards_distributed
            .checked_add(delta)
            .ok_or(StakingError::MathOverflow)?;
        self.reward_vault_last_balance = reward_vault_amount;
        Ok(delta)
    }

    pub fn weight_for(&self, amount: u64, tier_index: u8) -> Result<u128> {
        let tier = self
            .tiers
            .get(tier_index as usize)
            .ok_or(StakingError::InvalidTierIndex)?;
        let weight = (amount as u128)
            .checked_mul(tier.multiplier_bps as u128)
            .ok_or(StakingError::MathOverflow)?
            .checked_div(BPS_DENOM as u128)
            .ok_or(StakingError::MathOverflow)?;
        Ok(weight)
    }
}

/// A single staker's position in one tier of a pool. PDA per
/// (pool, owner, tier_index), so a user can hold up to one position per tier.
#[account]
#[derive(InitSpace)]
pub struct StakePosition {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub weight: u128,
    pub tier_index: u8,
    pub lock_until: i64,
    /// MasterChef reward debt: weight * acc / ACC_SCALE captured at last settle.
    pub reward_debt: u128,
    /// Settled-but-unclaimed USDC.
    pub pending_reward: u64,
    pub bump: u8,
}

impl StakePosition {
    fn accumulated(&self, acc_reward_per_weight: u128) -> Result<u128> {
        let acc = self
            .weight
            .checked_mul(acc_reward_per_weight)
            .ok_or(StakingError::MathOverflow)?
            .checked_div(ACC_SCALE)
            .ok_or(StakingError::MathOverflow)?;
        Ok(acc)
    }

    /// Move newly-accrued rewards (since last settle) into `pending_reward` and
    /// re-anchor `reward_debt` to the current accumulator.
    pub fn settle(&mut self, acc_reward_per_weight: u128) -> Result<()> {
        let accumulated = self.accumulated(acc_reward_per_weight)?;
        let pending = accumulated
            .checked_sub(self.reward_debt)
            .ok_or(StakingError::MathOverflow)?;
        let pending_u64: u64 = pending.try_into().map_err(|_| StakingError::MathOverflow)?;
        self.pending_reward = self
            .pending_reward
            .checked_add(pending_u64)
            .ok_or(StakingError::MathOverflow)?;
        self.reward_debt = accumulated;
        Ok(())
    }

    /// Re-anchor reward debt after the weight changed (stake / unstake). MUST be
    /// called after `settle` so no rewards are skipped or double-counted.
    pub fn reset_reward_debt(&mut self, acc_reward_per_weight: u128) -> Result<()> {
        self.reward_debt = self.accumulated(acc_reward_per_weight)?;
        Ok(())
    }
}
