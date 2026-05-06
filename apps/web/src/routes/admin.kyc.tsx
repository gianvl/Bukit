import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  adminKycQueryOptions,
  reviewKyc,
  type AdminKycSubmission,
} from '@/features/admin/api'
import type { KycStatus } from '@/features/kyc/api'

const FILTERS: { label: string; value: KycStatus | undefined }[] = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'All', value: undefined },
]

export const Route = createFileRoute('/admin/kyc')({
  component: AdminKycPage,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(adminKycQueryOptions('PENDING')),
})

function AdminKycPage() {
  const [filter, setFilter] = useState<KycStatus | undefined>('PENDING')
  const { data: submissions, isPending } = useQuery(adminKycQueryOptions(filter))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">KYC review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve or reject submitted government IDs. Approving lifts the booking and
          accept gates for that user.
        </p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.label}
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            onClick={() => setFilter(f.value)}
            className="rounded-full"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : !submissions || submissions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing in this queue.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {submissions.map((s) => (
            <SubmissionCard key={s.id} submission={s} />
          ))}
        </ul>
      )}
    </div>
  )
}

function SubmissionCard({ submission }: { submission: AdminKycSubmission }) {
  const queryClient = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const review = useMutation({
    mutationFn: (status: 'APPROVED' | 'REJECTED') =>
      reviewKyc(submission.id, {
        status,
        rejectionReason: status === 'REJECTED' ? reason.trim() : undefined,
      }),
    onSuccess: () => {
      // Invalidate every status filter so all queues refresh.
      queryClient.invalidateQueries({ queryKey: ['admin', 'kyc'] })
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not save decision'),
  })

  return (
    <li>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">{submission.user.name}</CardTitle>
              <Badge variant="outline" className="uppercase tracking-wider">
                {submission.user.role}
              </Badge>
              <StatusPill status={submission.status} />
            </div>
            <CardDescription className="mt-1">
              {submission.user.phoneNumber ?? 'no phone on file'} · {submission.govIdType}{' '}
              {submission.govIdNumber}
            </CardDescription>
            <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Clock className="size-3" />
              Submitted{' '}
              {new Date(submission.submittedAt).toLocaleString('en-PH', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <PhotoSlot
            label="Government ID"
            url={`/api${submission.govIdProxyPath}`}
          />
          <PhotoSlot label="Selfie" url={`/api${submission.selfieProxyPath}`} />
        </CardContent>

        {submission.status === 'PENDING' && (
          <CardContent className="border-t pt-4 space-y-3">
            {rejecting ? (
              <>
                <Textarea
                  rows={2}
                  placeholder="Reason for rejection — visible to the user when they resubmit."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (reason.trim().length < 5) {
                        setError('Please write a short reason (5+ chars).')
                        return
                      }
                      setError(null)
                      review.mutate('REJECTED')
                    }}
                    disabled={review.isPending}
                  >
                    {review.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <X className="size-4" />
                    )}
                    Confirm rejection
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRejecting(false)
                      setReason('')
                      setError(null)
                    }}
                    disabled={review.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => review.mutate('APPROVED')}
                  disabled={review.isPending}
                >
                  {review.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setRejecting(true)}
                  disabled={review.isPending}
                >
                  <X className="size-4" />
                  Reject
                </Button>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        )}

        {submission.status === 'REJECTED' && submission.rejectionReason && (
          <CardContent className="border-t pt-4 text-sm text-muted-foreground">
            Rejected: {submission.rejectionReason}
          </CardContent>
        )}
      </Card>
    </li>
  )
}

function PhotoSlot({ label, url }: { label: string; url: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl border overflow-hidden bg-muted/30 group relative"
      >
        <img
          src={url}
          alt={label}
          className="w-full aspect-[4/3] object-cover group-hover:opacity-90 transition-opacity"
          loading="lazy"
        />
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/90 backdrop-blur px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
          <ExternalLink className="size-3" />
          Open full
        </span>
      </a>
    </div>
  )
}

function StatusPill({ status }: { status: KycStatus }) {
  const map: Record<KycStatus, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
    NOT_SUBMITTED: { label: 'Not submitted', cls: 'bg-muted text-muted-foreground', Icon: Clock },
    PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-900', Icon: Clock },
    APPROVED: { label: 'Approved', cls: 'bg-primary/15 text-primary', Icon: Check },
    REJECTED: { label: 'Rejected', cls: 'bg-destructive/15 text-destructive', Icon: X },
  }
  const { label, cls, Icon } = map[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        cls,
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  )
}
