import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const ServiceTierDto = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  basePriceCentavos: z.int().nonnegative(),
  estimatedMinutes: z.int().positive(),
  sortOrder: z.int(),
})

export const serviceTierRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/service-tiers',
    {
      schema: {
        response: {
          200: z.object({
            tiers: z.array(ServiceTierDto),
          }),
        },
      },
    },
    async (_req, reply) => {
      const tiers = await prisma.serviceTier.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          basePriceCentavos: true,
          estimatedMinutes: true,
          sortOrder: true,
        },
      })
      // Tier list is effectively static — same 4 rows for everyone, only
      // changes on a deploy. Let the browser hold onto it for 5 minutes
      // and the Vercel CDN for an hour. stale-while-revalidate keeps the
      // UI snappy while we refresh in the background.
      reply.header(
        'cache-control',
        'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      )
      return { tiers }
    },
  )
}
