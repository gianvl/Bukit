import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * /admin has no landing page — bounce straight into the services console
 * (the most common admin task). The layout's auth guard runs first so
 * unauthenticated and non-admin users are deflected before this redirect.
 */
export const Route = createFileRoute('/admin/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/services' })
  },
})
