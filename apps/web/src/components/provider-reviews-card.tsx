import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Star } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { myReviewsQueryOptions, type MyReview } from '@/features/me/api'
import { cn } from '@/lib/utils'

/**
 * Customer feedback for the signed-in provider. Mounted on the provider
 * dashboard. Empty state for new providers, otherwise shows the average,
 * count, and the 5 most recent reviews. Each row links to the booking
 * so the provider can see context.
 */
export function ProviderReviewsCard() {
  const { data, isPending } = useQuery(myReviewsQueryOptions)

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const top = data.reviews.slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Customer feedback
        </p>
        <CardTitle className="font-display text-2xl mt-2 inline-flex items-center gap-3">
          {data.ratingCount > 0 ? (
            <>
              <StarRow value={Math.round(data.ratingAvg)} />
              <span className="tabular-nums">{data.ratingAvg.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground font-normal">
                · {data.ratingCount} review{data.ratingCount === 1 ? '' : 's'}
              </span>
            </>
          ) : (
            <>
              <Star className="size-5 text-muted-foreground/50" />
              <span className="text-base text-muted-foreground font-normal">
                No ratings yet
              </span>
            </>
          )}
        </CardTitle>
        {data.ratingCount === 0 && (
          <CardDescription>
            Customers can rate you after a booking is completed. You'll see their
            feedback here.
          </CardDescription>
        )}
      </CardHeader>
      {top.length > 0 && (
        <CardContent className="divide-y">
          {top.map((r) => (
            <ReviewRow key={r.id} review={r} />
          ))}
          {data.reviews.length > top.length && (
            <p className="pt-3 pb-0 text-xs text-muted-foreground">
              Showing the {top.length} most recent of {data.ratingCount}.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function ReviewRow({ review }: { review: MyReview }) {
  return (
    <Link
      to="/bookings/$id"
      params={{ id: review.bookingId }}
      className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0 hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StarRow value={review.rating} small />
          <span className="text-xs text-muted-foreground tabular-nums">
            {review.rating}/5
          </span>
        </div>
        {review.comment ? (
          <p className="mt-1 text-sm italic text-muted-foreground line-clamp-2">
            “{review.comment}”
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground/70">No comment.</p>
        )}
        <div className="mt-1 text-xs text-muted-foreground">
          {review.customerName} · {review.serviceTierName} ·{' '}
          {new Date(review.createdAt).toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1" />
    </Link>
  )
}

function StarRow({ value, small }: { value: number; small?: boolean }) {
  const size = small ? 'size-3.5' : 'size-5'
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            size,
            n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30',
          )}
        />
      ))}
    </span>
  )
}
