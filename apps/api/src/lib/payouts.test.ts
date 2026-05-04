import { describe, expect, it } from 'vitest'
import { eligibleAtFrom, splitPayout, PAYOUT_COOLDOWN_HOURS } from './payouts.js'

describe('splitPayout', () => {
  it('online: provider gets gross minus the platform fee', () => {
    const r = splitPayout(50_000, 500, 'ONLINE')
    expect(r.grossCentavos).toBe(50_000)
    expect(r.feeCentavos).toBe(2_500) // 5%
    expect(r.netCentavos).toBe(47_500)
  })

  it('cash: provider already has gross; we record the fee as a negative net', () => {
    const r = splitPayout(50_000, 500, 'CASH')
    expect(r.grossCentavos).toBe(50_000)
    expect(r.feeCentavos).toBe(2_500)
    expect(r.netCentavos).toBe(-2_500)
  })

  it('honors per-provider takeRateBps overrides', () => {
    expect(splitPayout(10_000, 1_000, 'ONLINE').netCentavos).toBe(9_000) // 10%
    expect(splitPayout(10_000, 0, 'ONLINE').feeCentavos).toBe(0)
  })

  it('rounds the fee to the nearest centavo (half-up)', () => {
    // gross = 333, takeRate = 5% → fee = 16.65 → 17
    const r = splitPayout(333, 500, 'ONLINE')
    expect(r.feeCentavos).toBe(17)
    expect(r.netCentavos).toBe(316)
  })

  it('clamps negative gross to zero so we never pay out negative net by accident', () => {
    expect(splitPayout(-1000, 500, 'ONLINE').grossCentavos).toBe(0)
    expect(splitPayout(-1000, 500, 'ONLINE').netCentavos).toBe(0)
  })
})

describe('eligibleAtFrom', () => {
  it('adds the cooldown window to the supplied timestamp', () => {
    const now = new Date('2026-05-04T00:00:00Z')
    const eligible = eligibleAtFrom(now)
    expect(eligible.getTime() - now.getTime()).toBe(
      PAYOUT_COOLDOWN_HOURS * 60 * 60 * 1000,
    )
  })
})
