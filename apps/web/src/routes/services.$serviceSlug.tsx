import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
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
} from '@/features/service-tiers/queries'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCentavos, formatDuration } from '@/lib/format'
import { PageEyebrow, PageHero, PageTitle } from '@/components/page-shell'

export const Route = createFileRoute('/services/$serviceSlug')({
  component: ServiceDetailPage,
  loader: ({ context }) => context.queryClient.ensureQueryData(servicesQueryOptions),
})

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

function ServiceDetailPage() {
  const { serviceSlug } = Route.useParams()
  const navigate = useNavigate()
  const { data: services, isPending } = useQuery(servicesQueryOptions)
  const service = services?.find((s) => s.slug === serviceSlug)

  if (isPending) return <ServiceDetailSkeleton />

  if (!service) {
    return (
      <section className="mx-auto max-w-md px-6 py-16 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Service not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been renamed or removed.
        </p>
        <Button onClick={() => navigate({ to: '/services' })}>
          Browse all services
        </Button>
      </section>
    )
  }

  const Icon = iconFor(service.iconKey)

  return (
    <>
      <PageHero>
        <Link
          to="/services"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3" />
          All services
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0 mt-1">
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <PageEyebrow>{service.name}</PageEyebrow>
            <div className="mt-3 max-w-2xl">
              <PageTitle accent="No surprises.">Pick a tier.</PageTitle>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
                {service.description}
              </p>
            </div>
          </div>
        </div>
      </PageHero>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
        {service.tiers.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            No tiers configured for this service yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {service.tiers.map((tier, i) => (
              <TierCard key={tier.id} tier={tier} index={i} />
            ))}
          </div>
        )}
      </section>
    </>
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

function ServiceDetailSkeleton() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14 space-y-8">
      <Skeleton className="h-10 w-48" />
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
    </section>
  )
}
