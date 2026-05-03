import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Banknote, CalendarClock, MapPin, Receipt, Zap } from 'lucide-react'
import { bookingsListQueryOptions } from '@/features/bookings/queries'
import type { BookingSummary } from '@/features/bookings/api'
import { PaginationBar, usePagination } from '@/components/pagination-bar'
import { BookingStatusBadge } from '@/features/bookings/status'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCentavos } from '@/lib/format'
import { getSession } from '@/lib/auth-client'
import { PageEyebrow, PageHero, PageTitle } from '@/components/page-shell'

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
    <>
      <PageHero>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="max-w-2xl">
            <PageEyebrow icon={Receipt}>Your activity</PageEyebrow>
            <div className="mt-6">
              <PageTitle accent="all in one place.">Bookings,</PageTitle>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
                Every booking you've made — past, in flight, and upcoming.
              </p>
            </div>
          </div>
          <Button asChild size="lg" className="rounded-full px-6">
            <Link to="/services">New booking</Link>
          </Button>
        </div>
      </PageHero>

      <section className="mx-auto max-w-3xl px-6 py-12">
        {isPending ? (
          <ListSkeleton />
        ) : !bookings || bookings.length === 0 ? (
          <EmptyState />
        ) : (
          <BookingSections bookings={bookings} />
        )}
      </section>
    </>
  )
}

const PAST_STATUSES = new Set([
  'COMPLETED',
  'CANCELLED_BY_USER',
  'CANCELLED_BY_PROVIDER',
  'REFUNDED',
])

function BookingSections({ bookings }: { bookings: BookingSummary[] }) {
  const active = bookings.filter((b) => !PAST_STATUSES.has(b.status))
  const past = bookings.filter((b) => PAST_STATUSES.has(b.status))

  return (
    <div className="space-y-10">
      <SectionList
        eyebrow="In flight"
        title={
          active.length === 0
            ? 'No active bookings'
            : active.length === 1
              ? '1 active booking'
              : `${active.length} active bookings`
        }
        bookings={active}
        emptyHint="Pick a tier and we'll match you in minutes."
      />
      {past.length > 0 && (
        <SectionList
          eyebrow="History"
          title={past.length === 1 ? '1 past booking' : `${past.length} past bookings`}
          bookings={past}
        />
      )}
    </div>
  )
}

function SectionList({
  eyebrow,
  title,
  bookings,
  emptyHint,
}: {
  eyebrow: string
  title: string
  bookings: BookingSummary[]
  emptyHint?: string
}) {
  const { visible, page, totalPages, setPage } = usePagination(bookings, 10)

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
        <h2 className="font-display text-xl tracking-tight mt-1">{title}</h2>
      </div>
      {bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <>
          <ul className="space-y-3">
            {visible.map((b, i) => (
              <li key={b.id}>
                <BookingRow booking={b} index={i} />
              </li>
            ))}
          </ul>
          <PaginationBar page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </div>
  )
}

function BookingRow({ booking, index }: { booking: BookingSummary; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link to="/bookings/$id" params={{ id: booking.id }} className="block group">
        <Card className="transition-shadow group-hover:shadow-md">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="font-display text-lg">{booking.serviceTier.name}</CardTitle>
              <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
                <CalendarClock className="size-3.5" />
                {formatScheduled(booking.scheduledAt)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <BookingStatusBadge status={booking.status as never} />
              <div className="flex items-center gap-1.5">
                {booking.bookingMode === 'ON_DEMAND' && (
                  <Badge variant="outline" className="gap-1">
                    <Zap className="size-3" />
                    Now
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
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground inline-flex items-center gap-2">
              <MapPin className="size-3.5" />
              {booking.addressLine1}, {booking.city}
            </span>
            <span className="font-display text-base">
              {formatCentavos(booking.totalCentavos)}
            </span>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-16 text-center space-y-4">
        <p className="font-display text-2xl">
          Your <span className="italic font-light text-primary">first booking</span> is one tap away.
        </p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Pick a tier, share your address, and a vetted cleaner will be on the way.
        </p>
        <Button asChild className="rounded-full px-6">
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
