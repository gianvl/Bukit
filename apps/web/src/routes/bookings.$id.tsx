import { useEffect } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CalendarClock, CheckCircle2, Loader2, MapPin, NotebookPen, XCircle } from 'lucide-react'
import {
  cancelBooking,
  getCancellationQuote,
  type CancellationQuote,
} from '@/features/bookings/api'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ApiError } from '@/lib/api'
import {
  bookingDetailQueryOptions,
  bookingsListQueryOptions,
  type BookingDetail,
  type BookingEventType,
  type BookingStatus,
} from '@/features/bookings/queries'
import { BookingStatusBadge, PaymentStatusBadge } from '@/features/bookings/status'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCentavos } from '@/lib/format'
import { getSession } from '@/lib/auth-client'

interface DetailSearch {
  status?: 'success' | 'cancelled'
}

export const Route = createFileRoute('/bookings/$id')({
  component: BookingDetailPage,
  validateSearch: (raw: Record<string, unknown>): DetailSearch => {
    const status = raw.status
    return status === 'success' || status === 'cancelled' ? { status } : {}
  },
  beforeLoad: async ({ location }) => {
    const { data } = await getSession()
    if (!data) throw redirect({ to: '/signin', search: { redirect: location.href } })
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(bookingDetailQueryOptions(params.id)),
})

function BookingDetailPage() {
  const { id } = Route.useParams()
  const { status: returnStatus } = Route.useSearch()
  const queryClient = useQueryClient()

  const queryOpts = bookingDetailQueryOptions(id)
  const {
    data: booking,
    isPending,
    error,
  } = useQuery({
    ...queryOpts,
    // Poll while waiting for the HelixPay webhook to flip Payment off PENDING.
    refetchInterval: (q) => {
      const b = q.state.data
      if (returnStatus !== 'success') return false
      if (!b) return 1500
      if (!b.payment || b.payment.status === 'PENDING') return 2000
      return false
    },
  })

  // On first land with status=success, force an immediate refetch in case the
  // cache from the loader is older than the webhook.
  useEffect(() => {
    if (returnStatus === 'success') {
      queryClient.invalidateQueries({ queryKey: queryOpts.queryKey })
    }
  }, [returnStatus, queryClient, queryOpts.queryKey])

  if (isPending) return <DetailSkeleton />
  if (error || !booking) {
    return (
      <section className="mx-auto max-w-2xl px-6 py-16 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Booking not found</h1>
        <Button asChild>
          <Link to="/bookings">Back to bookings</Link>
        </Button>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      {returnStatus && <ReturnBanner status={returnStatus} payment={booking.payment} />}

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{booking.serviceTier.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {formatScheduled(booking.scheduledAt)}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <BookingStatusBadge status={booking.status as never} />
          {booking.payment && <PaymentStatusBadge status={booking.payment.status} />}
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle className="text-base">Booking details</CardTitle>
          <CancelBookingButton booking={booking} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row icon={<MapPin className="size-4" />} label="Address">
            <div>
              {booking.addressLine1}
              {booking.addressLine2 && <>, {booking.addressLine2}</>}
              <br />
              <span className="text-muted-foreground">
                {[booking.barangay, booking.city, booking.province].filter(Boolean).join(', ')}
              </span>
            </div>
          </Row>
          <Row icon={<CalendarClock className="size-4" />} label="Scheduled">
            {formatScheduled(booking.scheduledAt)}
          </Row>
          {booking.notes && (
            <Row icon={<NotebookPen className="size-4" />} label="Notes">
              {booking.notes}
            </Row>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="text-lg font-semibold">{formatCentavos(booking.totalCentavos)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
          <CardDescription>Every status change for this booking.</CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline events={booking.events} />
        </CardContent>
      </Card>
    </section>
  )
}

const CANCELLABLE_STATES: BookingStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PROVIDER_ASSIGNED',
]

function CancelBookingButton({ booking }: { booking: BookingDetail }) {
  const queryClient = useQueryClient()

  const eligible = CANCELLABLE_STATES.includes(booking.status as BookingStatus)
  const quoteQuery = useQuery<CancellationQuote>({
    queryKey: ['bookings', booking.id, 'cancellation-quote'],
    queryFn: () => getCancellationQuote(booking.id),
    enabled: eligible,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelBooking(booking.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: bookingDetailQueryOptions(booking.id).queryKey }),
        queryClient.invalidateQueries({ queryKey: bookingsListQueryOptions.queryKey }),
      ])
    },
  })

  if (!eligible) return null

  const quote = quoteQuery.data
  const errorMessage =
    cancelMutation.error instanceof ApiError
      ? cancelMutation.error.message
      : cancelMutation.error
        ? 'Cancellation failed'
        : null

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) cancelMutation.reset()
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          Cancel booking
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            {quote ? quote.reason : 'Loading cancellation policy…'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {quote && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Booking total</span>
              <span>{formatCentavos(booking.totalCentavos)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cancellation fee</span>
              <span>{formatCentavos(quote.feeCentavos)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Refund</span>
              <span>{formatCentavos(quote.refundCentavos)}</span>
            </div>
          </div>
        )}

        {errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelMutation.isPending}>Keep booking</AlertDialogCancel>
          <AlertDialogAction
            disabled={cancelMutation.isPending || !quote}
            onClick={(e) => {
              e.preventDefault()
              cancelMutation.mutate()
            }}
          >
            {cancelMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Cancelling…
              </>
            ) : (
              'Confirm cancellation'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ReturnBanner({
  status,
  payment,
}: {
  status: 'success' | 'cancelled'
  payment: BookingDetail['payment']
}) {
  const success = status === 'success'
  const settled = payment && payment.status !== 'PENDING'
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={
        'rounded-md border p-4 flex items-start gap-3 ' +
        (success
          ? 'border-primary/30 bg-primary/5'
          : 'border-destructive/30 bg-destructive/5 text-destructive')
      }
      role="status"
    >
      {success ? (
        <CheckCircle2 className="size-5 text-primary mt-0.5" />
      ) : (
        <XCircle className="size-5 mt-0.5" />
      )}
      <div className="text-sm">
        {success ? (
          settled ? (
            <>
              <p className="font-medium text-foreground">Payment confirmed</p>
              <p className="text-muted-foreground">
                We'll match you with a vetted provider shortly.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground">Waiting for payment confirmation…</p>
              <p className="text-muted-foreground">
                This usually takes a few seconds. We're checking automatically.
              </p>
            </>
          )
        ) : (
          <>
            <p className="font-medium">Payment cancelled</p>
            <p>This booking is still pending. Try paying again from the timeline below.</p>
          </>
        )}
      </div>
    </motion.div>
  )
}

const EVENT_LABELS: Record<BookingEventType, string> = {
  CREATED: 'Booking created',
  PAYMENT_AUTHORIZED: 'Payment confirmed',
  PROVIDER_ASSIGNED: 'Provider assigned',
  EN_ROUTE: 'Provider on the way',
  ARRIVED: 'Provider arrived',
  STARTED: 'Service started',
  COMPLETED: 'Service completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  NOTE: 'Note',
}

function Timeline({ events }: { events: BookingDetail['events'] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events yet.</p>
  }
  return (
    <ol className="relative border-l pl-4 space-y-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[1.35rem] top-1.5 size-2 rounded-full bg-primary" />
          <p className="text-sm font-medium">{EVENT_LABELS[e.type]}</p>
          <p className="text-xs text-muted-foreground">{formatTimestamp(e.createdAt)}</p>
        </li>
      ))}
    </ol>
  )
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <Skeleton className="h-8 w-1/2" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
        </CardContent>
      </Card>
    </section>
  )
}

function formatScheduled(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
