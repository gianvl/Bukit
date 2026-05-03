// Vitest setup: provide stable env defaults BEFORE any module imports env.ts.
// env.ts calls process.exit(1) on validation failure, which would crash tests.
process.env.NODE_ENV ??= 'test'
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5435/test?schema=public'
process.env.AUTH_SECRET ??= 'test-auth-secret-1234567890-1234567890'
process.env.COOKIE_SECRET ??= 'test-cookie-secret-1234567890'
process.env.HELIXPAY_WEBHOOK_SECRET ??= 'test-helixpay-webhook-secret-1234567890'
process.env.HELIXPAY_API_KEY ??= 'sandbox-helixpay-api-key'
