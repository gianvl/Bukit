import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  MapPin,
  Receipt,
  ShoppingBag,
  Star,
  Wallet,
} from 'lucide-react'
import {
  meQueryOptions,
  meStatsQueryOptions,
  type CustomerStats,
  type ProviderStats,
} from '@/features/me/api'
import { bookingsListQueryOptions } from '@/features/bookings/queries'
import type { BookingSummary } from '@/features/bookings/api'
import { BookingStatusBadge } from '@/features/bookings/status'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CreamBackground, PageEyebrow, PageTitle } from '@/components/page-shell'
import { formatCentavos } from '@/lib/format'

/**
 * The personalized home shown to signed-in users at "/".
 * Anon users see the marketing landing instead.
 */
export function UserHome() {
  const { data: me } = useQuery(meQueryOptions)
  const { data: stats, isPending: statsPending } = useQuery(meStatsQueryOptions)
  const { data: bookings } = useQuery(bookingsListQueryOptions)

  const firstName = me?.name.split(' ')[0] ?? 'there'
  const isProvider = me?.role === 'PROVIDER'

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <CreamBackground />
        <div className="relative mx-auto max-w-6xl px-6 py-14 sm:py-20">
          <PageEyebrow icon={isProvider ? Briefcase : ShoppingBag}>
            {isProvider ? 'Your provider dashboard' : 'Welcome back'}
          </PageEyebrow>
          <div className="mt-6 max-w-2xl">
            <PageTitle accent={`${firstName}.`}>Hello,</PageTitle>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
              {isProvider
                ? 'Track your jobs and earnings at a glance, then jump into the dashboard when you’re ready to work.'
                : 'Your bookings, in one place. Need a fresh clean? Pick a tier and we’ll match you in minutes.'}
            </p>
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-full px-6 h-12 text-base">
              <Link to="/services">
                Book a service
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            {isProvider && (
              <Button asChild variant="outline" size="lg" className="rounded-full px-6 h-12 text-base">
                <Link to="/provider/dashboard">
                  Open provider dashboard
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Stats sections */}
      <section className="mx-auto max-w-6xl px-6 py-12 space-y-10">
        {/* Provider section first when applicable — they likely opened the app to work. */}
        {stats?.provider && (
          <ProviderStatsBlock pending={statsPending} stats={stats.provider} />
        )}
        {stats?.customer && (
          <CustomerStatsBlock pending={statsPending} stats={stats.customer} bookings={bookings} />
        )}
        {!stats && <StatsSkeleton />}
      </section>
    </>
  )
}

/* ─── Provider section ───────────────────────────────────────────── */

function ProviderStatsBlock({
  pending,
  stats,
}: {
  pending: boolean
  stats: ProviderStats
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <PageEyebrow icon={Briefcase}>Earnings</PageEyebrow>
          <h2 className="mt-2 font-display text-2xl tracking-tight">As a provider</h2>
        </div>
        <Link
          to="/provider/dashboard"
          className="text-sm text-primary inline-flex items-center gap-1 hover:gap-2 transition-all"
        >
          Open dashboard <ArrowUpRight className="size-4" />
        </Link>
      </div>

      {pending ? (
        <KpiSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={<Wallet className="size-4 text-primary" />}
            label="Total earned"
            value={formatCentavos(stats.totalEarnedCentavos)}
          />
          <Kpi
            icon={<Briefcase className="size-4 text-primary" />}
            label="Jobs completed"
            value={String(stats.completedJobs)}
            sub={stats.totalJobs > stats.completedJobs ? `of ${stats.totalJobs} total` : undefined}
          />
          <Kpi
            icon={<CalendarClock className="size-4 text-primary" />}
            label="This week"
            value={String(stats.jobsThisWeek)}
            sub="completed"
          />
          <Kpi
            icon={<Star className="size-4 text-primary" />}
            label="Rating"
            value={stats.ratingCount > 0 ? stats.ratingAvg.toFixed(1) : '—'}
            sub={stats.ratingCount > 0 ? `${stats.ratingCount} reviews` : 'no reviews yet'}
          />
        </div>
      )}
    </div>
  )
}

/* ─── Customer section ───────────────────────────────────────────── */

function CustomerStatsBlock({
  pending,
  stats,
  bookings,
}: {
  pending: boolean
  stats: CustomerStats
  bookings: BookingSummary[] | undefined
}) {
  const recent = (bookings ?? []).slice(0, 3)

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <PageEyebrow icon={ShoppingBag}>Your activity</PageEyebrow>
          <h2 className="mt-2 font-display text-2xl tracking-tight">As a customer</h2>
        </div>
        <Link
          to="/bookings"
          className="text-sm text-primary inline-flex items-center gap-1 hover:gap-2 transition-all"
        >
          All bookings <ArrowUpRight className="size-4" />
        </Link>
      </div>

      {pending ? (
        <KpiSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi
            icon={<Receipt className="size-4 text-primary" />}
            label="Bookings made"
            value={String(stats.totalBookings)}
          />
          <Kpi
            icon={<Briefcase className="size-4 text-primary" />}
            label="Completed"
            value={String(stats.completedBookings)}
            sub={stats.cancelledBookings > 0 ? `${stats.cancelledBookings} cancelled` : undefined}
          />
          <Kpi
            icon={<Wallet className="size-4 text-primary" />}
            label="Total spent"
            value={formatCentavos(stats.totalSpentCentavos)}
          />
        </div>
      )}

      {/* Recent bookings preview */}
      {recent.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-lg tracking-tight">Recent</h3>
          <ul className="space-y-3">
            {recent.map((b, i) => (
              <li key={b.id}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Link to="/bookings/$id" params={{ id: b.id }} className="block group">
                    <Card className="transition-shadow group-hover:shadow-md">
                      <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div className="space-y-1">
                          <CardTitle className="font-display text-base">
                            {b.serviceTier.name}
                          </CardTitle>
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
                        <span className="font-display text-base">
                          {formatCentavos(b.totalCentavos)}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ─── Shared bits ────────────────────────────────────────────────── */

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10">
            {icon}
          </span>
          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </span>
        </div>
        <p className="mt-4 font-display text-3xl tracking-tight tabular-nums">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-40" />
      <KpiSkeleton />
    </div>
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

