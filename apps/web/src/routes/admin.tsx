import { Link, Outlet, createFileRoute, redirect, useLocation } from '@tanstack/react-router'
import { Layers, ShieldCheck } from 'lucide-react'
import { getSession } from '@/lib/auth-client'
import { meQueryOptions } from '@/features/me/api'
import { cn } from '@/lib/utils'

/**
 * Admin shell: gated by role=ADMIN, hosts a small left sidebar and an
 * Outlet for child routes (services, kyc, …). Everything under /admin/*
 * lives inside this layout.
 *
 * Auth flow: redirect anonymous users to /signin, redirect non-admins to
 * the home page (don't expose the existence of admin routes).
 */
export const Route = createFileRoute('/admin')({
  component: AdminLayout,
  beforeLoad: async ({ context, location }) => {
    const { data } = await getSession()
    if (!data) {
      throw redirect({ to: '/signin', search: { redirect: location.href } })
    }
    const me = await context.queryClient.ensureQueryData(meQueryOptions)
    if (!me || me.role !== 'ADMIN') {
      throw redirect({ to: '/' })
    }
  },
})

interface AdminNavItem {
  to: '/admin/services' | '/admin/kyc'
  label: string
  icon: typeof Layers
}

const NAV: AdminNavItem[] = [
  { to: '/admin/services', label: 'Services', icon: Layers },
  { to: '/admin/kyc', label: 'KYC review', icon: ShieldCheck },
]

function AdminLayout() {
  const { pathname } = useLocation()
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 grid gap-6 lg:grid-cols-[14rem_1fr]">
      <aside className="lg:sticky lg:top-20 self-start">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
          Admin console
        </p>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`)
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors whitespace-nowrap',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground/80 hover:bg-muted/50',
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <main className="min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
