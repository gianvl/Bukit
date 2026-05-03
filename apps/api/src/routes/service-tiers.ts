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
    async () => {
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
      return { tiers }
    },
  )
}
