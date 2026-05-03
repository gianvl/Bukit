import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'
import { env } from '../env.js'

/** Skip KYC review locally; production still requires manual approval. */
const initialProviderStatus = env.NODE_ENV === 'production' ? 'PENDING_KYC' : 'ACTIVE'

const RoleEnum = z.enum(['USER', 'PROVIDER', 'ADMIN'])

const CustomerStatsDto = z.object({
  totalBookings: z.int().nonnegative(),
  completedBookings: z.int().nonnegative(),
  cancelledBookings: z.int().nonnegative(),
  totalSpentCentavos: z.int().nonnegative(),
  lastBookingAt: z.iso.datetime().nullable(),
})

const ProviderStatsDto = z.object({
  totalJobs: z.int().nonnegative(),
  completedJobs: z.int().nonnegative(),
  totalEarnedCentavos: z.int().nonnegative(),
  jobsThisWeek: z.int().nonnegative(),
  ratingAvg: z.number(),
  ratingCount: z.int().nonnegative(),
})

const MeStatsDto = z.object({
  customer: CustomerStatsDto,
  provider: ProviderStatsDto.nullable(),
})

const MeDto = z.object({
  id: z.string(),
  name: z.string(),
  role: RoleEnum,
  phoneNumber: z.string().nullable(),
  phoneNumberVerified: z.boolean(),
  onboardedAt: z.iso.datetime().nullable(),
})

const OnboardingBody = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(['USER', 'PROVIDER']),
  cities: z.array(z.string().min(1).max(100)).max(20).optional(),
  bio: z.string().max(500).optional(),
})

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    {
      schema: { response: { 200: MeDto } },
    },
    async (req) => {
      const { user } = requireSession(req)
      // Best-effort fetch for fields the session doesn't carry (onboardedAt is server-side only).
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true, role: true, phoneNumber: true, phoneNumberVerified: true, onboardedAt: true },
      })
      return {
        id: user.id,
        name: dbUser?.name ?? user.name,
        role: dbUser?.role ?? 'USER',
        phoneNumber: dbUser?.phoneNumber ?? null,
        phoneNumberVerified: dbUser?.phoneNumberVerified ?? false,
        onboardedAt: dbUser?.onboardedAt?.toISOString() ?? null,
      }
    },
  )

  /**
   * Completes (or updates) onboarding: real name + chosen role.
   * Idempotent — safe to re-submit. A USER can upgrade to PROVIDER here too,
   * which mirrors what /providers/apply does. PROVIDER → USER downgrade is not
   * supported (would require unwinding the ProviderProfile, edge case for later).
   */
  app.post(
    '/me/onboarding',
    {
      schema: {
        body: OnboardingBody,
        response: { 200: MeDto },
      },
    },
    async (req) => {
      const { user } = requireSession(req)
      const { name, role, cities, bio } = req.body

      const current = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      })
      if (current?.role === 'PROVIDER' && role === 'USER') {
        throw app.httpErrors.conflict('Cannot downgrade from PROVIDER to USER')
      }

      const now = new Date()
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: user.id },
          data: { name: name.trim(), role, onboardedAt: now },
          select: {
            name: true,
            role: true,
            phoneNumber: true,
            phoneNumberVerified: true,
            onboardedAt: true,
          },
        })
        if (role === 'PROVIDER') {
          await tx.providerProfile.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              status: initialProviderStatus,
              cities: cities ?? [],
              bio,
            },
            update: {
              ...(cities !== undefined ? { cities } : {}),
              ...(bio !== undefined ? { bio } : {}),
            },
          })
        }
        return u
      })

      return {
        id: user.id,
        name: updated.name,
        role: updated.role,
        phoneNumber: updated.phoneNumber,
        phoneNumberVerified: updated.phoneNumberVerified,
        onboardedAt: updated.onboardedAt?.toISOString() ?? null,
      }
    },
  )

  /**
   * Stats for the current user, computed live. `customer` is always present
   * (anyone can book). `provider` is non-null only if the user has a profile.
   */
  app.get(
    '/me/stats',
    {
      schema: { response: { 200: MeStatsDto } },
    },
    async (req) => {
      const { user } = requireSession(req)

      const [
        totalBookings,
        completedBookings,
        cancelledBookings,
        spentSum,
        lastBooking,
      ] = await Promise.all([
        prisma.booking.count({ where: { userId: user.id } }),
        prisma.booking.count({ where: { userId: user.id, status: 'COMPLETED' } }),
        prisma.booking.count({
          where: {
            userId: user.id,
            status: { in: ['CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER'] },
          },
        }),
        prisma.booking.aggregate({
          where: { userId: user.id, status: 'COMPLETED' },
          _sum: { totalCentavos: true },
        }),
        prisma.booking.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ])

      const customer = {
        totalBookings,
        completedBookings,
        cancelledBookings,
        totalSpentCentavos: spentSum._sum.totalCentavos ?? 0,
        lastBookingAt: lastBooking?.createdAt.toISOString() ?? null,
      }

      const profile = await prisma.providerProfile.findUnique({
        where: { userId: user.id },
        select: { id: true, ratingAvg: true, ratingCount: true },
      })

      let provider = null
      if (profile) {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const [totalJobs, completedJobs, earnedSum, thisWeek] = await Promise.all([
          prisma.booking.count({ where: { providerId: profile.id } }),
          prisma.booking.count({
            where: { providerId: profile.id, status: 'COMPLETED' },
          }),
          // Earnings = sum of payouts (PAID + PENDING combined). Both represent money owed/paid for completed jobs.
          prisma.payout.aggregate({
            where: { providerId: profile.id },
            _sum: { amountCentavos: true },
          }),
          prisma.booking.count({
            where: {
              providerId: profile.id,
              status: 'COMPLETED',
              updatedAt: { gte: oneWeekAgo },
            },
          }),
        ])
        provider = {
          totalJobs,
          completedJobs,
          totalEarnedCentavos: earnedSum._sum.amountCentavos ?? 0,
          jobsThisWeek: thisWeek,
          ratingAvg: profile.ratingAvg,
          ratingCount: profile.ratingCount,
        }
      }

      return { customer, provider }
    },
  )
}
