import { useState } from 'react'
import { createFileRoute, redirect, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  IdCard,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageEyebrow, PageHero, PageTitle } from '@/components/page-shell'
import { getSession } from '@/lib/auth-client'
import { ApiError } from '@/lib/api'
import { meQueryOptions } from '@/features/me/api'
import {
  kycMeQueryOptions,
  submitKyc,
  uploadKycFile,
  type KycMe,
} from '@/features/kyc/api'
import { safeRedirect } from '@/lib/safe-redirect'
import { cn } from '@/lib/utils'

interface KycSearch {
  redirect?: string
}

export const Route = createFileRoute('/kyc')({
  component: KycPage,
  validateSearch: (raw: Record<string, unknown>): KycSearch => {
    const out: KycSearch = {}
    const r = safeRedirect(raw.redirect)
    if (r) out.redirect = r
    return out
  },
  beforeLoad: async ({ location }) => {
    const { data } = await getSession()
    if (!data) {
      throw redirect({ to: '/signin', search: { redirect: location.href } })
    }
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(kycMeQueryOptions),
      context.queryClient.ensureQueryData(meQueryOptions),
    ]),
})

const ID_TYPES = [
  'PhilSys (National ID)',
  "Driver's License",
  'Passport',
  'UMID',
  'SSS ID',
  'PRC ID',
  'Postal ID',
  'Voter\'s ID',
] as const

function KycPage() {
  const { data: kyc } = useQuery(kycMeQueryOptions)
  const { data: me } = useQuery(meQueryOptions)
  const navigate = useNavigate()
  const search = useSearch({ from: '/kyc' })

  if (!kyc || !me) return <KycSkeleton />

  // Already approved → bounce out (or to the redirect target if one was set).
  if (kyc.status === 'APPROVED') {
    return (
      <ApprovedPanel
        onContinue={() => navigate({ to: search.redirect ?? '/' })}
      />
    )
  }

  // Pending review — show the waiting state.
  if (kyc.status === 'PENDING') {
    return <PendingPanel kyc={kyc} />
  }

  // Not yet submitted, or rejected: show the form.
  return <SubmissionForm kyc={kyc} userId={me.id} redirectTarget={search.redirect ?? '/'} />
}

/* ─── States ────────────────────────────────────────────────────────── */

function ApprovedPanel({ onContinue }: { onContinue: () => void }) {
  return (
    <PageHero maxWidth="max-w-2xl">
      <PageEyebrow icon={ShieldCheck}>Verification</PageEyebrow>
      <div className="mt-6">
        <PageTitle accent="approved.">You're</PageTitle>
      </div>
      <p className="mt-6 text-muted-foreground leading-relaxed">
        Your identity has been verified. Bookings, accepts, and payouts are unlocked.
      </p>
      <Button onClick={onContinue} className="mt-8 rounded-full px-6 h-12">
        Continue
      </Button>
    </PageHero>
  )
}

