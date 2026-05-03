import type { Role } from '@/features/me/api'
import { notify, type NotificationKind } from '@/features/notifications/notify'

interface ToastInput {
  status: string
  viewerRole: Role | undefined
  actorUserId: string | null
  myUserId: string | undefined
}

/**
 * Fires a centered modal notification for a remote booking status change,
 * suppressing self-triggered transitions so the user doesn't get notified
 * about their own click. Modal styling lives in NotificationModal.
 */
export function showStatusToast({
  status,
  viewerRole,
  actorUserId,
  myUserId,
}: ToastInput): boolean {
  if (actorUserId && myUserId && actorUserId === myUserId) return false

  const message = messageFor(status, viewerRole ?? 'USER')
  if (!message) return false

  notify({
    kind: message.kind,
    title: message.title,
    description: message.description,
  })
  return true
}

interface Message {
  kind: NotificationKind
  title: string
  description?: string
}

function messageFor(status: string, role: Role): Message | null {
  const isProvider = role === 'PROVIDER'

  switch (status) {
    case 'IN_ESCROW':
      return isProvider
        ? {
            kind: 'info',
            title: 'New booking available',
            description: 'A paid booking just opened in your area.',
          }
        : {
            kind: 'success',
            title: 'Payment confirmed',
            description: "We're matching you with a nearby provider.",
          }

    case 'CONFIRMED':
      return null

    case 'PROVIDER_ASSIGNED':
      return isProvider
        ? null
        : {
            kind: 'success',
            title: 'A provider accepted your booking!',
            description: "They're on the way. Watch the map to follow them.",
          }

    case 'EN_ROUTE':
      return isProvider
        ? null
        : {
            kind: 'info',
            title: 'Your provider is en route',
            description: 'Track them on the map below.',
          }

    case 'IN_PROGRESS':
      return isProvider
        ? null
        : {
            kind: 'success',
            title: 'Service started',
            description: 'Your provider has begun the job.',
          }

    case 'PENDING_CASH_CONFIRM':
      return isProvider
        ? {
            kind: 'cash',
            title: 'Customer marked the job done',
            description: 'Confirm cash receipt to complete the booking.',
          }
        : null

    case 'COMPLETED':
      return isProvider
        ? {
            kind: 'success',
            title: 'Booking completed',
            description: 'Payment will appear in your payouts.',
          }
        : {
            kind: 'success',
            title: 'Booking completed',
            description: 'Thanks for using Bukit!',
          }

    case 'CANCELLED_BY_USER':
      return isProvider
        ? {
            kind: 'cancel',
            title: 'Customer cancelled',
            description: 'This booking is no longer scheduled.',
          }
        : null

    case 'CANCELLED_BY_PROVIDER':
      return isProvider
        ? null
        : {
            kind: 'cancel',
            title: 'Provider cancelled',
            description: "We'll find you another provider.",
          }

    case 'REFUNDED':
      return isProvider
        ? null
        : {
            kind: 'refund',
            title: 'Refund processed',
            description: 'Funds will return to your payment method.',
          }

    default:
      return null
  }
}
