import { Badge } from '@/components/ui/badge'
import type { BookingStatus, PaymentStatus } from './queries'

const BOOKING_LABELS: Record<BookingStatus, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'outline' },
  CONFIRMED: { label: 'Confirmed', tone: 'secondary' },
  PROVIDER_ASSIGNED: { label: 'Provider assigned', tone: 'secondary' },
  EN_ROUTE: { label: 'On the way', tone: 'secondary' },
  IN_PROGRESS: { label: 'In progress', tone: 'default' },
  COMPLETED: { label: 'Completed', tone: 'default' },
  CANCELLED_BY_USER: { label: 'Cancelled', tone: 'destructive' },
  CANCELLED_BY_PROVIDER: { label: 'Cancelled by provider', tone: 'destructive' },
  REFUNDED: { label: 'Refunded', tone: 'outline' },
}

const PAYMENT_LABELS: Record<PaymentStatus, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Payment pending', tone: 'outline' },
  AUTHORIZED: { label: 'Payment authorized', tone: 'secondary' },
  CAPTURED: { label: 'Paid', tone: 'default' },
  FAILED: { label: 'Payment failed', tone: 'destructive' },
  REFUNDED: { label: 'Refunded', tone: 'outline' },
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { label, tone } = BOOKING_LABELS[status]
  return <Badge variant={tone}>{label}</Badge>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { label, tone } = PAYMENT_LABELS[status]
  return <Badge variant={tone}>{label}</Badge>
}
