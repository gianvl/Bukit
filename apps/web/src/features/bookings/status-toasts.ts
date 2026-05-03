import { toast } from 'sonner'
import type { Role } from '@/features/me/api'

interface ToastInput {
  status: string
  viewerRole: Role | undefined
  actorUserId: string | null
  myUserId: string | undefined
}

/**
 * Fires a toast for a remote booking status change, suppressing self-triggered
 * transitions so the user doesn't get notified about their own click.
 *
 * Returns true when a toast was shown — useful for testing/visibility.
 */
export function showStatusToast({
  status,
  viewerRole,
  actorUserId,
  myUserId,
}: ToastInput): boolean {
  // Don't toast actions the viewer themselves performed.
  if (actorUserId && myUserId && actorUserId === myUserId) return false

  const message = messageFor(status, viewerRole ?? 'USER')
  if (!message) return false

  toast(message.title, {
    description: message.description,
  })
  return true
}

interface Message {
  title: string
  description?: string
}

function messageFor(status: string, role: Role): Message | null {
  // Normalize: providers see provider-perspective copy; everyone else sees customer perspective.
  const isProvider = role === 'PROVIDER'

  switch (status) {
    case 'IN_ESCROW':
      // Customer side: payment captured; provider doesn't need a toast.
      return isProvider
        ? { title: 'New booking available', description: 'A paid booking just opened in your area.' }
        : { title: 'Payment confirmed', description: "We're matching you with a nearby provider." }

    case 'CONFIRMED':
      // Cash booking, no payment needed; provider gets the new-booking ping in dashboard already.
      return null

    case 'PROVIDER_ASSIGNED':
      return isProvider
        ? null // provider just clicked accept
        : { title: 'A provider accepted your booking!', description: "They're on the way." }

    case 'EN_ROUTE':
      return isProvider
        ? null
        : { title: 'Your provider is en route', description: "Watch the map to follow them." }

    case 'IN_PROGRESS':
      return isProvider
        ? null
        : { title: 'Service started', description: 'Your provider has begun the job.' }

    case 'PENDING_CASH_CONFIRM':
      return isProvider
        ? {
            title: 'Customer marked the job done',
            description: 'Confirm cash receipt to complete the booking.',
          }
        : null

    case 'COMPLETED':
      return isProvider
        ? { title: 'Booking completed', description: 'Payment will appear in your payouts.' }
        : { title: 'Booking completed', description: 'Thanks for using Bukit!' }

    case 'CANCELLED_BY_USER':
      return isProvider
        ? { title: 'Customer cancelled', description: 'This booking is no longer scheduled.' }
        : null

    case 'CANCELLED_BY_PROVIDER':
      return isProvider
        ? null
        : { title: 'Provider cancelled', description: "We'll find you another provider." }

    case 'REFUNDED':
      return isProvider
        ? null
        : { title: 'Refund processed', description: 'Funds will return to your payment method.' }

    default:
      return null
  }
}
