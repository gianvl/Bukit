import { useState } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Smartphone,
  Wallet,
} from 'lucide-react'
import { getSession } from '@/lib/auth-client'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PageEyebrow,
  PageHero,
  PageStat,
  PageStats,
  PageTitle,
} from '@/components/page-shell'
import { formatCentavos } from '@/lib/format'
import { providerProfileQueryOptions } from '@/features/providers/api'
import {
  earningsQueryOptions,
  requestPayout,
  upsertPayoutMethod,
  type Earnings,
  type PayoutHistoryEntry,
  type PayoutMethod,
  type PayoutMethodType,
} from '@/features/earnings/api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/provider/earnings')({
  component: EarningsPage,
  beforeLoad: async ({ location }) => {
    const { data } = await getSession()
    if (!data) {
      throw redirect({
        to: '/signin',
        search: { redirect: location.href, as: 'provider' },
      })
    }
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(providerProfileQueryOptions),
      context.queryClient.ensureQueryData(earningsQueryOptions),
    ]),
})

function EarningsPage() {
  const { data: earnings, isPending } = useQuery(earningsQueryOptions)

  if (isPending || !earnings) return <EarningsSkeleton />

  return (
    <>
      <PageHero maxWidth="max-w-5xl">
        <PageEyebrow icon={Wallet}>Earnings</PageEyebrow>
        <div className="mt-6">
          <PageTitle accent="cleared.">Money in,</PageTitle>
        </div>
        <PageStats className="grid-cols-2 sm:grid-cols-4 max-w-3xl">
          <PageStat
            kpi={formatCentavos(earnings.availableCentavos)}
            label="available now"
          />
          <PageStat
            kpi={formatCentavos(earnings.pendingCentavos)}
            label="in cooldown"
          />
          <PageStat
            kpi={formatCentavos(earnings.cashOwedCentavos)}
            label="cash fees owed"
          />
          <PageStat
            kpi={formatCentavos(earnings.paidLifetimeCentavos)}
            label="lifetime paid"
          />
        </PageStats>
      </PageHero>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-8">
        <PayoutMethodCard method={earnings.payoutMethod} />
        <RequestPayoutCard earnings={earnings} />
        <PayoutHistory entries={earnings.history} />
      </section>
    </>
  )
}

/* ─── Payout method card ─────────────────────────────────────────────── */

function PayoutMethodCard({ method }: { method: PayoutMethod | null }) {
  const [editing, setEditing] = useState(method == null)
  if (!editing && method) return <PayoutMethodSummary method={method} onEdit={() => setEditing(true)} />
  return <PayoutMethodForm initial={method} onDone={() => setEditing(false)} />
}

