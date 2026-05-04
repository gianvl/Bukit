import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields, phoneNumberClient } from 'better-auth/client/plugins'

const RAW_API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
// Better-Auth treats baseURL as the AUTH root and appends action names
// directly when baseURL contains a path. To keep its default routing
// (/api/auth/{action}) consistent across modes, we always pass it just
// the origin and let it add the /api/auth prefix itself:
//   - dev:  baseURL = "http://localhost:3001" → calls /api/auth/get-session
//   - prod (proxied via Vercel rewrites): baseURL = window.location.origin
//     → calls /api/auth/get-session, which the rewrite forwards verbatim.
const API_URL = RAW_API_URL.startsWith('/')
  ? window.location.origin
  : RAW_API_URL

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    phoneNumberClient(),
    inferAdditionalFields({
      user: {
        role: { type: 'string', defaultValue: 'USER', input: false },
      },
    }),
  ],
})

export const { signOut, useSession, getSession } = authClient
export const phoneNumber = authClient.phoneNumber

export type SessionUser = NonNullable<ReturnType<typeof useSession>['data']>['user']
