import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'

const ProviderStatusEnum = z.enum(['PENDING_KYC', 'ACTIVE', 'SUSPENDED', 'REJECTED'])

const ProviderProfileDto = z.object({
  id: z.string(),
  status: ProviderStatusEnum,
  bio: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.int().nonnegative(),
  cities: z.array(z.string()),
  createdAt: z.iso.datetime(),
})

const ApplyBody = z.object({
  bio: z.string().max(500).optional(),
  cities: z.array(z.string().min(1).max(100)).max(20).optional(),
})

const AssignedBookingDto = z.object({
  id: z.string(),
  status: z.enum([
    'PENDING_PAYMENT',
    'CONFIRMED',
    'PROVIDER_ASSIGNED',
    'EN_ROUTE',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED_BY_USER',
    'CANCELLED_BY_PROVIDER',
    'REFUNDED',
  ]),
  scheduledAt: z.iso.datetime(),
  durationMinutes: z.int().positive(),
  addressLine1: z.string(),
  city: z.string(),
  totalCentavos: z.int().nonnegative(),
  serviceTier: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  customerName: z.string(),
})

export const providerRoutes: FastifyPluginAsyncZod = async (app) => {
  /**
   * Apply to become a provider. Flips role to PROVIDER and creates a profile
   * in PENDING_KYC. Idempotent: returns the existing profile if one exists.
   */
  app.post(
    '/providers/apply',
    {
      schema: {
        body: ApplyBody,
        response: { 201: ProviderProfileDto, 200: ProviderProfileDto },
      },
    },
    async (req, reply) => {
      const session = requireSession(req)
      const userId = session.user.id

      const existing = await prisma.providerProfile.findUnique({ where: { userId } })
      if (existing) {
        reply.status(200)
        return toDto(existing)
      }

      const profile = await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { role: 'PROVIDER' } })
        return tx.providerProfile.create({
          data: {
            userId,
            status: 'PENDING_KYC',
            bio: req.body.bio,
            cities: req.body.cities ?? [],
          },
        })
      })

      reply.status(201)
      return toDto(profile)
    },
  )

  app.get(
    '/providers/me',
    {
      schema: { response: { 200: ProviderProfileDto } },
    },
    async (req) => {
      const session = requireSession(req)
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: session.user.id },
      })
      if (!profile) throw app.httpErrors.notFound('Provider profile not found')
      return toDto(profile)
    },
  )

  app.get(
    '/providers/me/bookings',
    {
      schema: {
        response: { 200: z.object({ bookings: z.array(AssignedBookingDto) }) },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (!profile) throw app.httpErrors.forbidden('Not a provider')

      const rows = await prisma.booking.findMany({
        where: { providerId: profile.id },
        orderBy: { scheduledAt: 'asc' },
        include: {
          serviceTier: { select: { id: true, slug: true, name: true } },
          user: { select: { name: true } },
        },
      })

      return {
        bookings: rows.map((b) => ({
          id: b.id,
          status: b.status,
          scheduledAt: b.scheduledAt.toISOString(),
          durationMinutes: b.durationMinutes,
          addressLine1: b.addressLine1,
          city: b.city,
          totalCentavos: b.totalCentavos,
          serviceTier: b.serviceTier,
          customerName: b.user.name,
        })),
      }
    },
  )
}

type ProfileRow = {
  id: string
  status: 'PENDING_KYC' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED'
  bio: string | null
  ratingAvg: number
  ratingCount: number
  cities: string[]
  createdAt: Date
}

function toDto(p: ProfileRow) {
  return {
    id: p.id,
    status: p.status,
    bio: p.bio,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    cities: p.cities,
    createdAt: p.createdAt.toISOString(),
  }
}
