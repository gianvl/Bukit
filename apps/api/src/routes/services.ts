import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireRole } from '../lib/auth-fastify.js'

/**
 * Public catalog + admin CRUD for services and their tiers.
 *
 * The customer-facing GET /services returns active services with their
 * active tiers nested. /service-tiers (defined separately for backwards
 * compatibility) still returns the flat tier list.
 *
 * Everything under /admin/* requires role=ADMIN.
 */

const ServiceTierDto = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  basePriceCentavos: z.int().nonnegative(),
  estimatedMinutes: z.int().positive(),
  sortOrder: z.int(),
  isActive: z.boolean(),
})

const ServiceDto = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  iconKey: z.string(),
  sortOrder: z.int(),
  isActive: z.boolean(),
  tiers: z.array(ServiceTierDto),
})

const UpsertServiceBody = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/, 'lowercase letters, digits, dashes'),
  name: z.string().min(2).max(100),
  description: z.string().min(2).max(500),
  iconKey: z.string().min(2).max(40).default('sparkles'),
  sortOrder: z.int().min(0).default(0),
  isActive: z.boolean().default(true),
})

const UpsertTierBody = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/, 'lowercase letters, digits, dashes'),
  name: z.string().min(2).max(100),
  description: z.string().min(2).max(500),
  basePriceCentavos: z.int().min(0).max(10_000_000),
  estimatedMinutes: z.int().min(15).max(720),
  sortOrder: z.int().min(0).default(0),
  isActive: z.boolean().default(true),
})

const tierSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  basePriceCentavos: true,
  estimatedMinutes: true,
  sortOrder: true,
  isActive: true,
} as const

export const serviceRoutes: FastifyPluginAsyncZod = async (app) => {
  /**
   * Public catalog. Returns active services + their active tiers, sorted.
   * Cached briefly at the edge — admin edits are rare, and the customer
   * UI invalidates its own query when a booking is made.
   */
  app.get(
    '/services',
    {
      schema: { response: { 200: z.object({ services: z.array(ServiceDto) }) } },
    },
    async (_req, reply) => {
      const services = await prisma.service.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          tiers: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: tierSelect,
          },
        },
      })
      reply.header(
        'cache-control',
        'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      )
      return { services: services.map(toServiceDto) }
    },
  )

  /* ─── Admin CRUD ─────────────────────────────────────────────────── */

  /** Lists ALL services (including inactive ones) for the admin console. */
  app.get(
    '/admin/services',
    {
      schema: { response: { 200: z.object({ services: z.array(ServiceDto) }) } },
    },
    async (req) => {
      requireRole(req, 'ADMIN')
      const services = await prisma.service.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          tiers: { orderBy: { sortOrder: 'asc' }, select: tierSelect },
        },
      })
      return { services: services.map(toServiceDto) }
    },
  )

  app.post(
    '/admin/services',
    {
      schema: { body: UpsertServiceBody, response: { 201: ServiceDto } },
    },
    async (req, reply) => {
      requireRole(req, 'ADMIN')
      const created = await prisma.service.create({
        data: req.body,
        include: {
          tiers: { orderBy: { sortOrder: 'asc' }, select: tierSelect },
        },
      })
      reply.status(201)
      return toServiceDto(created)
    },
  )

  app.patch(
    '/admin/services/:id',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: UpsertServiceBody.partial(),
        response: { 200: ServiceDto },
      },
    },
    async (req) => {
      requireRole(req, 'ADMIN')
      const updated = await prisma.service.update({
        where: { id: req.params.id },
        data: req.body,
        include: {
          tiers: { orderBy: { sortOrder: 'asc' }, select: tierSelect },
        },
      })
      return toServiceDto(updated)
    },
  )

  app.delete(
    '/admin/services/:id',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (req) => {
      requireRole(req, 'ADMIN')
      // Soft-delete via isActive=false is safer than hard delete because
      // existing bookings reference tiers under this service. Admin can
      // restore by toggling isActive back on.
      await prisma.service.update({
        where: { id: req.params.id },
        data: { isActive: false },
      })
      return { ok: true as const }
    },
  )

  /* ─── Admin tier CRUD (nested under a service) ─────────────────── */

  app.post(
    '/admin/services/:id/tiers',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: UpsertTierBody,
        response: { 201: ServiceTierDto },
      },
    },
    async (req, reply) => {
      requireRole(req, 'ADMIN')
      const created = await prisma.serviceTier.create({
        data: { ...req.body, serviceId: req.params.id },
        select: tierSelect,
      })
      reply.status(201)
      return created
    },
  )

  app.patch(
    '/admin/tiers/:id',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: UpsertTierBody.partial(),
        response: { 200: ServiceTierDto },
      },
    },
    async (req) => {
      requireRole(req, 'ADMIN')
      const updated = await prisma.serviceTier.update({
        where: { id: req.params.id },
        data: req.body,
        select: tierSelect,
      })
      return updated
    },
  )

  app.delete(
    '/admin/tiers/:id',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (req) => {
      requireRole(req, 'ADMIN')
      await prisma.serviceTier.update({
        where: { id: req.params.id },
        data: { isActive: false },
      })
      return { ok: true as const }
    },
  )
}

type TierRow = {
  id: string
  slug: string
  name: string
  description: string
  basePriceCentavos: number
  estimatedMinutes: number
  sortOrder: number
  isActive: boolean
}

type ServiceRow = {
  id: string
  slug: string
  name: string
  description: string
  iconKey: string
  sortOrder: number
  isActive: boolean
  tiers: TierRow[]
}

function toServiceDto(s: ServiceRow) {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    iconKey: s.iconKey,
    sortOrder: s.sortOrder,
    isActive: s.isActive,
    tiers: s.tiers,
  }
}
