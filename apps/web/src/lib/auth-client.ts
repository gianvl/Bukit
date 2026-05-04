import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields, phoneNumberClient } from 'better-auth/client/plugins'

const RAW_API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
// If VITE_API_URL is a same-origin path prefix (e.g. "/api"), resolve it
// against the current origin so Better-Auth has an absolute baseURL.
// In dev / direct-Railway mode it's already absolute and passes through.
const API_URL = RAW_API_URL.startsWith('/')
  ? `${window.location.origin}${RAW_API_URL.replace(/\/$/, '')}`
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