function PendingPanel({ kyc }: { kyc: KycMe }) {
  return (
    <PageHero maxWidth="max-w-2xl">
      <PageEyebrow icon={Clock}>Verification</PageEyebrow>
      <div className="mt-6">
        <PageTitle accent="under review.">Your documents are</PageTitle>
      </div>
      <p className="mt-6 text-muted-foreground leading-relaxed">
        Our team typically reviews submissions within 24 hours. We'll notify you the
        moment a decision is made — there's nothing for you to do right now.
      </p>
      <div className="mt-8 rounded-xl border bg-card/50 p-5 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <IdCard className="size-4" />
          {kyc.govIdType} · {maskId(kyc.govIdNumber ?? '')}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="size-4" />
          Submitted{' '}
          {kyc.submittedAt
            ? new Date(kyc.submittedAt).toLocaleString('en-PH', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            : '—'}
        </div>
      </div>
    </PageHero>
  )
}

function SubmissionForm({
  kyc,
  userId,
  redirectTarget,
}: {
  kyc: KycMe
  userId: string
  redirectTarget: string
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [govIdType, setGovIdType] = useState<string>(
    kyc.govIdType ?? ID_TYPES[0],
  )
  const [govIdNumber, setGovIdNumber] = useState(kyc.govIdNumber ?? '')
  const [govIdFile, setGovIdFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'submitting'>('idle')
  const [error, setError] = useState<string | null>(null)

  const isResubmit = kyc.status === 'REJECTED'

  const submit = useMutation({
    mutationFn: async () => {
      if (!govIdFile || !selfieFile) {
        throw new Error('Please attach both photos.')
      }
      setPhase('uploading')
      // Upload both files in parallel — they're sandboxed to this user's
      // own folder by the server-side token policy.
      const [govIdImageUrl, selfieUrl] = await Promise.all([
        uploadKycFile(govIdFile, 'gov-id', userId),
        uploadKycFile(selfieFile, 'selfie', userId),
      ])
      setPhase('submitting')
      return submitKyc({
        govIdType,
        govIdNumber: govIdNumber.trim(),
        govIdImageUrl,
        selfieUrl,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: kycMeQueryOptions.queryKey })
      await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })
      setPhase('idle')
    },
    onError: (err) => {
      setPhase('idle')
      setError(err instanceof ApiError ? err.message : (err as Error).message)
    },
  })

  const canSubmit =
    govIdType.trim().length > 0 &&
    govIdNumber.trim().length >= 2 &&
    govIdFile != null &&
    selfieFile != null &&
    phase === 'idle'

  return (
    <>
      <PageHero maxWidth="max-w-3xl">
        <PageEyebrow icon={ShieldCheck}>Verification</PageEyebrow>
        <div className="mt-6">
          <PageTitle accent={isResubmit ? 'resubmit.' : 'verify.'}>
            {isResubmit ? 'A small fix and' : "Let's"}
          </PageTitle>
        </div>
        <p className="mt-6 text-muted-foreground leading-relaxed max-w-xl">
          We need one government-issued ID and a selfie to keep Bukit safe for
          everyone. Your photos are stored privately and only seen by our review team.
        </p>
      </PageHero>

      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-10 space-y-6">
        {isResubmit && kyc.rejectionReason && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base inline-flex items-center gap-2">
                <AlertCircle className="size-4 text-destructive" />
                Previous submission rejected
              </CardTitle>
              <CardDescription>{kyc.rejectionReason}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Government ID</CardTitle>
            <CardDescription>
              Pick the ID type and enter the number exactly as it appears.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="govIdType">ID type</Label>
              <select
                id="govIdType"
                value={govIdType}
                onChange={(e) => setGovIdType(e.target.value)}
                className={cn(
                  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                {ID_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="govIdNumber">ID number</Label>
              <Input
                id="govIdNumber"
                placeholder="As printed on the card"
                value={govIdNumber}
                onChange={(e) => setGovIdNumber(e.target.value)}
                autoComplete="off"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Photos</CardTitle>
            <CardDescription>
              Make sure the ID is well-lit and all four corners are visible. The
              selfie should clearly show your face.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FileSlot
              label="Photo of your ID"
              icon={IdCard}
              file={govIdFile}
              onChange={setGovIdFile}
              hint="JPG / PNG, up to 8 MB"
            />
            <FileSlot
              label="Selfie"
              icon={ImageIcon}
              file={selfieFile}
              onChange={setSelfieFile}
              hint="Face the camera, no sunglasses"
            />
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive" role="alert">
              {error}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button
            variant="ghost"
            onClick={() => navigate({ to: redirectTarget })}
            disabled={phase !== 'idle'}
          >
            I'll do this later
          </Button>
          <Button
            size="lg"
            className="rounded-full px-7 h-12 text-base"
            disabled={!canSubmit}
            onClick={() => {
              setError(null)
              submit.mutate()
            }}
          >
            {phase === 'uploading' && (
              <>
                <Loader2 className="size-4 animate-spin" />
                Uploading photos…
              </>
            )}
            {phase === 'submitting' && (
              <>
                <Loader2 className="size-4 animate-spin" />
                Submitting…
              </>
            )}
            {phase === 'idle' && (
              <>
                <CheckCircle2 className="size-4" />
                {isResubmit ? 'Resubmit for review' : 'Submit for review'}
              </>
            )}
          </Button>
        </div>
      </section>
    </>
  )
}

function FileSlot({
  label,
  icon: Icon,
  file,
  onChange,
  hint,
}: {
  label: string
  icon: typeof IdCard
  file: File | null
  onChange: (f: File | null) => void
  hint: string
}) {
  const inputId = `file-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {file ? (
        <div className="rounded-xl border bg-muted/30 p-4 flex items-center gap-3">
          <Icon className="size-5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            className="shrink-0"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border',
            'h-32 cursor-pointer hover:border-primary/40 hover:bg-muted/40 transition-colors',
          )}
        >
          <Upload className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">Choose a photo</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

function maskId(num: string): string {
  if (num.length <= 4) return '••••'
  return `•••• ${num.slice(-4)}`
}

function KycSkeleton() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </section>
  )
}
