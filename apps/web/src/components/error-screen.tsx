import { Link } from '@tanstack/react-router'
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

export function ErrorScreen({ error, reset }: { error: unknown; reset?: () => void }) {
  const offline = error instanceof ApiError && error.code === 'NETWORK_OFFLINE'

  return (
    <section className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {offline ? <CloudOff className="size-6" /> : <TriangleAlert className="size-6" />}
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-3xl tracking-tight">
            {offline ? "Can't reach Bukit right now" : 'Something went wrong'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {offline
              ? 'Check your connection and try again. If you are running locally, make sure the API server is up.'
              : error instanceof Error
                ? error.message
                : 'An unexpected error occurred.'}
          </p>
        </div>
        <div className="flex justify-center gap-3">
          {reset && (
            <Button onClick={reset}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/">Back home</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
