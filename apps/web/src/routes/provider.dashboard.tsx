import { useEffect, useState } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Loader2, MapPin } from 'lucide-react'
import {
  acceptBooking,
  assignedBookingsQueryOptions,
  availableBookingsQueryOptions,
  confirmCashReceived,
  providerProfileQueryOptions,
  setAvailabilityMode,
  startBooking,
  type AssignedBooking,
  type AvailabilityMode,
  type ProviderProfile,
  type ProviderStatus,
} from '@/features/providers/api'
import {
  Banknote,
  Briefcase,
  Calendar,
  CheckCircle2,
  MapPinOff,
  Navigation,
  Phone,
  Play,
  Power,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShareLocation, type ShareLocationStatus } from '@/features/providers/use-share-location'
import { getSocket } from '@/lib/socket'
import { PageEyebrow, PageHero, PageStat, PageStats, PageTitle } from '@/components/page-shell'
import { earningsQueryOptions } from '@/features/earnings/api'
import { Wallet } from 'lucide-react'
import { ProviderReviewsCard } from '@/components/provider-reviews-card'
import { showStatusToast } from '@/features/bookings/status-toasts'
import { meQueryOptions } from '@/features/me/api'
import { PaginationBar, usePagination } from '@/components/pagination-bar'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/auth-client'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCentavos, formatDuration } from '@/lib/format'

export const Route = createFileRoute('/provider/dashboard')({
  component: ProviderDashboard,
  beforeLoad: async ({ location }) => {
    const { data } = await getSession()
    if (!data) {
      throw redirect({
        to: '/signin',
        search: { redirect: location.href, as: 'provider' },
      })
    }
  },
  loader: async ({ context }) => {
    const profile = await context.queryClient.ensureQueryData(providerProfileQueryOptions)
    if (!profile) throw redirect({ to: '/provider' })
    await Promise.all([
      context.queryClient.ensureQueryData(assignedBookingsQueryOptions),
      context.queryClient.ensureQueryData(availableBookingsQueryOptions),
    ])
  },
})

const STATUS_LABEL: Record<ProviderStatus, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING_KYC: { label: 'Application under review', tone: 'outline' },
  ACTIVE: { label: 'Active', tone: 'default' },
  SUSPENDED: { label: 'Suspended', tone: 'destructive' },
  REJECTED: { label: 'Rejected', tone: 'destructive' },
}

