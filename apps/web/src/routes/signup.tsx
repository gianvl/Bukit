import { createFileRoute, redirect } from '@tanstack/react-router'
import { safeRedirect } from '@/lib/safe-redirect'

interface AuthSearch {
  redirect?: string
}

// Phone OTP unifies sign-in and sign-up. /signup is preserved as a friendly
// redirect so existing bookmarks and external links keep working.
export const Route = createFileRoute('/signup')({
  validateSearch: (raw: Record<string, unknown>): AuthSearch => {
    const r = safeRedirect(raw.redirect)
    return r ? { redirect: r } : {}
  },
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/signin', search: search.redirect ? { redirect: search.redirect } : {} })
  },
})
