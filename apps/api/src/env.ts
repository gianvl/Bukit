import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  COOKIE_SECRET: z.string().min(16).default('dev-cookie-secret-change-me-32chars'),
  DATABASE_URL: z.url(),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:')
  console.error(z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
