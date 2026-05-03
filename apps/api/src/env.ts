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
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:')
  console.error(z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
