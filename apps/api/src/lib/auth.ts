import { betterAuth } from 'better-auth'
import { phoneNumber } from 'better-auth/plugins'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma.js'
import { env } from '../env.js'
import { sendSms } from './philsms.js'
import { normalizePHMobile } from './phone.js'

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  baseURL: env.API_PUBLIC_URL,
  secret: env.AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
  // Email/password is intentionally disabled — phone OTP is the only auth path.
  emailAndPassword: { enabled: false },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'USER',
        // Server-controlled — clients cannot set role on sign-up.
        input: false,
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
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: rawPhone, code }) => {
        const phone = normalizePHMobile(rawPhone) ?? rawPhone
        await sendSms({
          to: phone,
          message: `Your Bukit verification code is ${code}. It expires in 10 minutes.`,
        })
      },
      otpLength: 6,
      expiresIn: 60 * 10, // 10 minutes
      allowedAttempts: 3,
      signUpOnVerification: {
        // The schema requires email; synthesize a placeholder users never see.
        getTempEmail: (phone) => `${phone.replace(/\D/g, '')}@phone.bukit.local`,
        getTempName: (phone) => phone,
      },
    }),
  ],
})

export type Auth = typeof auth
export type Session = typeof auth.$Infer.Session
