import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  /**
   * Allowed front-end origin(s). Comma-separated for production
   * (e.g. "https://bukit.vercel.app,https://bukit.ph"). Each entry must
   * be a full http(s) URL.
   */
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .refine(
      (v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .every((s) => /^https?:\/\//.test(s) && s.length < 200),
      'WEB_ORIGIN must be one or more http(s) URLs, comma-separated',
    ),
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

  // Vercel Blob — KYC document uploads. Optional in dev: when unset the
  // /kyc/upload-token endpoint refuses with a clear error so the rest of
  // the API still boots without the integration.
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),

  /* ─── Marketplace tuning knobs ───────────────────────────────────────
   * These have sensible defaults in the lib/* modules; ops can override
   * here without redeploying code (Railway env vars). When unset, the
   * lib defaults take effect.
   */

  /** On-demand match radius in km. Default: 35 (covers all of NCR). */
  ON_DEMAND_RADIUS_KM: z.coerce.number().positive().max(200).optional(),
  /** Hours a payout sits PENDING before it's eligible for disbursement. */
  PAYOUT_COOLDOWN_HOURS: z.coerce.number().nonnegative().max(720).optional(),
  /** Minimum batch size (centavos) for "Request payout". */
  MIN_PAYOUT_CENTAVOS: z.coerce.number().int().nonnegative().optional(),
  /** How long after COMPLETED the chat thread stays open. Milliseconds. */
  POST_COMPLETION_CHAT_MS: z.coerce.number().int().nonnegative().optional(),
  /**
   * Hard gate on customer KYC for booking. `true` in production, override
   * to `false` for local dev or staging environments where you want
   * unverified accounts to be able to book.
   */
  KYC_REQUIRED_FOR_BOOKING: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration:')
  console.error(z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
