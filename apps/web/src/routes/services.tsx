import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Shirt,
  Sparkles,
  SprayCan,
  Wind,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import {
  servicesQueryOptions,
  type ServiceWithTiers,
} from '@/features/service-tiers/queries'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCentavos } from '@/lib/format'
import { PageEyebrow, PageHero, PageTitle } from '@/components/page-shell'

export const Route = createFileRoute('/services')({
  component: ServicesPage,
  loader: ({ context }) => context.queryClient.ensureQueryData(servicesQueryOptions),
})

/**
 * Map admin-supplied iconKey strings to Lucide components. New icons
 * here = new options the admin can pick by typing the key. Falls back
 * to Sparkles when the key isn't recognized so the page never breaks
 * on a typo.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  'spray-can': SprayCan,
  shirt: Shirt,
  wind: Wind,
  wrench: Wrench,
}

function iconFor(key: string): LucideIcon {
  return ICON_MAP[key] ?? Sparkles
}

function ServicesPage() {
  const { data: services, isPending, error } = useQuery(servicesQueryOptions)

  return (
    <>
      <PageHero>
        <PageEyebrow icon={Sparkles}>Services</PageEyebrow>
        <div className="mt-6 max-w-2xl">
          <PageTitle accent="our menu.">Browse</PageTitle>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
            Pick a service, then a tier on the next page. Flat rates set upfront, no surprises.
          </p>
        </div>
      </PageHero>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            Couldn't load services. Please try again.
          </p>
        ) : isPending || !services ? (
          <ServiceTileSkeleton />
        ) : services.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            No services available right now. Check back soon.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service, i) => (
              <ServiceTile key={service.id} service={service} index={i} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function ServiceTile({ service, index }: { service: ServiceWithTiers; index: number }) {
  const Icon = iconFor(service.iconKey)
  const startingFrom = service.tiers.length
    ? Math.min(...service.tiers.map((t) => t.basePriceCentavos))
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
    >
      <Link
        to="/services/$serviceSlug"
        params={{ serviceSlug: service.slug }}
        className="group block h-full rounded-2xl border bg-background p-6 transition-colors hover:border-primary/50"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {service.tiers.length} tier{service.tiers.length === 1 ? '' : 's'}
          </span>
        </div>
        <h3 className="mt-5 font-display text-2xl tracking-tight">{service.name}</h3>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
          {service.description}
        </p>
        <div className="mt-6 flex items-end justify-between gap-2">
          {startingFrom !== null ? (
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                From
              </div>
              <div className="font-display text-3xl tracking-tight tabular-nums">
                {formatCentavos(startingFrom)}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">Coming soon</div>
          )}
          <span className="inline-flex items-center gap-1 text-sm text-primary">
            View tiers
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
    </motion.div>
  )
}

function ServiceTileSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="space-y-3">
            <Skeleton className="size-12 rounded-2xl" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
