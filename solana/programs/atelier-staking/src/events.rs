use anchor_lang::prelude::*;

#[event]
pub struct PoolInitialized {
    pub pool: Pubkey,
    pub admin: Pubkey,
    pub staked_mint: Pubkey,
    pub reward_mint: Pubkey,
}

#[event]
pub struct Staked {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub tier_index: u8,
    pub amount: u64,
    pub position_amount: u64,
    pub position_weight: u128,
    pub lock_until: i64,
}

#[event]
pub struct Unstaked {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub tier_index: u8,
    pub amount: u64,
    pub position_amount: u64,
}

#[event]
pub struct Claimed {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RewardsSynced {
    pub pool: Pubkey,
    pub new_rewards: u64,
    pub acc_reward_per_weight: u128,
    pub total_weight: u128,
}

#[event]
pub struct PausedSet {
    pub pool: Pubkey,
    pub paused: bool,
}
