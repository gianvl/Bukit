import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle2, Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  bookingDetailQueryOptions,
  submitBookingReview,
  type BookingDetail,
} from '@/features/bookings/queries'

/**
 * Customer-facing rating card. Renders three states keyed off the booking:
 *   - Already reviewed → readonly stars + comment
 *   - Not reviewed yet → pickable stars + optional comment + submit
 *   - Submitting → loading state inside the submit button
 *
 * Shown on the booking detail page when status is COMPLETED and the viewer
 * is the customer. Provider's view is intentionally readonly.
 */
interface RatingCardProps {
  booking: BookingDetail
  /** When true, render the readonly variant (provider view of the customer's review). */
  readonly?: boolean
}

export function RatingCard({ booking, readonly = false }: RatingCardProps) {
  const queryClient = useQueryClient()
  const [rating, setRating] = useState<number>(0)
  const [hover, setHover] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () =>
      submitBookingReview(booking.id, {
        rating,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(bookingDetailQueryOptions(booking.id))
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not submit review')
    },
  })

  // Already submitted → show the recorded rating.
  if (booking.myReview) {
    return (
      <Card>
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {readonly ? 'Customer rated you' : 'Your review'}
          </p>
          <CardTitle className="font-display text-xl mt-2 inline-flex items-center gap-3">
            <StarRow value={booking.myReview.rating} />
            <span className="text-base text-muted-foreground tabular-nums">
              {booking.myReview.rating}/5
            </span>
          </CardTitle>
        </CardHeader>
        {booking.myReview.comment && (
          <CardContent>
            <p className="text-sm text-muted-foreground italic">
              “{booking.myReview.comment}”
            </p>
          </CardContent>
        )}
      </Card>
    )
  }

  // Provider viewing an unreviewed booking — quiet placeholder.
  if (readonly) {
    return (
      <Card>
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Customer review
          </p>
          <CardTitle className="text-base text-muted-foreground mt-2">
            Awaiting feedback…
          </CardTitle>
        </CardHeader>
      </Card>
    )
  }

  // Customer, not yet reviewed → input form.
  const display = hover || rating
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <p className="text-xs uppercase tracking-[0.18em] text-primary">
          Rate your provider
        </p>
        <CardTitle className="font-display text-2xl mt-2">
          How was the service?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="flex items-center gap-1.5"
          onMouseLeave={() => setHover(0)}
          role="radiogroup"
          aria-label="Rating"
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= display
            return (
              <motion.button
                key={n}
                type="button"
                role="radio"
                aria-checked={n === rating}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => {
                  setRating(n)
                  setError(null)
                }}
                onMouseEnter={() => setHover(n)}
                whileTap={{ scale: 0.85 }}
                whileHover={{ scale: 1.1 }}
                className="rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star
                  className={cn(
                    'size-9 transition-colors',
                    filled
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-muted-foreground/40',
                  )}
                />
              </motion.button>
            )
          })}
          {display > 0 && (
            <span className="ml-2 text-sm text-muted-foreground tabular-nums">
              {display}/5
            </span>
          )}
        </div>

        <Textarea
          placeholder="Add a comment (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          className="bg-background"
        />

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button
          onClick={() => submit.mutate()}
          disabled={rating === 0 || submit.isPending}
          className="w-full sm:w-auto"
        >
          {submit.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              Submit review
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

function StarRow({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            'size-5',
            n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30',
          )}
        />
      ))}
    </span>
  )
}
