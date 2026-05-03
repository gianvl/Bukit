import type { BookingStatus } from '@prisma/client'

const FLAT_FEE_CENTAVOS = 10_000 // ₱100
const LATE_WINDOW_MINUTES = 30
const LATE_FEE_RATIO = 0.5

export interface CancellationQuote {
  /** Whether the booking can still be cancelled by the user. */
  cancellable: boolean
  /** Cents charged to the user; refunded amount is (totalCentavos - feeCentavos). */
  feeCentavos: number
  /** Human-readable reason explaining the fee (or 'Free cancellation'). */
  reason: string
}

export function quoteCancellation(args: {
  status: BookingStatus
  scheduledAt: Date
  totalCentavos: number
  now?: Date
}): CancellationQuote {
  const now = args.now ?? new Date()

  // Cannot cancel once the service is already in motion or finished.
  if (
    args.status === 'EN_ROUTE' ||
    args.status === 'IN_PROGRESS' ||
    args.status === 'COMPLETED' ||
    args.status === 'CANCELLED_BY_USER' ||
    args.status === 'CANCELLED_BY_PROVIDER' ||
    args.status === 'REFUNDED'
  ) {
    return { cancellable: false, feeCentavos: 0, reason: 'This booking can no longer be cancelled' }
  }

  // No payment captured yet → free cancel.
  if (args.status === 'PENDING_PAYMENT') {
    return { cancellable: true, feeCentavos: 0, reason: 'Free cancellation (no payment yet)' }
  }

  const minutesUntil = (args.scheduledAt.getTime() - now.getTime()) / 60_000

  // Within 30 min of scheduled time → 50% charge.
  if (minutesUntil < LATE_WINDOW_MINUTES) {
    const fee = Math.round(args.totalCentavos * LATE_FEE_RATIO)
    return {
      cancellable: true,
      feeCentavos: fee,
      reason: `${LATE_FEE_RATIO * 100}% charge — within ${LATE_WINDOW_MINUTES} minutes of scheduled time`,
    }
  }

  // Provider already assigned → flat ₱100 fee.
  if (args.status === 'PROVIDER_ASSIGNED') {
    return {
      cancellable: true,
      feeCentavos: Math.min(FLAT_FEE_CENTAVOS, args.totalCentavos),
      reason: 'Provider already assigned — ₱100 cancellation fee',
    }
  }

  // CONFIRMED but no provider yet → still free.
  return { cancellable: true, feeCentavos: 0, reason: 'Free cancellation' }
}
