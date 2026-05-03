import { describe, expect, it } from 'vitest'
import { POST_COMPLETION_WINDOW_MS, chatClosesAt, completedAt, isChatOpen } from './chat-window.js'

const NOW = new Date('2026-05-04T12:00:00Z')
const HOUR = 60 * 60 * 1000

describe('isChatOpen', () => {
  it.each([
    'PROVIDER_ASSIGNED',
    'EN_ROUTE',
    'IN_PROGRESS',
    'PENDING_CASH_CONFIRM',
  ] as const)('is open during %s regardless of timestamps', (status) => {
    expect(
      isChatOpen(
        { status, customerCompletedAt: null, providerCashConfirmedAt: null },
        NOW,
      ),
    ).toBe(true)
  })

  it.each([
    'PENDING_PAYMENT',
    'IN_ESCROW',
    'CONFIRMED',
    'CANCELLED_BY_USER',
    'CANCELLED_BY_PROVIDER',
    'REFUNDED',
  ] as const)('is closed during %s', (status) => {
    expect(
      isChatOpen(
        { status, customerCompletedAt: null, providerCashConfirmedAt: null },
        NOW,
      ),
    ).toBe(false)
  })

  it('stays open for online completions inside the 3-hour window', () => {
    const customerCompletedAt = new Date(NOW.getTime() - 2 * HOUR)
    expect(
      isChatOpen(
        { status: 'COMPLETED', customerCompletedAt, providerCashConfirmedAt: null },
        NOW,
      ),
    ).toBe(true)
  })

  it('closes for online completions past the window', () => {
    const customerCompletedAt = new Date(NOW.getTime() - 4 * HOUR)
    expect(
      isChatOpen(
        { status: 'COMPLETED', customerCompletedAt, providerCashConfirmedAt: null },
        NOW,
      ),
    ).toBe(false)
  })

  it('uses the cash-confirmation timestamp for cash bookings', () => {
    // Customer confirmed 5h ago (>window), provider confirmed cash 1h ago (<window)
    const customerCompletedAt = new Date(NOW.getTime() - 5 * HOUR)
    const providerCashConfirmedAt = new Date(NOW.getTime() - 1 * HOUR)
    expect(
      isChatOpen(
        { status: 'COMPLETED', customerCompletedAt, providerCashConfirmedAt },
        NOW,
      ),
    ).toBe(true)
  })

  it('treats the boundary as already-closed', () => {
    const customerCompletedAt = new Date(NOW.getTime() - POST_COMPLETION_WINDOW_MS)
    expect(
      isChatOpen(
        { status: 'COMPLETED', customerCompletedAt, providerCashConfirmedAt: null },
        NOW,
      ),
    ).toBe(false)
  })

  it('returns false for COMPLETED with no timestamps (defensive)', () => {
    expect(
      isChatOpen(
        { status: 'COMPLETED', customerCompletedAt: null, providerCashConfirmedAt: null },
        NOW,
      ),
    ).toBe(false)
  })
})

describe('completedAt', () => {
  it('returns null for non-completed bookings', () => {
    expect(
      completedAt({
        status: 'IN_PROGRESS',
        customerCompletedAt: new Date(),
        providerCashConfirmedAt: new Date(),
      }),
    ).toBeNull()
  })

  it('returns customerCompletedAt for online completions', () => {
    const t = new Date(NOW.getTime() - HOUR)
    expect(
      completedAt({
        status: 'COMPLETED',
        customerCompletedAt: t,
        providerCashConfirmedAt: null,
      }),
    ).toEqual(t)
  })

  it('prefers providerCashConfirmedAt for cash completions', () => {
    const customer = new Date(NOW.getTime() - 2 * HOUR)
    const provider = new Date(NOW.getTime() - 1 * HOUR)
    expect(
      completedAt({
        status: 'COMPLETED',
        customerCompletedAt: customer,
        providerCashConfirmedAt: provider,
      }),
    ).toEqual(provider)
  })
})

describe('chatClosesAt', () => {
  it('returns null when not completed', () => {
    expect(
      chatClosesAt({
        status: 'IN_PROGRESS',
        customerCompletedAt: null,
        providerCashConfirmedAt: null,
      }),
    ).toBeNull()
  })

  it('returns completion + 3h for completed bookings', () => {
    const t = new Date(NOW.getTime() - HOUR)
    const expected = new Date(t.getTime() + POST_COMPLETION_WINDOW_MS)
    expect(
      chatClosesAt({
        status: 'COMPLETED',
        customerCompletedAt: t,
        providerCashConfirmedAt: null,
      }),
    ).toEqual(expected)
  })
})
