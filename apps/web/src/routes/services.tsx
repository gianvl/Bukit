import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight, Clock, SprayCan } from 'lucide-react'
import { serviceTiersQueryOptions, type ServiceTier } from '@/features/service-tiers/queries'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCentavos, formatDuration } from '@/lib/format'
import { PageEyebrow, PageHero, PageTitle } from '@/components/page-shell'

export const Route = createFileRoute('/services')({
  component: ServicesPage,
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceTiersQueryOptions),
})

function ServicesPage() {
  const { data: tiers, isPending, error } = useQuery(serviceTiersQueryOptions)

  return (
    <>
      <PageHero>
        <PageEyebrow icon={SprayCan}>Cleaning · Our menu</PageEyebrow>
        <div className="mt-6 max-w-2xl">
          <PageTitle accent="No surprises.">Pick your tier.</PageTitle>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
            Flat rates set upfront. Add-ons available at booking time. Pay online or in cash —
            your call.
          </p>
        </div>
      </PageHero>

      <section className="mx-auto max-w-6xl px-6 py-14">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            Couldn't load services. Please try again.
          </p>
        ) : isPending || !tiers ? (
          <TierGridSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier, i) => (
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
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
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

function TierGridSkeleton() {
  return (
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
  )
}

