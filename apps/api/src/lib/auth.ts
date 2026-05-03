import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma.js'
import { env } from '../env.js'

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  baseURL: env.API_PUBLIC_URL,
  secret: env.AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'USER',
        // Server-controlled — clients cannot set role on sign-up.
        input: false,
      },
      phone: {
        type: 'string',
        required: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh sliding window once a day
  },
  advanced: {
    cookiePrefix: 'bukit',
    crossSubDomainCookies: { enabled: false },
  },
})

export type Auth = typeof auth
export type Session = typeof auth.$Infer.Session
