import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import sensible from '@fastify/sensible'
import rawBody from 'fastify-raw-body'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { env } from './env.js'
import { registerErrorHandler } from './lib/errors.js'
import { registerAuth } from './lib/auth-fastify.js'
import { setupSocketServer } from './lib/socket-server.js'
import { healthRoutes } from './routes/health.js'
import { meRoutes } from './routes/me.js'
import { serviceTierRoutes } from './routes/service-tiers.js'
import { bookingRoutes } from './routes/bookings.js'
import { providerRoutes } from './routes/providers.js'
import { paymentRoutes } from './routes/payments.js'
import { webhookRoutes } from './routes/webhooks.js'
import { messageRoutes } from './routes/messages.js'
import { geocodingRoutes } from './routes/geocoding.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    trustProxy: env.NODE_ENV === 'production',
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(sensible)
  await app.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: false, // Buffer
    runFirst: true,
  })
  await app.register(cookie, { secret: env.COOKIE_SECRET })
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })

  registerErrorHandler(app)

  await registerAuth(app)
  await app.register(healthRoutes)
  await app.register(meRoutes)
  await app.register(serviceTierRoutes)
  await app.register(bookingRoutes)
  await app.register(providerRoutes)
  await app.register(paymentRoutes)
  await app.register(webhookRoutes)
  await app.register(messageRoutes)
  await app.register(geocodingRoutes)

  return app
}

async function start() {
  const app = await buildApp()
  // Mount Socket.IO on the underlying http server (available pre-listen).
  setupSocketServer(app)
  try {
    await app.listen({ host: env.HOST, port: env.PORT })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
