import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Clock,
  Shirt,
  Sparkles,
  SprayCan,
  Wind,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import {
  servicesQueryOptions,
  type ServiceTier,
  type ServiceWithTiers,
} from '@/features/service-tiers/queries'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCentavos, formatDuration } from '@/lib/format'
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
        <PageEyebrow icon={Sparkles}>Services · Our menu</PageEyebrow>
        <div className="mt-6 max-w-2xl">
          <PageTitle accent="No surprises.">Pick a tier.</PageTitle>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
            Flat rates set upfront. Add-ons available at booking time. Pay online or in cash —
            your call.
          </p>
        </div>
      </PageHero>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 space-y-14">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            Couldn't load services. Please try again.
          </p>
        ) : isPending || !services ? (
          <ServiceGroupSkeleton />
        ) : services.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            No services available right now. Check back soon.
          </p>
        ) : (
          services.map((service) => <ServiceGroup key={service.id} service={service} />)
        )}
      </section>
    </>
  )
}

function ServiceGroup({ service }: { service: ServiceWithTiers }) {
  const Icon = iconFor(service.iconKey)
  return (
    <div>
      <header className="flex items-start gap-4 mb-6">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-3xl tracking-tight">{service.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            {service.description}
          </p>
        </div>
      </header>
      {service.tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tiers configured for this service yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {service.tiers.map((tier, i) => (
            <TierCard key={tier.id} tier={tier} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function TierCard({ tier, index }: { tier: ServiceTier; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
    >
      <Link
        to="/book/$tierSlug"
        params={{ tierSlug: tier.slug }}
        className="group block rounded-2xl border bg-background p-6 h-full transition-colors hover:border-primary/50"
      >
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground line-clamp-2">
          {tier.description}
        </p>
        <h3 className="mt-3 font-display text-2xl">{tier.name}</h3>
        <p className="mt-6 font-display text-5xl tracking-tight">
          {formatCentavos(tier.basePriceCentavos)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
          <Clock className="size-3" />
          est. {formatDuration(tier.estimatedMinutes)}
        </p>
        <div className="mt-6 inline-flex items-center gap-1 text-sm text-primary">
          Book {tier.name}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
        </div>
      </Link>
    </motion.div>
  )
}

function ServiceGroupSkeleton() {
  return (
    <div className="space-y-12">
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g}>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-72 mb-6" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-9 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
