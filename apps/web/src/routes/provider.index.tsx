import { useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Briefcase, CheckCircle2, Loader2 } from 'lucide-react'
import {
  applyAsProvider,
  providerProfileQueryOptions,
} from '@/features/providers/api'
import { getSession, useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { CreamBackground, PageEyebrow, PageStat, PageStats, PageTitle } from '@/components/page-shell'

export const Route = createFileRoute('/provider/')({
  component: ProviderApply,
  beforeLoad: async ({ location }) => {
    const { data } = await getSession()
    if (!data) {
      throw redirect({
        to: '/signin',
        search: { redirect: location.href, as: 'provider' },
      })
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(providerProfileQueryOptions),
})

function ProviderApply() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { refetch: refetchSession } = useSession()
  const { data: profile } = useQuery(providerProfileQueryOptions)

  const [bio, setBio] = useState('')
  const [error, setError] = useState<string | null>(null)

  const apply = useMutation({
    mutationFn: () =>
      applyAsProvider({
        bio: bio.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: providerProfileQueryOptions.queryKey }),
        refetchSession(),
      ])
      navigate({ to: '/provider/dashboard' })
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Application failed')
    },
  })

  // Already a provider — bounce to dashboard.
  if (profile) {
    return (
      <section className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden flex items-center justify-center px-6">
        <CreamBackground />
        <div className="relative max-w-md text-center space-y-5">
          <CheckCircle2 className="size-12 text-primary mx-auto" />
          <PageTitle>
            You're a Bukit <span className="italic font-light text-primary">provider.</span>
          </PageTitle>
          <p className="text-muted-foreground">
            Your profile is set up. Head to the dashboard to manage availability and accept jobs.
          </p>
          <Button asChild size="lg" className="rounded-full px-7 h-12 text-base">
            <Link to="/provider/dashboard">
              Open dashboard
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden">
      <CreamBackground />
      <div className="relative mx-auto max-w-6xl px-6 py-12 lg:py-20 grid lg:grid-cols-[1fr_auto] gap-12 items-center">
        {/* Left — marketing copy (desktop only) */}
        <aside className="hidden lg:block max-w-md">
          <PageEyebrow icon={Briefcase}>Earn with Bukit</PageEyebrow>
          <div className="mt-6">
            <PageTitle accent="own time.">Work on your</PageTitle>
            <p className="mt-6 text-muted-foreground leading-relaxed">
              Accept bookings in your area on your schedule. Cash or online. We handle matching,
              payments, and customer trust.
            </p>
          </div>
          <PageStats className="mt-10">
            <PageStat kpi="80%" label="of every booking" />
            <PageStat kpi="24h" label="KYC review" />
            <PageStat kpi="₱100+" label="per booking" />
          </PageStats>
        </aside>

        {/* Right — application form */}
        <div className="w-full max-w-md mx-auto lg:mx-0 lg:w-[26rem]">
          <div className="rounded-2xl border bg-card/90 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] p-7 sm:p-8">
            <PageEyebrow icon={Briefcase}>Provider application</PageEyebrow>
            <h2 className="mt-3 font-display text-2xl tracking-tight">
              Tell us about you
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Bukit operates across all of Metro Manila. We'll review your application within 24 hours.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setError(null)
                apply.mutate()
              }}
              className="mt-6 space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="bio" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Short bio (optional)
                </Label>
                <Textarea
                  id="bio"
                  placeholder="5 years of professional service experience."
                  rows={4}
                  maxLength={500}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full h-11 rounded-full"
                disabled={apply.isPending}
              >
                {apply.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    Submit application
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
