import type { BookingStatus } from '@prisma/client'
import { env } from '../env.js'

/**
 * Read+write window for the customer ↔ provider chat after a booking
 * completes. Defaults to 3 hours; overridable via the
 * POST_COMPLETION_CHAT_MS env var.
 */
export const POST_COMPLETION_WINDOW_MS =
  env.POST_COMPLETION_CHAT_MS ?? 3 * 60 * 60 * 1000

interface ChatBooking {
  status: BookingStatus
  customerCompletedAt: Date | null
  providerCashConfirmedAt: Date | null
}

/**
 * Resolves the moment a booking entered COMPLETED status. For online bookings
 * that's `customerCompletedAt`; for cash bookings it's the later
 * `providerCashConfirmedAt`. Null for non-completed bookings.
 */
export function completedAt(b: ChatBooking): Date | null {
  if (b.status !== 'COMPLETED') return null
  return b.providerCashConfirmedAt ?? b.customerCompletedAt
}

/**
 * Whether customer ↔ provider chat is open right now.
 *   PROVIDER_ASSIGNED | EN_ROUTE | IN_PROGRESS | PENDING_CASH_CONFIRM → always open
 *   COMPLETED → open for POST_COMPLETION_WINDOW_MS after the completion timestamp
 *   any other status (PENDING_PAYMENT, IN_ESCROW, CONFIRMED, CANCELLED_*, REFUNDED) → closed
 */
export function isChatOpen(b: ChatBooking, now: Date = new Date()): boolean {
  switch (b.status) {
    case 'PROVIDER_ASSIGNED':
    case 'EN_ROUTE':
    case 'IN_PROGRESS':
    case 'PENDING_CASH_CONFIRM':
      return true
    case 'COMPLETED': {
      const t = completedAt(b)
      if (!t) return false
      return now.getTime() - t.getTime() < POST_COMPLETION_WINDOW_MS
    }
    default:
      return false
  }
}

/** When the chat will auto-close. Null if it isn't in the wind-down window. */
export function chatClosesAt(b: ChatBooking): Date | null {
  if (b.status !== 'COMPLETED') return null
  const t = completedAt(b)
  if (!t) return null
  return new Date(t.getTime() + POST_COMPLETION_WINDOW_MS)
}
