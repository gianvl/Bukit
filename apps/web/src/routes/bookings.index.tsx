import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, MapPin } from 'lucide-react'
import { bookingsListQueryOptions } from '@/features/bookings/queries'
import { BookingStatusBadge } from '@/features/bookings/status'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCentavos } from '@/lib/format'
import { getSession } from '@/lib/auth-client'

export const Route = createFileRoute('/bookings/')({
  component: BookingsList,
  beforeLoad: async ({ location }) => {
    const { data } = await getSession()
    if (!data) {
      throw redirect({
        to: '/signin',
        search: { redirect: location.href, as: 'customer' },
      })
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(bookingsListQueryOptions),
})

function BookingsList() {
  const { data: bookings, isPending } = useQuery(bookingsListQueryOptions)

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Your bookings</h1>
        <Button asChild size="sm">
          <Link to="/services">New booking</Link>
        </Button>
      </div>

      {isPending ? (
        <ListSkeleton />
      ) : !bookings || bookings.length === 0 ? (
        <EmptyState />
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
                        {formatScheduled(b.scheduledAt)}
                      </p>
                    </div>
                    <BookingStatusBadge status={b.status as never} />
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground inline-flex items-center gap-2">
                      <MapPin className="size-3.5" />
                      {b.addressLine1}, {b.city}
                    </span>
                    <span className="font-medium">{formatCentavos(b.totalCentavos)}</span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-3">
        <p className="text-muted-foreground">You haven't booked anything yet.</p>
        <Button asChild>
          <Link to="/services">Browse services</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function ListSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i}>
          <Card>
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
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
