use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    state::Mint as MintState,
};

use crate::errors::StakingError;

pub mod claim;
pub mod crank;
pub mod initialize_pool;
pub mod set_paused;
pub mod stake;
pub mod unstake;

// Glob re-exports are required: `#[derive(Accounts)]` generates helper modules
// (`__client_accounts_*`, `__cpi_client_accounts_*`) that the `#[program]` macro
// references at crate root. The only cost is a benign "ambiguous glob" warning
// on the per-module `handler` fns, which are always called fully-qualified.
pub use claim::*;
pub use crank::*;
pub use initialize_pool::*;
pub use set_paused::*;
pub use stake::*;
pub use unstake::*;

/// Reject staked mints whose Token-2022 extensions would break the program's
/// accounting or custody assumptions:
/// - TransferFee: amount received != amount sent -> vault would go insolvent.
/// - TransferHook: arbitrary CPI on every transfer -> reentrancy surface.
/// - PermanentDelegate: a third party could move staked tokens out of the vault.
/// - ConfidentialTransfer: balances are not plaintext-readable.
/// - DefaultAccountState / NonTransferable / MintCloseAuthority: can freeze or
///   brick the vault.
///
/// Legacy SPL Token mints have no extensions and pass trivially.
pub fn assert_safe_staked_mint(mint_ai: &AccountInfo) -> Result<()> {
    if mint_ai.owner == &anchor_spl::token::ID {
        return Ok(());
    }
    let data = mint_ai.try_borrow_data()?;
    let state = StateWithExtensions::<MintState>::unpack(&data)
        .map_err(|_| error!(StakingError::UnsafeMintExtension))?;
    let extensions = state
        .get_extension_types()
        .map_err(|_| error!(StakingError::UnsafeMintExtension))?;
    for ext in extensions {
        match ext {
            ExtensionType::TransferFeeConfig
            | ExtensionType::TransferHook
            | ExtensionType::PermanentDelegate
            | ExtensionType::ConfidentialTransferMint
            | ExtensionType::DefaultAccountState
            | ExtensionType::NonTransferable
            | ExtensionType::MintCloseAuthority => {
                return err!(StakingError::UnsafeMintExtension);
            }
            _ => {}
        }
    }
    Ok(())
}
