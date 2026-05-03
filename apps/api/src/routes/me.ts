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
            email: z.string(),
            name: z.string(),
            role: z.enum(['USER', 'PROVIDER', 'ADMIN']),
            phone: z.string().nullable(),
          }),
        },
      },
    },
    async (req) => {
      const { user } = requireSession(req)
      const u = user as typeof user & { role?: string; phone?: string | null }
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: (u.role as 'USER' | 'PROVIDER' | 'ADMIN') ?? 'USER',
        phone: u.phone ?? null,
      }
    },
  )
}
