import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
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
              <Link to="/book">Book</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/provider">Provider</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

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
