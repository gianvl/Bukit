import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    // Stable defaults so env.ts validation doesn't process.exit during tests.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5435/test?schema=public',
      AUTH_SECRET: 'test-auth-secret-1234567890-1234567890',
      COOKIE_SECRET: 'test-cookie-secret-1234567890',
      PAYMONGO_SECRET_KEY: 'sk_test_dummy',
      PAYMONGO_WEBHOOK_SECRET: 'whsk_test_dummy_secret_for_unit_tests',
      PHILSMS_API_KEY: 'test-philsms-api-key',
    },
  },
})
