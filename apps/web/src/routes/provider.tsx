import { useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import {
  applyAsProvider,
  providerProfileQueryOptions,
} from '@/features/providers/api'
import { getSession, useSession } from '@/lib/auth-client'
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
import { ApiError } from '@/lib/api'

export const Route = createFileRoute('/provider')({
  component: ProviderApply,
  beforeLoad: async ({ location }) => {
    const { data } = await getSession()
    if (!data) throw redirect({ to: '/signin', search: { redirect: location.href } })
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(providerProfileQueryOptions),
})

function ProviderApply() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { refetch: refetchSession } = useSession()
  const { data: profile } = useQuery(providerProfileQueryOptions)

  const [bio, setBio] = useState('')
  const [citiesText, setCitiesText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const apply = useMutation({
    mutationFn: () =>
      applyAsProvider({
        bio: bio.trim() || undefined,
        cities: citiesText
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
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
      <section className="mx-auto max-w-md px-6 py-16 text-center space-y-4">
        <CheckCircle2 className="size-10 text-primary mx-auto" />
        <h1 className="text-2xl font-semibold">You're a Bukit provider</h1>
        <Button asChild>
          <Link to="/provider/dashboard">Go to dashboard</Link>
        </Button>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-6 space-y-1">
        <p className="text-sm text-muted-foreground">For service providers</p>
        <h1 className="text-3xl font-semibold tracking-tight">Earn with Bukit</h1>
        <p className="text-muted-foreground">
          Apply to join. After a quick KYC review you'll start receiving booking requests in
          your area.
        </p>
      </header>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            apply.mutate()
          }}
        >
          <CardHeader>
            <CardTitle>Provider application</CardTitle>
            <CardDescription>
              Tell us where you work and a bit about your experience.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cities">Cities you serve</Label>
              <Input
                id="cities"
                placeholder="Taguig, Makati, Pasig"
                value={citiesText}
                onChange={(e) => setCitiesText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Comma-separated.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Short bio (optional)</Label>
              <Textarea
                id="bio"
                placeholder="5 years of professional residential cleaning."
                rows={4}
                maxLength={500}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={apply.isPending}>
              {apply.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit application'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </section>
  )
}