function ProviderDashboard() {
  const queryClient = useQueryClient()
  const { data: profile, isPending: profilePending } = useQuery(providerProfileQueryOptions)
  const { data: bookings, isPending: bookingsPending } = useQuery(assignedBookingsQueryOptions)
  const { data: available } = useQuery(availableBookingsQueryOptions)
  const { data: earnings } = useQuery(earningsQueryOptions)
  const payoutMethodLinked = !!earnings?.payoutMethod

  // Subscribe to live booking notifications. Server auto-joins us into our city's
  // area room on connect; we just react to events.
  useEffect(() => {
    if (profile?.status !== 'ACTIVE') return
    const socket = getSocket()
    const onCreated = () => {
      queryClient.invalidateQueries({ queryKey: availableBookingsQueryOptions.queryKey })
    }
    const onTaken = (data: { bookingId: string }) => {
      // Optimistically remove from local list, then invalidate for freshness.
      queryClient.setQueryData<{ bookings: AssignedBooking[] }>(
        availableBookingsQueryOptions.queryKey,
        (prev) =>
          prev
            ? { bookings: prev.bookings.filter((b) => b.id !== data.bookingId) }
            : prev,
      )
      queryClient.invalidateQueries({ queryKey: availableBookingsQueryOptions.queryKey })
    }
    // Server emits booking:status to provider:{userId} room (auto-joined on
    // connect) for any of this provider's assigned bookings — refresh both
    // the assigned list and any open booking detail in cache, plus toast the
    // provider when the change wasn't their own click.
    const onStatus = (data: {
      bookingId: string
      status: string
      actorUserId: string | null
    }) => {
      const me = queryClient.getQueryData(meQueryOptions.queryKey) as
        | { id: string; role: 'USER' | 'PROVIDER' | 'ADMIN' }
        | null
        | undefined
      showStatusToast({
        status: data.status,
        actorUserId: data.actorUserId,
        myUserId: me?.id,
        viewerRole: me?.role,
      })
      queryClient.invalidateQueries({ queryKey: assignedBookingsQueryOptions.queryKey })
      queryClient.invalidateQueries({ queryKey: ['bookings', data.bookingId] })
    }
    socket.on('booking:created', onCreated)
    socket.on('booking:taken', onTaken)
    socket.on('booking:status', onStatus)
    return () => {
      socket.off('booking:created', onCreated)
      socket.off('booking:taken', onTaken)
      socket.off('booking:status', onStatus)
    }
  }, [profile?.status, queryClient])

  if (profilePending || !profile) return <DashboardSkeleton />

  const meta = STATUS_LABEL[profile.status]

  const assignedActive =
    bookings?.filter(
      (b) =>
        b.status === 'PROVIDER_ASSIGNED' ||
        b.status === 'IN_PROGRESS' ||
        b.status === 'EN_ROUTE' ||
        b.status === 'PENDING_CASH_CONFIRM',
    ).length ?? 0
  const completedToday =
    bookings?.filter((b) => b.status === 'COMPLETED' && isToday(b.scheduledAt)).length ?? 0

  return (
    <>
      <PageHero maxWidth="max-w-5xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="max-w-2xl">
            <PageEyebrow icon={Briefcase}>Provider dashboard</PageEyebrow>
            <div className="mt-6">
              <PageTitle accent="Metro Manila.">Working across</PageTitle>
            </div>
          </div>
          <Badge variant={meta.tone} className="self-start">
            {meta.label}
          </Badge>
        </div>
        {profile.status === 'ACTIVE' && (
          <PageStats className="grid-cols-3 max-w-md">
            <PageStat kpi={available?.length ?? 0} label="available now" />
            <PageStat kpi={assignedActive} label="active jobs" />
            <PageStat kpi={completedToday} label="done today" />
          </PageStats>
        )}
      </PageHero>

      <section className="mx-auto max-w-5xl px-6 py-10 space-y-6">
      {profile.status === 'ACTIVE' && !payoutMethodLinked && <PayoutGateBanner />}

      {profile.status === 'ACTIVE' && <AvailabilityCard profile={profile} />}

      {profile.status === 'PENDING_KYC' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">We're reviewing your application</CardTitle>
            <CardDescription>
              Bukit verifies every provider before they receive bookings. We'll notify you within
              24 hours.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {profile.status === 'ACTIVE' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Available in your area</CardTitle>
            <CardDescription>
              Confirmed bookings near you. First to accept gets the job.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {available && available.length > 0 ? (
              <ul className="space-y-3">
                {available.map((b) => (
                  <li key={b.id}>
                    <AvailableBookingRow booking={b} payoutMethodLinked={payoutMethodLinked} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No matching bookings right now. We'll show new ones here as they come in.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <AssignedBookingsSection bookingsPending={bookingsPending} bookings={bookings} />
      </section>
    </>
  )
}

function formatPhoneForDisplay(e164: string): string {
  if (e164.startsWith('+639') && e164.length === 13) {
    return `+63 ${e164.slice(3, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`
  }
  return e164
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

const AVAILABILITY_OPTIONS: Array<{
  value: AvailabilityMode
  label: string
  description: string
  Icon: typeof Power
}> = [
  {
    value: 'OFFLINE',
    label: 'Off',
    description: 'Not accepting any bookings.',
    Icon: Power,
  },
  {
    value: 'SCHEDULED_ONLY',
    label: 'Scheduled only',
    description: 'Only receive bookings planned in advance.',
    Icon: Calendar,
  },
  {
    value: 'FULL',
    label: 'On-demand + scheduled',
    description: 'Receive on-demand pings and scheduled bookings.',
    Icon: Zap,
  },
]

function AvailabilityCard({ profile }: { profile: ProviderProfile }) {
  const queryClient = useQueryClient()
  const setMode = useMutation({
    mutationFn: setAvailabilityMode,
    onMutate: async (mode) => {
      await queryClient.cancelQueries({ queryKey: providerProfileQueryOptions.queryKey })
      const previous = queryClient.getQueryData<ProviderProfile | null>(
        providerProfileQueryOptions.queryKey,
      )
      if (previous) {
        queryClient.setQueryData<ProviderProfile>(providerProfileQueryOptions.queryKey, {
          ...previous,
          availabilityMode: mode,
        })
      }
      return { previous }
    },
    onError: (_err, _mode, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(providerProfileQueryOptions.queryKey, ctx.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: providerProfileQueryOptions.queryKey })
      queryClient.invalidateQueries({ queryKey: availableBookingsQueryOptions.queryKey })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Availability</CardTitle>
        <CardDescription>Control which bookings you receive.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="radiogroup"
          aria-label="Availability mode"
          className="grid gap-2 sm:grid-cols-3"
        >
          {AVAILABILITY_OPTIONS.map(({ value, label, description, Icon }) => {
            const active = profile.availabilityMode === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={setMode.isPending}
                onClick={() => {
                  if (!active) setMode.mutate(value)
                }}
                className={cn(
                  'group relative rounded-xl border p-4 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-muted/40',
                  setMode.isPending && 'opacity-60 cursor-wait',
                )}
              >
                <div className="flex items-center justify-between">
                  <Icon
                    className={cn('size-4', active ? 'text-primary' : 'text-muted-foreground')}
                  />
                  {active && (
                    <span className="size-2 rounded-full bg-primary" aria-hidden />
                  )}
                </div>
                <div className="mt-3 text-sm font-medium">{label}</div>
                <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {description}
                </div>
              </button>
            )
          })}
        </div>
        <LocationSharingIndicator availabilityMode={profile.availabilityMode} />
      </CardContent>
    </Card>
  )
}

function LocationSharingIndicator({ availabilityMode }: { availabilityMode: AvailabilityMode }) {
  // On-demand matching needs a fresh location, so we share whenever FULL.
  const sharing = availabilityMode === 'FULL'
  const { status, lastUpdateAt } = useShareLocation(sharing)
  const [tick, setTick] = useState(0)

  // Re-render once a second so "updated Ns ago" stays fresh.
  useEffect(() => {
    if (!sharing) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [sharing])

  if (!sharing) {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
        <MapPinOff className="size-3.5" />
        Switch to <span className="font-medium text-foreground">On-demand + scheduled</span> to
        start sharing your location and receive on-demand bookings.
      </p>
    )
  }

  return (
    <p className="text-xs inline-flex items-center gap-2 tabular-nums">
      <Navigation
        className={cn(
          'size-3.5',
          status === 'sharing'
            ? 'text-primary'
            : status === 'denied' || status === 'unsupported'
              ? 'text-destructive'
              : 'text-muted-foreground',
        )}
      />
      <span className={status === 'denied' || status === 'unsupported' ? 'text-destructive' : 'text-muted-foreground'}>
        {locationLabel(status, lastUpdateAt, tick)}
      </span>
    </p>
  )
}

function locationLabel(status: ShareLocationStatus, lastUpdateAt: Date | null, _tick: number) {
  switch (status) {
    case 'idle':
    case 'requesting':
      return 'Requesting location permission…'
    case 'sharing':
      return lastUpdateAt
        ? `Sharing location · updated ${formatAgo(lastUpdateAt)}`
        : 'Sharing location'
    case 'denied':
      return 'Location blocked. Enable in browser settings to receive on-demand bookings.'
    case 'unsupported':
      return 'This browser does not support geolocation.'
  }
}

function formatAgo(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

const PAST_STATUSES = new Set([
  'COMPLETED',
  'CANCELLED_BY_USER',
  'CANCELLED_BY_PROVIDER',
  'REFUNDED',
])

function AssignedBookingsSection({
  bookingsPending,
  bookings,
}: {
  bookingsPending: boolean
  bookings: AssignedBooking[] | undefined
}) {
  const active = bookings?.filter((b) => !PAST_STATUSES.has(b.status)) ?? []
  const past = bookings?.filter((b) => PAST_STATUSES.has(b.status)) ?? []

  return (
    <>
      <AssignedJobsCard
        title="Active jobs"
        description="Bookings you're currently working on or about to start."
        emptyHint='No active jobs right now. Accept one from "Available in your area" above.'
        bookings={active}
        pending={bookingsPending}
      />

      <ProviderReviewsCard />

      {past.length > 0 && (
        <AssignedJobsCard
          title="Past jobs"
          description={`${past.length} ${past.length === 1 ? 'completed booking' : 'completed bookings'}.`}
          bookings={past}
          pending={false}
        />
      )}
    </>
  )
}

function AssignedJobsCard({
  title,
  description,
  emptyHint,
  bookings,
  pending,
}: {
  title: string
  description: string
  emptyHint?: string
  bookings: AssignedBooking[]
  pending: boolean
}) {
  const { visible, page, totalPages, setPage } = usePagination(bookings, 10)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {pending ? (
          <BookingsSkeleton />
        ) : bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          <>
            <ul className="space-y-3">
              {visible.map((b) => (
                <li key={b.id}>
                  <AssignedBookingRow booking={b} />
                </li>
              ))}
            </ul>
            <PaginationBar page={page} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function AssignedBookingRow({ booking }: { booking: AssignedBooking }) {
  const queryClient = useQueryClient()
  const start = useMutation({
    mutationFn: () => startBooking(booking.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: assignedBookingsQueryOptions.queryKey }),
  })
  const confirm = useMutation({
    mutationFn: () => confirmCashReceived(booking.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: assignedBookingsQueryOptions.queryKey }),
  })

  const status = booking.status as
    | 'PROVIDER_ASSIGNED'
    | 'IN_PROGRESS'
    | 'PENDING_CASH_CONFIRM'
    | 'COMPLETED'
    | string

  return (
    <Card className="relative transition-shadow hover:shadow-md">
      {/* Whole-card link sits behind interactive elements. */}
      <Link
        to="/bookings/$id"
        params={{ id: booking.id }}
        aria-label={`Open ${booking.serviceTier.name} booking details`}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      <CardHeader className="flex flex-row items-start justify-between gap-4 relative pointer-events-none">
        <div className="space-y-1">
          <h3 className="text-base font-semibold tracking-tight">
            {booking.serviceTier.name}
          </h3>
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
            <CalendarClock className="size-3.5" />
            {formatScheduled(booking.scheduledAt)} · {formatDuration(booking.durationMinutes)}
          </p>
          <div className="flex items-center gap-1.5 pt-1">
            {booking.bookingMode === 'ON_DEMAND' && (
              <Badge variant="outline" className="gap-1">
                <Zap className="size-3" />
                On-demand
              </Badge>
            )}
            {booking.paymentMethod === 'CASH' && (
              <Badge variant="outline" className="gap-1">
                <Banknote className="size-3" />
                Cash
              </Badge>
            )}
          </div>
        </div>
        <span className="text-sm font-medium">{formatCentavos(booking.totalCentavos)}</span>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 text-sm flex-wrap">
        <div className="space-y-1 pointer-events-none">
          <span className="text-muted-foreground inline-flex items-center gap-2">
            <MapPin className="size-3.5" />
            {booking.addressLine1}, {booking.city}
          </span>
          {booking.customerPhoneNumber ? (
            <a
              href={`tel:${booking.customerPhoneNumber}`}
              onClick={(e) => e.stopPropagation()}
              className="relative pointer-events-auto text-primary inline-flex items-center gap-2 hover:underline underline-offset-4"
            >
              <Phone className="size-3.5" />
              {booking.customerName} · {formatPhoneForDisplay(booking.customerPhoneNumber)}
            </a>
          ) : (
            <span className="text-muted-foreground inline-flex items-center gap-2">
              <Phone className="size-3.5" />
              {booking.customerName}
            </span>
          )}
        </div>
        {status === 'PROVIDER_ASSIGNED' && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              start.mutate()
            }}
            disabled={start.isPending}
            className="relative"
          >
            {start.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Play className="size-3.5" />
                Start service
              </>
            )}
          </Button>
        )}
        {status === 'IN_PROGRESS' && (
          <span className="text-xs text-muted-foreground">
            Awaiting customer to confirm
          </span>
        )}
        {status === 'PENDING_CASH_CONFIRM' && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              confirm.mutate()
            }}
            disabled={confirm.isPending}
            className="relative"
          >
            {confirm.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Confirming…
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5" />
                Confirm cash received
              </>
            )}
          </Button>
        )}
        {status === 'COMPLETED' && (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="size-3" />
            Completed
          </Badge>
        )}
      </CardContent>
      {(start.error || confirm.error) && (
        <CardContent className="pt-0 text-sm text-destructive">
          {(start.error ?? confirm.error) instanceof ApiError
            ? (start.error ?? confirm.error)?.message
            : 'Something went wrong'}
        </CardContent>
      )}
    </Card>
  )
}

function AvailableBookingRow({
  booking,
  payoutMethodLinked,
}: {
  booking: AssignedBooking
  payoutMethodLinked: boolean
}) {
  const queryClient = useQueryClient()
  const accept = useMutation({
    mutationFn: () => acceptBooking(booking.id),
    // Optimistically remove the row from the available list the moment we
    // click. Two safeguards on top of the server's race-safe updateMany:
    //   1) prevents the UI from flashing duplicate "Accept" buttons if the
    //      socket event lags;
    //   2) the row disappears, so a fast double-tap can't fire a second
    //      request — the second click hits an empty list.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: availableBookingsQueryOptions.queryKey })
      const previous = queryClient.getQueryData<{ bookings: AssignedBooking[] }>(
        availableBookingsQueryOptions.queryKey,
      )
      queryClient.setQueryData<{ bookings: AssignedBooking[] }>(
        availableBookingsQueryOptions.queryKey,
        (prev) =>
          prev ? { bookings: prev.bookings.filter((b) => b.id !== booking.id) } : prev,
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      // Roll back: someone else may have legitimately taken it, but if the
      // failure was anything else (network blip, validation), the row
      // should reappear so the user can decide.
      if (ctx?.previous) {
        queryClient.setQueryData(availableBookingsQueryOptions.queryKey, ctx.previous)
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: availableBookingsQueryOptions.queryKey }),
        queryClient.invalidateQueries({ queryKey: assignedBookingsQueryOptions.queryKey }),
      ])
    },
  })

  const errorMessage =
    accept.error instanceof ApiError ? accept.error.message : accept.error ? 'Could not accept' : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">{booking.serviceTier.name}</CardTitle>
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
            <CalendarClock className="size-3.5" />
            {formatScheduled(booking.scheduledAt)} · {formatDuration(booking.durationMinutes)}
          </p>
        </div>
        <span className="text-sm font-medium">{formatCentavos(booking.totalCentavos)}</span>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground inline-flex items-center gap-2">
          <MapPin className="size-3.5" />
          {booking.addressLine1}, {booking.city}
        </span>
        {payoutMethodLinked ? (
          <Button size="sm" onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Accepting…
              </>
            ) : (
              'Accept'
            )}
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to="/provider/earnings">
              <Wallet className="size-4" />
              Add payout
            </Link>
          </Button>
        )}
      </CardContent>
      {errorMessage && (
        <CardContent className="pt-0 text-sm text-destructive" role="alert">
          {errorMessage}
        </CardContent>
      )}
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <Skeleton className="h-8 w-1/2" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    </section>
  )
}

function BookingsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <li key={i}>
          <Card>
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
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

/**
 * Hard gate: providers can browse the available list but the Accept button
 * is replaced with a deep link until they add a payout destination. The
 * server enforces the same rule on POST /bookings/:id/accept.
 */
function PayoutGateBanner() {
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base inline-flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            Add a payout method to start accepting
          </CardTitle>
          <CardDescription>
            We need to know where to send your earnings before you can claim a job.
          </CardDescription>
        </div>
        <Button asChild size="sm" className="rounded-full">
          <Link to="/provider/earnings">
            Add payout method
          </Link>
        </Button>
      </CardHeader>
    </Card>
  )
}
