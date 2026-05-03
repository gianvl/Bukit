import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'
import { env } from '../env.js'

/** Skip KYC review locally; production still requires manual approval. */
const initialProviderStatus = env.NODE_ENV === 'production' ? 'PENDING_KYC' : 'ACTIVE'

const RoleEnum = z.enum(['USER', 'PROVIDER', 'ADMIN'])

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
}