function PayoutMethodSummary({
  method,
  onEdit,
}: {
  method: PayoutMethod
  onEdit: () => void
}) {
  const Icon = method.type === 'GCASH' ? Smartphone : Building2
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Payout destination
          </p>
          <CardTitle className="font-display text-xl mt-2 inline-flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            {method.type === 'GCASH' ? 'GCash' : 'Bank transfer'}
          </CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" />
          Update
        </Button>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="font-medium">{method.holderName}</div>
        <div className="text-muted-foreground tabular-nums">
          {method.accountIdentifierMasked}
          {method.bankCode && (
            <span className="ml-2 text-xs uppercase tracking-wider">
              · {method.bankCode}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PayoutMethodForm({
  initial,
  onDone,
}: {
  initial: PayoutMethod | null
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [type, setType] = useState<PayoutMethodType>(initial?.type ?? 'GCASH')
  const [holderName, setHolderName] = useState(initial?.holderName ?? '')
  const [accountIdentifier, setAccountIdentifier] = useState('')
  const [bankCode, setBankCode] = useState(initial?.bankCode ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      upsertPayoutMethod({
        type,
        holderName: holderName.trim(),
        accountIdentifier: accountIdentifier.trim(),
        bankCode: type === 'BANK' ? bankCode.trim() || undefined : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: earningsQueryOptions.queryKey })
      onDone()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not save payout method')
    },
  })

  const canSubmit =
    holderName.trim().length >= 2 &&
    accountIdentifier.trim().length >= 4 &&
    (type !== 'BANK' || bankCode.trim().length >= 2)

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <p className="text-xs uppercase tracking-[0.18em] text-primary">
          {initial ? 'Update payout destination' : 'Add a payout destination'}
        </p>
        <CardTitle className="font-display text-xl mt-2">Where should we send your earnings?</CardTitle>
        <CardDescription>
          You'll only be able to accept bookings once a destination is on file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <TypeOption
            active={type === 'GCASH'}
            onPick={() => setType('GCASH')}
            Icon={Smartphone}
            label="GCash"
            description="Mobile wallet — fastest disbursement."
          />
          <TypeOption
            active={type === 'BANK'}
            onPick={() => setType('BANK')}
            Icon={Building2}
            label="Bank account"
            description="BDO, BPI, UnionBank, etc."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="holderName">Account holder's name</Label>
          <Input
            id="holderName"
            placeholder="As it appears on the account"
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            autoComplete="name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="accountIdentifier">
            {type === 'GCASH' ? 'GCash mobile number' : 'Account number'}
          </Label>
          <Input
            id="accountIdentifier"
            placeholder={type === 'GCASH' ? '09171234567' : '0012345678901'}
            value={accountIdentifier}
            onChange={(e) => setAccountIdentifier(e.target.value)}
            inputMode="numeric"
          />
          {initial && (
            <p className="text-xs text-muted-foreground">
              For your safety we don't show the previous number — re-enter it to keep it.
            </p>
          )}
        </div>

        {type === 'BANK' && (
          <div className="space-y-2">
            <Label htmlFor="bankCode">Bank code</Label>
            <Input
              id="bankCode"
              placeholder="BDO, BPI, UBP, …"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value.toUpperCase())}
              maxLength={20}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={!canSubmit || save.isPending}>
            {save.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Save destination
              </>
            )}
          </Button>
          {initial && (
            <Button variant="ghost" onClick={onDone} disabled={save.isPending}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function TypeOption({
  active,
  onPick,
  Icon,
  label,
  description,
}: {
  active: boolean
  onPick: () => void
  Icon: typeof Smartphone
  label: string
  description: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onPick}
      className={cn(
        'rounded-xl border p-4 text-left transition-colors bg-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'border-primary ring-1 ring-primary/30'
          : 'border-border hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      <div className="flex items-center justify-between">
        <Icon className={cn('size-4', active ? 'text-primary' : 'text-muted-foreground')} />
        {active && <span className="size-2 rounded-full bg-primary" aria-hidden />}
      </div>
      <div className="mt-3 text-sm font-medium">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</div>
    </button>
  )
}

/* ─── Request payout ─────────────────────────────────────────────────── */

function RequestPayoutCard({ earnings }: { earnings: Earnings }) {
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<string | null>(null)

  const request = useMutation({
    mutationFn: requestPayout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: earningsQueryOptions.queryKey })
      setFeedback('Payout requested — your funds will land within 24h.')
    },
    onError: (err) => {
      setFeedback(err instanceof ApiError ? err.message : 'Could not request payout')
    },
  })

  const canRequest =
    earnings.payoutMethod != null && earnings.availableCentavos >= earnings.minPayoutCentavos

  return (
    <Card>
      <CardHeader>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Disbursement</p>
        <CardTitle className="font-display text-xl mt-2 inline-flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Banknote className="size-4" />
          </span>
          Cash out your balance
        </CardTitle>
        <CardDescription>
          Minimum {formatCentavos(earnings.minPayoutCentavos)} per payout. Cash bookings'
          5% platform fee is netted out automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            Available now
          </div>
          {/* Clamp the headline at zero — a negative balance happens when
              cash-fee debits outweigh eligible earnings, which would look
              broken as the primary KPI. The breakdown lines below explain
              the full state. */}
          <div className="font-display text-3xl tabular-nums tracking-tight mt-1">
            {formatCentavos(Math.max(0, earnings.availableCentavos))}
          </div>
          {/* Cooldown breakdown — surface the just-completed online jobs
              so the provider sees their earnings registered, even if
              they're not yet eligible for cash-out. */}
          {earnings.pendingCentavos - earnings.availableCentavos > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              +{formatCentavos(earnings.pendingCentavos - earnings.availableCentavos)}{' '}
              unlocking after the 24h cooldown
            </div>
          )}
          {earnings.cashOwedCentavos > 0 && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              −{formatCentavos(earnings.cashOwedCentavos)} cash fees will deduct
              from your next payout
            </div>
          )}
          {feedback && (
            <p
              className={cn(
                'text-xs mt-2',
                request.isError ? 'text-destructive' : 'text-primary',
              )}
            >
              {feedback}
            </p>
          )}
        </div>
        <Button
          size="lg"
          className="rounded-full px-6"
          disabled={!canRequest || request.isPending}
          onClick={() => request.mutate()}
        >
          {request.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Requesting…
            </>
          ) : (
            <>
              Request payout
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

/* ─── History ────────────────────────────────────────────────────────── */

function PayoutHistory({ entries }: { entries: PayoutHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Earnings history</CardTitle>
          <CardDescription>
            Your completed jobs will appear here as soon as they're paid out.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Earnings history</CardTitle>
        <CardDescription>The 30 most recent payouts.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {entries.map((p) => (
          <PayoutRow key={p.id} payout={p} />
        ))}
      </CardContent>
    </Card>
  )
}

function PayoutRow({ payout }: { payout: PayoutHistoryEntry }) {
  const isCashFee = payout.netCentavos < 0
  const inCooldown = payout.status === 'PENDING' && new Date(payout.eligibleAt) > new Date()
  return (
    <Link
      to="/bookings/$id"
      params={{ id: payout.bookingId }}
      className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0 hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{payout.booking.serviceTierName}</div>
        <div className="mt-0.5 text-xs text-muted-foreground inline-flex items-center gap-2">
          {new Date(payout.booking.scheduledAt).toLocaleString('en-PH', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
          {payout.booking.paymentMethod === 'CASH' ? (
            <Badge variant="outline" className="gap-1 text-[10px] py-0">
              <Banknote className="size-3" />
              Cash
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[10px] py-0">
              Online
            </Badge>
          )}
        </div>
        <PayoutStatusLine
          status={payout.status}
          inCooldown={inCooldown}
          eligibleAt={payout.eligibleAt}
          paidAt={payout.paidAt}
          referenceCode={payout.referenceCode}
        />
      </div>
      <div className="text-right shrink-0">
        <div
          className={cn(
            'font-display text-lg tabular-nums',
            isCashFee && 'text-destructive',
          )}
        >
          {isCashFee ? '−' : '+'}
          {formatCentavos(Math.abs(payout.netCentavos))}
        </div>
        {payout.feeCentavos > 0 && !isCashFee && (
          <div className="text-[11px] text-muted-foreground tabular-nums">
            5% fee {formatCentavos(payout.feeCentavos)}
          </div>
        )}
      </div>
    </Link>
  )
}

function PayoutStatusLine({
  status,
  inCooldown,
  eligibleAt,
  paidAt,
  referenceCode,
}: {
  status: 'PENDING' | 'PAID' | 'VOID'
  inCooldown: boolean
  eligibleAt: string
  paidAt: string | null
  referenceCode: string | null
}) {
  if (status === 'PAID') {
    return (
      <div className="mt-1 text-xs text-primary inline-flex items-center gap-1.5">
        <CheckCircle2 className="size-3" />
        Paid {paidAt && `· ${new Date(paidAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
        {referenceCode && (
          <span className="text-muted-foreground">· ref {referenceCode}</span>
        )}
      </div>
    )
  }
  if (status === 'VOID') {
    return (
      <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <AlertCircle className="size-3" />
        Voided
      </div>
    )
  }
  return (
    <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1.5">
      <Clock className="size-3" />
      {inCooldown
        ? `Eligible ${new Date(eligibleAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
        : 'Awaiting disbursement'}
    </div>
  )
}

function EarningsSkeleton() {
  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </section>
  )
}
