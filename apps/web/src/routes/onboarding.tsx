import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Briefcase, Loader2, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getSession } from '@/lib/auth-client'
import { meQueryOptions, submitOnboarding } from '@/features/me/api'
import { ApiError } from '@/lib/api'
import { safeRedirect } from '@/lib/safe-redirect'
import { cn } from '@/lib/utils'

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
      // Already onboarded — nothing to do here.
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
  const [citiesText, setCitiesText] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () =>
      submitOnboarding({
        name: name.trim(),
        role,
        cities:
          role === 'PROVIDER'
            ? citiesText.split(',').map((c) => c.trim()).filter(Boolean)
            : undefined,
        bio: role === 'PROVIDER' && bio.trim() ? bio.trim() : undefined,
      }),
    onSuccess: async (me) => {
      await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })
      // Role-aware default destination.
      const defaultPath =
        me.role === 'PROVIDER' ? '/provider/dashboard' : '/services'
      window.location.assign(redirectTo ?? defaultPath)
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not save')
    },
  })

  const canSubmit =
    name.trim().length > 0 &&
    (role !== 'PROVIDER' || citiesText.split(',').some((c) => c.trim().length > 0))

  return (
    <section className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            One last step
          </p>
          <CardTitle className="font-display text-2xl mt-2">
            Set up your Bukit account
          </CardTitle>
          <CardDescription>
            Tell us your name and how you'd like to use Bukit. You can switch later.
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            submit.mutate()
          }}
        >
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
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
                  value="USER"
                  active={role === 'USER'}
                  onPick={() => setRole('USER')}
                  Icon={ShoppingBag}
                  label="Book services"
                  description="Get vetted home cleaners on demand or scheduled."
                />
                <RoleOption
                  value="PROVIDER"
                  active={role === 'PROVIDER'}
                  onPick={() => setRole('PROVIDER')}
                  Icon={Briefcase}
                  label="Earn as a provider"
                  description="Accept bookings in your area. Verification within 24h."
                />
              </div>
            </div>

            {role === 'PROVIDER' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cities">Cities you serve</Label>
                  <Input
                    id="cities"
                    placeholder="Taguig, Makati, Pasig"
                    required
                    value={citiesText}
                    onChange={(e) => setCitiesText(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Short bio (optional)</Label>
                  <Textarea
                    id="bio"
                    rows={3}
                    maxLength={500}
                    placeholder="5 years of professional residential cleaning."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  />
                </div>
              </>
            )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter>
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
          </CardFooter>
        </form>
      </Card>
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
  value: 'USER' | 'PROVIDER'
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
