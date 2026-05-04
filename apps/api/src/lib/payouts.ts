/**
 * Payout math + cooling-off window. The API is intentionally tiny and
 * deterministic so completion handlers stay short and tests don't need a DB.
 */

/** Hours a Payout sits in PENDING before becoming eligible for disbursement. */
export const PAYOUT_COOLDOWN_HOURS = 24

/** Minimum batch payout amount (centavos). Smaller balances roll forward. */
export const MIN_PAYOUT_CENTAVOS = 50_000 // ₱500

export interface PayoutSplit {
  grossCentavos: number
  feeCentavos: number
  netCentavos: number
}

/**
 * Split a booking total into (gross, platform fee, provider net).
 * `paymentMethod` controls the sign of `netCentavos`:
 *   - ONLINE: provider is owed gross - fee. netCentavos > 0.
 *   - CASH:   provider already collected gross from the customer; we are
 *             owed `fee`. Recorded as a negative payout entry that nets out
 *             of their next online disbursement. netCentavos = -fee.
 */
export function splitPayout(
  totalCentavos: number,
  takeRateBps: number,
  paymentMethod: 'ONLINE' | 'CASH',
): PayoutSplit {
  const gross = Math.max(0, Math.round(totalCentavos))
  const fee = Math.round((gross * takeRateBps) / 10_000)
  if (paymentMethod === 'ONLINE') {
    return { grossCentavos: gross, feeCentavos: fee, netCentavos: gross - fee }
  }
  return { grossCentavos: gross, feeCentavos: fee, netCentavos: -fee }
}

/** Returns the timestamp at which a payout created `now` becomes eligible. */
export function eligibleAtFrom(now: Date): Date {
  return new Date(now.getTime() + PAYOUT_COOLDOWN_HOURS * 60 * 60 * 1000)
}
