import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  COOKIE_SECRET: z.string().min(16).default('dev-cookie-secret-change-me-32chars'),
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(32).default('dev-auth-secret-change-me-32chars-or-more'),
  API_PUBLIC_URL: z.url().default('http://localhost:3001'),

  // PayMongo (PH payment gateway). Use sk_test_* in dev, sk_live_* in prod.
  PAYMONGO_BASE_URL: z.url().default('https://api.paymongo.com/v1'),
  PAYMONGO_SECRET_KEY: z.string().min(1),
  // Webhook secret is optional in dev — we relax signature verification when unset.
  PAYMONGO_WEBHOOK_SECRET: z.string().min(1).optional(),

  // PhilSMS (PH SMS provider) — used for phone OTP delivery
  PHILSMS_BASE_URL: z.url().default('https://dashboard.philsms.com/api/v3'),
  PHILSMS_API_KEY: z.string().min(1),
  PHILSMS_SENDER_ID: z.string().min(1).default('PhilSMS'),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:')
  console.error(z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
