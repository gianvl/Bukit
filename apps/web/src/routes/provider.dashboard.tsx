import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Loader2, MapPin } from 'lucide-react'
import {
  acceptBooking,
  assignedBookingsQueryOptions,
  availableBookingsQueryOptions,
  providerProfileQueryOptions,
  type AssignedBooking,
  type ProviderStatus,
} from '@/features/providers/api'
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
    if (!data) throw redirect({ to: '/signin', search: { redirect: location.href } })
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
  const { data: profile, isPending: profilePending } = useQuery(providerProfileQueryOptions)
  const { data: bookings, isPending: bookingsPending } = useQuery(assignedBookingsQueryOptions)
  const { data: available } = useQuery(availableBookingsQueryOptions)

  if (profilePending || !profile) return <DashboardSkeleton />

  const meta = STATUS_LABEL[profile.status]

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Provider dashboard</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {profile.cities[0] ? `Working in ${profile.cities.join(', ')}` : 'Welcome aboard'}
          </h1>
        </div>
        <Badge variant={meta.tone}>{meta.label}</Badge>
      </header>

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
                    <AvailableBookingRow booking={b} />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assigned bookings</CardTitle>
          <CardDescription>
            Jobs you've been matched to will show up here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookingsPending ? (
            <BookingsSkeleton />
          ) : !bookings || bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No assigned bookings yet. Once you're verified and a customer's request matches your
              area, you'll see it here.
            </p>
          ) : (
            <ul className="space-y-3">
              {bookings.map((b) => (
                <li key={b.id}>
                  <Link to="/bookings/$id" params={{ id: b.id }} className="block group">
                    <Card className="transition-shadow group-hover:shadow-md">
                      <CardHeader className="flex flex-row items-center justify-between gap-4">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{b.serviceTier.name}</CardTitle>
                          <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
                            <CalendarClock className="size-3.5" />
                            {formatScheduled(b.scheduledAt)} · {formatDuration(b.durationMinutes)}
                          </p>
                        </div>
                        <span className="text-sm font-medium">{formatCentavos(b.totalCentavos)}</span>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground inline-flex items-center gap-2">
                        <MapPin className="size-3.5" />
                        {b.addressLine1}, {b.city} · for {b.customerName}
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function AvailableBookingRow({ booking }: { booking: AssignedBooking }) {
  const queryClient = useQueryClient()
  const accept = useMutation({
    mutationFn: () => acceptBooking(booking.id),
    onSuccess: async () => {
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
