import { Link, Outlet, createRootRouteWithContext, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorScreen } from '@/components/error-screen'
import { NotificationModal } from '@/components/notification-modal'
import { Toaster } from '@/components/ui/sonner'
import { signOut, useSession } from '@/lib/auth-client'
import { disconnectSocket } from '@/lib/socket'
import { meQueryOptions } from '@/features/me/api'

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
  const queryClient = useQueryClient()
  const { data: session, isPending } = useSession()
  // Drives role-aware header. Anonymous users get null; signed-in non-onboarded
  // users still get the name they entered, so we don't flash an empty header.
  const { data: me } = useQuery({
    ...meQueryOptions,
    enabled: !!session?.user,
  })

  async function handleSignOut() {
    await signOut()
    disconnectSocket()
    queryClient.removeQueries({ queryKey: meQueryOptions.queryKey })
    router.invalidate()
    router.navigate({ to: '/' })
  }

  const isProvider = me?.role === 'PROVIDER'
  const displayName = me?.name ?? session?.user.name

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-14">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" />
            Bukit
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {/* Anyone can book (providers can be customers too). */}
            <Button asChild variant="ghost" size="sm">
              <Link to="/services">Book</Link>
            </Button>
            {!isPending && session?.user ? (
              <>
                {isProvider && (
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/provider/dashboard">Dashboard</Link>
                  </Button>
                )}
                <Button asChild variant="ghost" size="sm">
                  <Link to="/bookings">My bookings</Link>
                </Button>
                <span className="hidden sm:inline text-xs text-muted-foreground px-2">
                  {displayName}
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

      <NotificationModal />
      <Toaster richColors position="top-right" />
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
