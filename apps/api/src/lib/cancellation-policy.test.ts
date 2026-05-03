import { describe, expect, it } from 'vitest'
import { quoteCancellation } from './cancellation-policy.js'

const TOTAL = 100_000 // ₱1,000

const futureBy = (minutes: number) => new Date(Date.now() + minutes * 60_000)

describe('quoteCancellation', () => {
  it('returns free cancel for PENDING_PAYMENT (no payment captured yet)', () => {
    const q = quoteCancellation({
      status: 'PENDING_PAYMENT',
      scheduledAt: futureBy(60 * 24),
      totalCentavos: TOTAL,
    })
    expect(q).toEqual({
      cancellable: true,
      feeCentavos: 0,
      reason: expect.stringContaining('Free'),
    })
  })

  it('returns free cancel for CONFIRMED with no provider yet', () => {
    const q = quoteCancellation({
      status: 'CONFIRMED',
      scheduledAt: futureBy(60 * 24),
      totalCentavos: TOTAL,
    })
    expect(q.cancellable).toBe(true)
    expect(q.feeCentavos).toBe(0)
  })

  it('charges flat ₱100 once provider is assigned', () => {
    const q = quoteCancellation({
      status: 'PROVIDER_ASSIGNED',
      scheduledAt: futureBy(60 * 24),
      totalCentavos: TOTAL,
    })
    expect(q.cancellable).toBe(true)
    expect(q.feeCentavos).toBe(10_000)
    expect(q.reason).toMatch(/100/)
  })

  it('charges 50% within 30 minutes of scheduled time', () => {
    const q = quoteCancellation({
      status: 'PROVIDER_ASSIGNED',
      scheduledAt: futureBy(15),
      totalCentavos: TOTAL,
    })
    expect(q.cancellable).toBe(true)
    expect(q.feeCentavos).toBe(50_000)
    expect(q.reason).toMatch(/50%/)
  })

  it('still applies 50% late fee even when status is CONFIRMED', () => {
    // Late fee is the dominant rule in the late window.
    const q = quoteCancellation({
      status: 'CONFIRMED',
      scheduledAt: futureBy(5),
      totalCentavos: TOTAL,
    })
    expect(q.feeCentavos).toBe(50_000)
  })

  it('caps the flat fee at the booking total when total is below ₱100', () => {
    const q = quoteCancellation({
      status: 'PROVIDER_ASSIGNED',
      scheduledAt: futureBy(60 * 24),
      totalCentavos: 5_000,
    })
    expect(q.feeCentavos).toBe(5_000)
  })

  it.each(['EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_USER', 'REFUNDED'] as const)(
    'blocks cancellation in %s state',
    (status) => {
      const q = quoteCancellation({
        status,
        scheduledAt: futureBy(60 * 24),
        totalCentavos: TOTAL,
      })
      expect(q.cancellable).toBe(false)
      expect(q.feeCentavos).toBe(0)
    },
  )

  it('treats the 30-minute boundary as already-late', () => {
    // 29 mins out → late, 30 mins out → still flat fee.
    const late = quoteCancellation({
      status: 'PROVIDER_ASSIGNED',
      scheduledAt: futureBy(29),
      totalCentavos: TOTAL,
    })
    const onBoundary = quoteCancellation({
      status: 'PROVIDER_ASSIGNED',
      scheduledAt: futureBy(31),
      totalCentavos: TOTAL,
    })
    expect(late.feeCentavos).toBe(50_000)
    expect(onBoundary.feeCentavos).toBe(10_000)
  })
})
