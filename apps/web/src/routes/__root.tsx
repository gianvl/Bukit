import { useState } from 'react'
import { Link, Outlet, createRootRouteWithContext, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Menu, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorScreen } from '@/components/error-screen'
import { NotificationModal } from '@/components/notification-modal'
import { Toaster } from '@/components/ui/sonner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
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
  const { data: me } = useQuery({
    ...meQueryOptions,
    enabled: !!session?.user,
  })

  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    setMobileOpen(false)
    await signOut()
    disconnectSocket()
    queryClient.removeQueries({ queryKey: meQueryOptions.queryKey })
    router.invalidate()
    router.navigate({ to: '/' })
  }

  const isProvider = me?.role === 'PROVIDER'
  const displayName = me?.name ?? session?.user.name
  const signedIn = !isPending && !!session?.user
  const showAnon = !isPending && !session?.user

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 sm:px-6 h-14">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" />
            Bukit
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-2 text-sm">
            <Button asChild variant="ghost" size="sm">
              <Link to="/services">Book</Link>
            </Button>
            {signedIn && (
              <>
                {isProvider && (
                  <>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/provider/dashboard">Dashboard</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/provider/earnings">Earnings</Link>
                    </Button>
                  </>
                )}
                <Button asChild variant="ghost" size="sm">
                  <Link to="/bookings">My bookings</Link>
                </Button>
                <span className="hidden md:inline text-xs text-muted-foreground px-2">
                  {displayName}
                </span>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  Sign out
                </Button>
              </>
            )}
            {showAnon && (
              <Button asChild size="sm">
                <Link to="/signin">Sign in</Link>
              </Button>
            )}
          </nav>

          {/* Mobile burger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm p-0">
              <SheetHeader className="px-6 pt-6 pb-2 text-left">
                <SheetTitle className="font-display text-xl tracking-tight">
                  {signedIn ? `Hello, ${displayName?.split(' ')[0] ?? 'there'}` : 'Bukit'}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {signedIn
                    ? isProvider
                      ? 'Manage your jobs and bookings'
                      : 'Your bookings, in one tap'
                    : 'Vetted home services in Manila'}
                </SheetDescription>
              </SheetHeader>

              <nav className="flex flex-col px-3 py-4 gap-1">
                <MobileLink to="/services" onSelect={() => setMobileOpen(false)}>
                  Book a service
                </MobileLink>
                {signedIn && (
                  <>
                    {isProvider && (
                      <>
                        <MobileLink
                          to="/provider/dashboard"
                          onSelect={() => setMobileOpen(false)}
                        >
                          Provider dashboard
                        </MobileLink>
                        <MobileLink
                          to="/provider/earnings"
                          onSelect={() => setMobileOpen(false)}
                        >
                          Earnings
                        </MobileLink>
                      </>
                    )}
                    <MobileLink to="/bookings" onSelect={() => setMobileOpen(false)}>
                      My bookings
                    </MobileLink>
                  </>
                )}
              </nav>

              <div className="mt-auto border-t px-6 py-4">
                {signedIn ? (
                  <Button
                    variant="outline"
                    className="w-full rounded-full"
                    onClick={handleSignOut}
                  >
                    Sign out
                  </Button>
                ) : (
                  <Button asChild className="w-full rounded-full">
                    <Link to="/signin" onClick={() => setMobileOpen(false)}>
                      Sign in
                    </Link>
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <NotificationModal />
      <Toaster richColors position="top-right" />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </div>
  )
}

function MobileLink({
  to,
  children,
  onSelect,
}: {
  to: '/services' | '/bookings' | '/provider/dashboard' | '/provider/earnings'
  children: ReactNode
  onSelect: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onSelect}
      className="rounded-lg px-3 py-3 text-base hover:bg-muted/50 transition-colors"
    >
      {children}
    </Link>
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
