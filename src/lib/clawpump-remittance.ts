/**
 * ClawPump remittance ingest — BLOCKED: pending ClawPump partner confirmation.
 *
 * Under the ClawPump rail the agent's own wallet is creator-of-record, so ClawPump tokens
 * never accrue to the Atelier vault and the legacy indexer/sweep/payout pipeline correctly
 * ignores them (it keeps running for legacy token_mode='pumpfun' rows). Our ~11.67% share
 * (1/3 of ClawPump's 35%) is instead remitted off ClawPump's vault in a periodic SOL batch.
 *
 * TODO(BLOCKED): build the `clawpump_remittances` table + ingest route once ClawPump confirms:
 *   - the remittance asset (SOL vs SPL),
 *   - the source/destination wallet, and
 *   - the cadence (expected: hourly SOL batch).
 * Until then this module is intentionally a no-op placeholder.
 */

export const CLAWPUMP_REMITTANCE_PCT = 11.67;

// Intentionally unimplemented — see TODO(BLOCKED) above.
