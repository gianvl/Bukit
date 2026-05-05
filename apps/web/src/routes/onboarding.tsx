import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Briefcase, Loader2, ShoppingBag, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getSession } from '@/lib/auth-client'
import { meQueryOptions, submitOnboarding } from '@/features/me/api'
import { ApiError } from '@/lib/api'
import { safeRedirect } from '@/lib/safe-redirect'
import { cn } from '@/lib/utils'
import {
  CreamBackground,
  PageEyebrow,
  PageStat,
  PageStats,
  PageTitle,
} from '@/components/page-shell'

interface OnboardingSearch {
  redirect?: string
  as?: 'customer' | 'provider'
}

export const Route = createFileRoute('/onboarding')({
  component: OnboardingPage,
  validateSearch: (raw: Record<string, unknown>): OnboardingSearch => {
    const out: OnboardingSearch = {}
    const r = safeRedirect(raw.redirect)
    if (r) out.redirect = r
    if (raw.as === 'customer' || raw.as === 'provider') out.as = raw.as
    return out
  },
  beforeLoad: async ({ search, context }) => {
    const { data } = await getSession()
    if (!data) {
      throw redirect({ to: '/signin', search: { redirect: '/onboarding' } })
    }
    const me = await context.queryClient.ensureQueryData(meQueryOptions)
    if (me?.onboardedAt) {
      throw redirect({ to: search.redirect ?? '/' })
    }
  },
})

function OnboardingPage() {
  const { redirect: redirectTo, as } = Route.useSearch()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [role, setRole] = useState<'USER' | 'PROVIDER'>(
    as === 'provider' ? 'PROVIDER' : 'USER',
  )
  const [bio, setBio] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () =>
      submitOnboarding({
        name: name.trim(),
        role,
        bio: role === 'PROVIDER' && bio.trim() ? bio.trim() : undefined,
      }),
    onSuccess: async (me) => {
      await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })
      const defaultPath =
        me.role === 'PROVIDER' ? '/provider/dashboard' : '/services'
      const target = redirectTo ?? defaultPath
      // KYC is required before booking or accepting jobs. Send the user
      // straight there with the post-KYC redirect baked in so they land
      // back where they were headed once approved.
      if (me.kycStatus !== 'APPROVED') {
        const kycUrl = `/kyc?redirect=${encodeURIComponent(target)}`
        window.location.assign(kycUrl)
        return
      }
      window.location.assign(target)
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not save')
    },
  })

  const canSubmit = name.trim().length > 0

  return (
    <section className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden">
      <CreamBackground />
      <div className="relative mx-auto max-w-6xl px-6 py-12 lg:py-20 grid lg:grid-cols-[1fr_auto] gap-12 items-center">
        {/* Side panel — desktop only */}
        <aside className="hidden lg:block max-w-md">
          <PageEyebrow icon={Sparkles}>One last step</PageEyebrow>
          <div className="mt-6">
            <PageTitle accent={role === 'PROVIDER' ? 'earning.' : 'booking.'}>
              {role === 'PROVIDER' ? 'You are minutes away from' : 'You are minutes away from'}
            </PageTitle>
            <p className="mt-6 text-muted-foreground leading-relaxed">
              Tell us your name and how you'd like to use Bukit. Either choice is reversible —
              customers can apply to provide later.
            </p>
          </div>
          <PageStats className="mt-10">
            <PageStat kpi="NCR" label="all of Metro Manila" />
            <PageStat kpi="24h" label="provider review" />
            <PageStat kpi="₱500" label="from / cleaning" />
          </PageStats>
        </aside>

        {/* Form card */}
        <div className="w-full max-w-md mx-auto lg:mx-0 lg:w-[26rem]">
          <div className="rounded-2xl border bg-card/90 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] p-7 sm:p-8">
            <PageEyebrow icon={Sparkles}>Set up your account</PageEyebrow>
            <h2 className="mt-3 font-display text-2xl tracking-tight lg:hidden">
              Welcome to Bukit
            </h2>
            <h2 className="mt-3 font-display text-2xl tracking-tight hidden lg:block">
              Tell us about you
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You can switch later if you change your mind.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                setError(null)
                submit.mutate()
              }}
              className="mt-6 space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Your name
                </Label>
                <Input
                  id="name"
                  autoComplete="name"
                  required
                  placeholder="Maria Santos"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  I'm here to
                </Label>
                <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                  <RoleOption
                    active={role === 'USER'}
                    onPick={() => setRole('USER')}
                    Icon={ShoppingBag}
                    label="Book services"
                    description="Vetted home cleaners on demand or scheduled."
                  />
                  <RoleOption
                    active={role === 'PROVIDER'}
                    onPick={() => setRole('PROVIDER')}
                    Icon={Briefcase}
                    label="Earn as a provider"
                    description="Accept bookings in your area. KYC review within 24h."
                  />
                </div>
              </div>

              {role === 'PROVIDER' && (
                <div className="space-y-2">
                  <Label htmlFor="bio" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Short bio (optional)
                  </Label>
                  <Textarea
                    id="bio"
                    rows={3}
                    maxLength={500}
                    placeholder="5 years of professional residential cleaning."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Bukit operates across all of Metro Manila — you'll see every booking in NCR.
                  </p>
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full h-11 rounded-full"
                disabled={submit.isPending || !canSubmit}
              >
                {submit.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}

function RoleOption({
  active,
  onPick,
  Icon,
  label,
  description,
}: {
  active: boolean
  onPick: () => void
  Icon: typeof ShoppingBag
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
        'rounded-xl border p-4 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'border-primary bg-primary/5'
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
