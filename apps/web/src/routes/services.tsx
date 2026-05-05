import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout-only route for /services/*. The actual list page lives in
 * `services.index.tsx`; the detail page in `services.$serviceSlug.tsx`.
 *
 * Without this Outlet, TanStack would treat services.tsx's content as a
 * parent that wraps every child route — so the tile grid would render
 * on top of /services/$serviceSlug detail pages.
 */
export const Route = createFileRoute('/services')({
  component: ServicesLayout,
})

function ServicesLayout() {
  return <Outlet />
}
