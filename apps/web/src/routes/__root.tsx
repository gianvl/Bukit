import { Link, Outlet, createRootRouteWithContext, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorScreen } from '@/components/error-screen'
import { signOut, useSession } from '@/lib/auth-client'
import { disconnectSocket } from '@/lib/socket'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: ({ error, reset }) => (
    <RootLayoutShell>
      <ErrorScreen error={error} reset={reset} />
    </RootLayoutShell>
  ),
})

function RootLayout() {
  return (
    <RootLayoutShell>
      <Outlet />
    </RootLayoutShell>
  )
}

function RootLayoutShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { data: session, isPending } = useSession()

  async function handleSignOut() {
    await signOut()
    disconnectSocket()
    router.invalidate()
    router.navigate({ to: '/' })
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-14">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" />
            Bukit
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Button asChild variant="ghost" size="sm">
              <Link to="/services">Book</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/provider">Provider</Link>
            </Button>
            {!isPending && session?.user ? (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/bookings">My bookings</Link>
                </Button>
                <span className="hidden sm:inline text-xs text-muted-foreground px-2">
                  {session.user.name}
                </span>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  Sign out
                </Button>
              </>
            ) : !isPending ? (
              <Button asChild size="sm">
                <Link to="/signin">Sign in</Link>
              </Button>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </div>
  )
}

function NotFound() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-sm text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <Button asChild>
          <Link to="/">Back home</Link>
        </Button>
      </div>
    </main>
  )
}
