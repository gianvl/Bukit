import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, MapPin } from 'lucide-react'
import {
  assignedBookingsQueryOptions,
  providerProfileQueryOptions,
  type ProviderStatus,
} from '@/features/providers/api'
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
    await context.queryClient.ensureQueryData(assignedBookingsQueryOptions)
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
