import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields, phoneNumberClient } from 'better-auth/client/plugins'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

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
