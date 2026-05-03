import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { serviceTiersQueryOptions, type ServiceTier } from '@/features/service-tiers/queries'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCentavos, formatDuration } from '@/lib/format'

export const Route = createFileRoute('/services')({
  component: ServicesPage,
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceTiersQueryOptions),
})

function ServicesPage() {
  const { data: tiers, isPending, error } = useQuery(serviceTiersQueryOptions)

  return (
    <section className="mx-auto max-w-4xl px-6 py-12">
      <div className="space-y-2 mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Pick a cleaning tier</h1>
        <p className="text-muted-foreground">
          Flat rates. No surprises. Add-ons available at booking time.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          Couldn't load services. Please try again.
        </p>
      ) : isPending ? (
        <TierGridSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tiers?.map((tier) => <TierCard key={tier.id} tier={tier} />)}
        </div>
      )}
    </section>
  )
}

function TierCard({ tier }: { tier: ServiceTier }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle>{tier.name}</CardTitle>
        <CardDescription>{tier.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">
            {formatCentavos(tier.basePriceCentavos)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
            <Clock className="size-3" />
            {formatDuration(tier.estimatedMinutes)}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link to="/book/$tierSlug" params={{ tierSlug: tier.slug }}>
            Book {tier.name}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

function TierGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
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
