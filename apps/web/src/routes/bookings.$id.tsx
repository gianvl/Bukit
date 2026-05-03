import { useEffect } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Banknote, CalendarClock, CheckCircle2, CreditCard, Loader2, MapPin, NotebookPen, Phone, Play, User, XCircle, Zap } from 'lucide-react'
import { confirmCashReceived, startBooking } from '@/features/providers/api'
import { Badge } from '@/components/ui/badge'
import {
  cancelBooking,
  customerCompleteBooking,
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
import { BookingMap } from '@/components/booking-map'
import { getSocket, type ProviderLocationPayload } from '@/lib/socket'
import type { ProviderLocation } from '@/features/bookings/queries'
import {
  bookingDetailQueryOptions,
  bookingsListQueryOptions,
  providerLocationQueryOptions,
  type BookingDetail,
  type BookingEventType,
  type BookingStatus,
} from '@/features/bookings/queries'
import { Navigation } from 'lucide-react'
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
    if (!data) {
      throw redirect({
        to: '/signin',
        search: { redirect: location.href, as: 'customer' },
      })
    }
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

  // Join the booking's room and listen for status changes pushed from the server
  // (provider accepted, started, completed, cancelled, payment captured).
  useEffect(() => {
    const socket = getSocket()
    const onStatus = (payload: { bookingId: string }) => {
      if (payload.bookingId !== id) return
      queryClient.invalidateQueries({ queryKey: queryOpts.queryKey })
    }
    const join = () => {
      socket.emit('booking:join', { bookingId: id })
    }
    socket.on('booking:status', onStatus)
    socket.on('connect', join)
    if (socket.connected) join()

    return () => {
      socket.off('booking:status', onStatus)
      socket.off('connect', join)
      socket.emit('booking:leave', { bookingId: id })
    }
  }, [id, queryClient, queryOpts.queryKey])

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

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {booking.serviceTier.name}
          </p>
          <h1 className="font-display text-3xl tracking-tight">
            {formatScheduled(booking.scheduledAt)}
          </h1>
          <div className="flex items-center gap-1.5 pt-1">
            {(booking as { bookingMode?: 'ON_DEMAND' | 'SCHEDULED' }).bookingMode === 'ON_DEMAND' && (
              <Badge variant="outline" className="gap-1">
                <Zap className="size-3" />
                On-demand
              </Badge>
            )}
            {(booking as { paymentMethod?: 'ONLINE' | 'CASH' }).paymentMethod === 'CASH' ? (
              <Badge variant="outline" className="gap-1">
                <Banknote className="size-3" />
                Cash on arrival
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <CreditCard className="size-3" />
                Online payment
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <BookingStatusBadge status={booking.status as never} />
          {booking.payment && <PaymentStatusBadge status={booking.payment.status} />}
        </div>
      </header>

      <CompletionCallout booking={booking} />

      <ProviderActionsPanel booking={booking} />

      {booking.provider && (
        <CounterpartyCard label="Your provider" party={booking.provider} />
      )}
      {booking.customer && (
        <CounterpartyCard label="Customer" party={booking.customer} />
      )}

      <BookingMapPanel booking={booking} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle className="text-base">Booking details</CardTitle>
          {booking.viewerRole === 'CUSTOMER' && <CancelBookingButton booking={booking} />}
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

const PROVIDER_TRACKING_STATES: BookingStatus[] = [
  'PROVIDER_ASSIGNED',
  'EN_ROUTE',
  'IN_PROGRESS',
]

function BookingMapPanel({ booking }: { booking: BookingDetail }) {
  const queryClient = useQueryClient()
  const showProviderPin = PROVIDER_TRACKING_STATES.includes(
    booking.status as BookingStatus,
  )
  const queryKey = providerLocationQueryOptions(booking.id).queryKey
  const { data: providerLoc } = useQuery({
    ...providerLocationQueryOptions(booking.id),
    enabled: showProviderPin,
  })

  // Subscribe to live provider location pushes. The booking room itself is
  // joined/left by the parent BookingDetailPage so this works as soon as the
  // page mounts (parent stays mounted across status transitions).
  useEffect(() => {
    if (!showProviderPin) return
    const socket = getSocket()
    const onLocation = (payload: ProviderLocationPayload) => {
      if (payload.bookingId !== booking.id) return
      queryClient.setQueryData<ProviderLocation>(queryKey, {
        latitude: payload.latitude,
        longitude: payload.longitude,
        lastLocationAt: payload.lastLocationAt,
        distanceKm: payload.distanceKm,
      })
    }
    socket.on('provider:location', onLocation)
    return () => {
      socket.off('provider:location', onLocation)
    }
  }, [showProviderPin, booking.id, queryKey, queryClient])

  const hasBookingPin = booking.latitude !== null && booking.longitude !== null
  const hasProviderPin =
    showProviderPin &&
    providerLoc?.latitude != null &&
    providerLoc?.longitude != null

  if (!hasBookingPin && !hasProviderPin) return null

  const pins: Parameters<typeof BookingMap>[0]['pins'] = []
  if (hasBookingPin) {
    pins.push({
      latitude: booking.latitude!,
      longitude: booking.longitude!,
      label: `${booking.addressLine1}, ${booking.city}`,
      tone: 'primary',
    })
  }
  if (hasProviderPin) {
    pins.push({
      latitude: providerLoc!.latitude!,
      longitude: providerLoc!.longitude!,
      label: 'Your provider',
      tone: 'accent',
    })
  }

  return (
    <div className="space-y-2">
      <BookingMap pins={pins} />
      {showProviderPin && (
        <p className="text-xs inline-flex items-center gap-2 px-1 text-muted-foreground tabular-nums">
          <Navigation className="size-3.5 text-amber-500" />
          {hasProviderPin
            ? providerLoc!.distanceKm != null
              ? `Provider is ${providerLoc!.distanceKm!.toFixed(1)} km away · updated ${formatLocationAge(providerLoc!.lastLocationAt)}`
              : `Provider's location updated ${formatLocationAge(providerLoc!.lastLocationAt)}`
            : 'Waiting for the provider to share their location…'}
        </p>
      )}
    </div>
  )
}

function formatLocationAge(iso: string | null): string {
  if (!iso) return 'just now'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function CounterpartyCard({
  label,
  party,
}: {
  label: string
  party: { name: string; phoneNumber: string | null }
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <CardTitle className="font-display text-xl mt-2 inline-flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="size-4" />
          </span>
          {party.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Phone className="size-3.5" />
          {party.phoneNumber ? formatPhoneForDisplay(party.phoneNumber) : 'No phone on file'}
        </span>
        {party.phoneNumber && (
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <a href={`tel:${party.phoneNumber}`}>
              <Phone className="size-3.5" />
              Call
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function formatPhoneForDisplay(e164: string): string {
  if (e164.startsWith('+639') && e164.length === 13) {
    return `+63 ${e164.slice(3, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`
  }
  return e164
}

function ProviderActionsPanel({ booking }: { booking: BookingDetail }) {
  const queryClient = useQueryClient()
  const start = useMutation({
    mutationFn: () => startBooking(booking.id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: bookingDetailQueryOptions(booking.id).queryKey,
      }),
  })
  const confirm = useMutation({
    mutationFn: () => confirmCashReceived(booking.id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: bookingDetailQueryOptions(booking.id).queryKey,
      }),
  })

  if (booking.viewerRole !== 'PROVIDER') return null

  if (booking.status === 'PROVIDER_ASSIGNED') {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
        <Play className="size-5 text-primary mt-0.5" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-foreground">Ready to start?</p>
          <p className="text-muted-foreground">
            Tap Start when you arrive at the customer's location.
          </p>
          {start.error && (
            <p className="mt-2 text-destructive">
              {start.error instanceof ApiError ? start.error.message : 'Could not start'}
            </p>
          )}
        </div>
        <Button onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Play className="size-4" />
              Start service
            </>
          )}
        </Button>
      </div>
    )
  }

  if (booking.status === 'IN_PROGRESS') {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 flex items-start gap-3">
        <Loader2 className="size-5 text-muted-foreground mt-0.5 animate-spin" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-foreground">Service in progress</p>
          <p className="text-muted-foreground">
            Waiting for the customer to confirm completion.
          </p>
        </div>
      </div>
    )
  }

  if (booking.status === 'PENDING_CASH_CONFIRM') {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
        <Banknote className="size-5 text-primary mt-0.5" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-foreground">Did you receive the cash?</p>
          <p className="text-muted-foreground">
            Customer marked the job done. Confirm cash receipt to complete the booking.
          </p>
          {confirm.error && (
            <p className="mt-2 text-destructive">
              {confirm.error instanceof ApiError ? confirm.error.message : 'Could not confirm'}
            </p>
          )}
        </div>
        <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
          {confirm.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Confirming…
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              Confirm cash received
            </>
          )}
        </Button>
      </div>
    )
  }

  return null
}

function CompletionCallout({ booking }: { booking: BookingDetail }) {
  const queryClient = useQueryClient()
  const complete = useMutation({
    mutationFn: () => customerCompleteBooking(booking.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: bookingDetailQueryOptions(booking.id).queryKey,
      })
    },
  })

  // Customer-only: only the booking owner can mark a job complete.
  if (booking.viewerRole !== 'CUSTOMER') return null

  if (booking.status === 'IN_PROGRESS') {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
        <CheckCircle2 className="size-5 text-primary mt-0.5" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-foreground">Service in progress</p>
          <p className="text-muted-foreground">
            When the provider is done, mark it complete to release payment.
          </p>
          {complete.error && (
            <p className="mt-2 text-destructive">
              {complete.error instanceof ApiError
                ? complete.error.message
                : 'Could not mark as done'}
            </p>
          )}
        </div>
        <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
          {complete.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Marking…
            </>
          ) : (
            'Mark as done'
          )}
        </Button>
      </div>
    )
  }

  if (booking.status === 'PENDING_CASH_CONFIRM') {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 flex items-start gap-3">
        <Loader2 className="size-5 text-muted-foreground mt-0.5 animate-spin" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-foreground">Awaiting provider's cash confirmation</p>
          <p className="text-muted-foreground">
            We've notified your provider. The booking completes once they confirm receipt.
          </p>
        </div>
      </div>
    )
  }

  return null
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
  CUSTOMER_CONFIRMED: 'Customer marked as done',
  PROVIDER_CASH_RECEIVED: 'Provider confirmed cash received',
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
