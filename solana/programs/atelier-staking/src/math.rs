//! Fixed-point helpers for the reward accumulator.
//!
//! The MasterChef/Synthetix accounting computes `weight * acc_reward_per_weight
//! / ACC_SCALE`. Both factors are u128, and `acc_reward_per_weight` grows
//! unboundedly as it accumulates `reward_rate * elapsed / total_weight` -- so the
//! `weight * acc` product can exceed u128 even though the final quotient (a
//! position's reward debt) comfortably fits. Doing that product in plain u128
//! would revert via `checked_mul`, permanently capping future stake sizes once
//! the accumulator is large (an audit P1). `mul_div_floor` carries the product in
//! 256 bits so it never overflows, and returns `None` only if the *final*
//! quotient genuinely exceeds u128.

/// floor(a * b / denom) computed with a 256-bit intermediate so `a * b` never
/// overflows. Returns `None` if `denom == 0` or the quotient exceeds u128.
pub fn mul_div_floor(a: u128, b: u128, denom: u128) -> Option<u128> {
    if denom == 0 {
        return None;
    }
    let (hi, lo) = mul_wide(a, b);
    div_wide(hi, lo, denom)
}

/// Full 128x128 -> 256-bit product, returned as (high 128 bits, low 128 bits).
fn mul_wide(a: u128, b: u128) -> (u128, u128) {
    const LOW: u128 = u64::MAX as u128;
    let (a_lo, a_hi) = (a & LOW, a >> 64);
    let (b_lo, b_hi) = (b & LOW, b >> 64);

    let ll = a_lo * b_lo;
    let lh = a_lo * b_hi;
    let hl = a_hi * b_lo;
    let hh = a_hi * b_hi;

    // result = hh << 128 + (lh + hl) << 64 + ll, accumulated with carries.
    let mut lo = ll;
    let mut hi = hh;

    let (s1, c1) = lo.overflowing_add(lh << 64);
    lo = s1;
    hi += (lh >> 64) + c1 as u128;

    let (s2, c2) = lo.overflowing_add(hl << 64);
    lo = s2;
    hi += (hl >> 64) + c2 as u128;

    (hi, lo)
}

/// Divide the 256-bit value (`hi` << 128 + `lo`) by `d`, flooring. Returns `None`
/// if the quotient would not fit in u128 (i.e. `hi >= d`). Plain restoring binary
/// long division -- 128 shift/compare steps, no wide intermediate.
fn div_wide(hi: u128, lo: u128, d: u128) -> Option<u128> {
    if hi >= d {
        return None;
    }
    let mut rem = hi;
    let mut quo: u128 = 0;
    let mut i = 128;
    while i > 0 {
        i -= 1;
        let bit = (lo >> i) & 1;
        // full = rem * 2 + bit, which may be up to ~2^129; track the bit shifted
        // out of u128 in `carry` so the comparison against d stays exact.
        let carry = rem >> 127;
        let shifted = (rem << 1) | bit;
        if carry == 1 || shifted >= d {
            // full >= d: set the quotient bit and subtract. When carry == 1 the
            // true value is 2^128 + shifted, so the new remainder is
            // shifted - d (mod 2^128), which wrapping_sub yields exactly.
            rem = shifted.wrapping_sub(d);
            quo |= 1u128 << i;
        } else {
            rem = shifted;
        }
    }
    Some(quo)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ACC_SCALE: u128 = 1_000_000_000_000_000_000;

    #[test]
    fn small_values_match_naive() {
        let cases = [
            (0u128, 0u128, 1u128),
            (1, 1, 1),
            (7, 11, 3),
            (1_000_000, 500_000, 1_000_000),
            (123_456_789, 987_654_321, 1_000),
            (u64::MAX as u128, u64::MAX as u128, 7),
        ];
        for (a, b, d) in cases {
            let expected = (a * b) / d; // fits in u128 for these inputs
            assert_eq!(mul_div_floor(a, b, d), Some(expected), "{a}*{b}/{d}");
        }
    }

    #[test]
    fn product_overflows_u128_but_quotient_fits() {
        // weight * acc overflows u128, quotient = weight * acc / ACC_SCALE fits.
        // acc poisoned huge by a dust staker; a full-supply 8x stake must NOT fail.
        let weight: u128 = 8_000_000_000_000_000; // 8e15 (whole 1B-supply at 8x)
        let acc: u128 = 5_300_000_000_000_000_000_000_000; // ~5.3e24
        // a*b = 4.24e40 > u128::MAX (~3.4e38) -> naive u128 mul would overflow.
        assert!(weight.checked_mul(acc).is_none());
        // 256-bit path: floor(8e15 * 5.3e24 / 1e18) = floor(4.24e40 / 1e18) = 4.24e22
        let expected = 42_400_000_000_000_000_000_000u128;
        assert_eq!(mul_div_floor(weight, acc, ACC_SCALE), Some(expected));
    }

    #[test]
    fn extreme_product_still_divides() {
        // Near-max factors: (2^128-1)^2 / (2^64) has a known closed form.
        let a = u128::MAX;
        let b = u128::MAX;
        let d = 1u128 << 64;
        // (2^128-1)^2 = 2^256 - 2^129 + 1; floor(/2^64) = 2^192 - 2^65, fits u128? No:
        // 2^192 exceeds u128, so the quotient does NOT fit -> None.
        assert_eq!(mul_div_floor(a, b, d), None);
    }

    #[test]
    fn quotient_exactly_fits_upper_edge() {
        // a*b/d where quotient == u128::MAX exactly: a=u128::MAX, b=d.
        let a = u128::MAX;
        let d = 7u128;
        assert_eq!(mul_div_floor(a, d, d), Some(a));
    }

    #[test]
    fn flooring_is_downward() {
        assert_eq!(mul_div_floor(10, 1, 3), Some(3)); // 10/3 = 3.33 -> 3
        assert_eq!(mul_div_floor(1, 1, 2), Some(0)); // 0.5 -> 0
    }

    #[test]
    fn zero_denominator_is_none() {
        assert_eq!(mul_div_floor(5, 5, 0), None);
    }

    #[test]
    fn reward_increment_shape() {
        // update_rewards: floor(reward_rate * elapsed / total_weight).
        // reward_rate = amount(5e11 micro) * ACC_SCALE / duration(604800).
        let amount: u128 = 500_000_000_000;
        let duration: u128 = 604_800;
        let rate = amount * ACC_SCALE / duration;
        let total_weight: u128 = 9_000_000;
        let elapsed: u128 = duration; // full window
        // full-window accrual per weight ~= amount * ACC_SCALE / total_weight
        let got = mul_div_floor(rate, elapsed, total_weight).unwrap();
        let approx = amount * ACC_SCALE / total_weight;
        // within rounding of the rate truncation
        let diff = approx.abs_diff(got);
        assert!(diff <= total_weight, "increment off by {diff}");
    }
}
