import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireSession } from '../lib/auth-fastify.js'

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    {
      schema: {
        response: {
          200: z.object({
            id: z.string(),
            name: z.string(),
            role: z.enum(['USER', 'PROVIDER', 'ADMIN']),
            phoneNumber: z.string().nullable(),
            phoneNumberVerified: z.boolean(),
          }),
        },
      },
    },
    async (req) => {
      const { user } = requireSession(req)
      const u = user as typeof user & {
        role?: string
        phoneNumber?: string | null
        phoneNumberVerified?: boolean
      }
      return {
        id: u.id,
        name: u.name,
        role: (u.role as 'USER' | 'PROVIDER' | 'ADMIN') ?? 'USER',
        phoneNumber: u.phoneNumber ?? null,
        phoneNumberVerified: u.phoneNumberVerified ?? false,
      }
    },
  )
}
