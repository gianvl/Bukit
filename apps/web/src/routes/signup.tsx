import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { signUp } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { safeRedirect } from '@/lib/safe-redirect'

interface AuthSearch {
  redirect?: string
}

export const Route = createFileRoute('/signup')({
  component: SignUpPage,
  validateSearch: (raw: Record<string, unknown>): AuthSearch => {
    const r = safeRedirect(raw.redirect)
    return r ? { redirect: r } : {}
  },
})

function SignUpPage() {
  const navigate = useNavigate()
  const { redirect } = Route.useSearch()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsPending(true)
    const { error } = await signUp.email({ email, password, name })
    setIsPending(false)
    if (error) {
      setError(error.message ?? 'Sign-up failed')
      return
    }
    if (redirect) {
      window.location.assign(redirect)
    } else {
      navigate({ to: '/' })
    }
  }

  return (
    <section className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Book vetted home services in minutes</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Creating account…' : 'Create account'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have one?{' '}
              <Link
                to="/signin"
                search={redirect ? { redirect } : {}}
                className="text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </section>
  )
}
