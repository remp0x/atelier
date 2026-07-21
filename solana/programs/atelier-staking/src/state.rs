use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::StakingError;
use crate::math::mul_div_floor;

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
    /// Distinguishes multiple pools for the same staked mint (part of the pool
    /// PDA seeds). Lets a new pool (new reward mint / tier set) be created
    /// without colliding with retired ones.
    pub pool_id: u8,
    /// Only this key may `crank_sync` (fund + notify a reward tranche). Set at
    /// init to the backend funding wallet. Gating notify defeats the
    /// dust-donation re-notify griefing that can stretch unvested rewards.
    pub funder: Pubkey,
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
    /// Linear reward drip (Synthetix-style). Funded USDC is paid out over
    /// `reward_duration` seconds rather than dumped into the accumulator at once,
    /// so a position must be staked across real time to earn -- defeating crank
    /// front-running and JIT (stake-around-the-crank) reward capture.
    /// `reward_rate` is (micro-USDC * ACC_SCALE) per second.
    pub reward_rate: u128,
    /// Unix time the current drip ends.
    pub period_finish: i64,
    /// Unix time the accumulator was last advanced.
    pub last_update_time: i64,
    /// Length of each drip window (set at init, immutable).
    pub reward_duration: i64,
    /// Last observed reward-vault balance; deposits are detected as the delta.
    pub reward_vault_last_balance: u64,
    /// Cumulative USDC funded into drips.
    pub total_rewards_distributed: u64,
    pub total_rewards_claimed: u64,
    pub paused: bool,
    pub bump: u8,
    pub staked_vault_bump: u8,
    pub reward_vault_bump: u8,
}

impl StakePool {
    /// Reward time that has actually elapsed under the current drip: `now`
    /// clamped to `period_finish`, so rewards never accrue past the window.
    fn applicable_time(&self, now: i64) -> i64 {
        if now < self.period_finish {
            now
        } else {
            self.period_finish
        }
    }

    /// Advance the accumulator for the time elapsed since the last update,
    /// dripping `reward_rate` across current weight (Synthetix `rewardPerToken`).
    /// MUST be called before any `settle` and before any weight change.
    ///
    /// `last_update_time` advances even when `total_weight == 0`, so rewards that
    /// drip while the pool is empty are skipped (not retroactively granted to the
    /// first staker) -- this closes the "fund an empty pool then be first staker"
    /// capture. Time-based accrual also means a one-slot (JIT) position earns ~0.
    pub fn update_rewards(&mut self, now: i64) -> Result<()> {
        let applicable = self.applicable_time(now);
        if self.total_weight > 0 && applicable > self.last_update_time {
            let elapsed = (applicable - self.last_update_time) as u128;
            // 256-bit intermediate: reward_rate is ACC_SCALE-scaled, so
            // reward_rate * elapsed would otherwise risk overflowing u128.
            let add = mul_div_floor(self.reward_rate, elapsed, self.total_weight)
                .ok_or(StakingError::MathOverflow)?;
            self.acc_reward_per_weight = self
                .acc_reward_per_weight
                .checked_add(add)
                .ok_or(StakingError::MathOverflow)?;
        }
        if applicable > self.last_update_time {
            self.last_update_time = applicable;
        }
        Ok(())
    }

    /// Fold a freshly-deposited `amount` (micro-USDC) into the linear drip,
    /// rolling any not-yet-dripped remainder of the current window into the new
    /// rate (Synthetix `notifyRewardAmount`). MUST be called after
    /// `update_rewards(now)`. A balance below the recorded one can only mean
    /// ledger corruption (claims decrement it in lockstep), handled by the caller.
    pub fn notify_reward(&mut self, amount: u64, now: i64) -> Result<()> {
        let duration = self.reward_duration as u128;
        let amount_scaled = (amount as u128)
            .checked_mul(ACC_SCALE)
            .ok_or(StakingError::MathOverflow)?;
        let new_rate = if now >= self.period_finish {
            amount_scaled
                .checked_div(duration)
                .ok_or(StakingError::MathOverflow)?
        } else {
            let remaining = (self.period_finish - now) as u128;
            let leftover = self
                .reward_rate
                .checked_mul(remaining)
                .ok_or(StakingError::MathOverflow)?;
            amount_scaled
                .checked_add(leftover)
                .ok_or(StakingError::MathOverflow)?
                .checked_div(duration)
                .ok_or(StakingError::MathOverflow)?
        };
        self.reward_rate = new_rate;
        self.last_update_time = now;
        self.period_finish = now
            .checked_add(self.reward_duration)
            .ok_or(StakingError::MathOverflow)?;
        Ok(())
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
        // 256-bit intermediate: `acc_reward_per_weight` grows unboundedly, so
        // `weight * acc` can exceed u128 even though the quotient fits. Computing
        // it in u128 would revert and permanently cap future stake sizes (audit
        // P1). mul_div_floor returns None only if the quotient itself overflows.
        let acc = mul_div_floor(self.weight, acc_reward_per_weight, ACC_SCALE)
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
