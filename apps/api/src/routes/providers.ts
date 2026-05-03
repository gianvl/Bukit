import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'
import { haversineKm, ON_DEMAND_RADIUS_KM } from '../lib/distance.js'

const ProviderStatusEnum = z.enum(['PENDING_KYC', 'ACTIVE', 'SUSPENDED', 'REJECTED'])
const AvailabilityModeEnum = z.enum(['OFFLINE', 'SCHEDULED_ONLY', 'FULL'])

const ProviderProfileDto = z.object({
  id: z.string(),
  status: ProviderStatusEnum,
  availabilityMode: AvailabilityModeEnum,
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

const SetAvailabilityBody = z.object({
  availabilityMode: AvailabilityModeEnum,
})

const SetLocationBody = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

const AssignedBookingDto = z.object({
  id: z.string(),
  status: z.enum([
    'PENDING_PAYMENT',
    'IN_ESCROW',
    'CONFIRMED',
    'PROVIDER_ASSIGNED',
    'EN_ROUTE',
    'IN_PROGRESS',
    'PENDING_CASH_CONFIRM',
    'COMPLETED',
    'CANCELLED_BY_USER',
    'CANCELLED_BY_PROVIDER',
    'REFUNDED',
  ]),
  bookingMode: z.enum(['ON_DEMAND', 'SCHEDULED']),
  paymentMethod: z.enum(['ONLINE', 'CASH']),
  scheduledAt: z.iso.datetime(),
  durationMinutes: z.int().positive(),
  addressLine1: z.string(),
  city: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  totalCentavos: z.int().nonnegative(),
  serviceTier: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  customerName: z.string(),
  /** Distance from the caller's current location in km (only set for on-demand). */
  distanceKm: z.number().nullable(),
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

  /**
   * Set the caller's availability mode.
   *   OFFLINE        — no bookings of any kind
   *   SCHEDULED_ONLY — receive only scheduled bookings (no on-demand pings)
   *   FULL           — receive both
   */
  app.patch(
    '/providers/me/availability',
    {
      schema: {
        body: SetAvailabilityBody,
        response: { 200: ProviderProfileDto },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: session.user.id },
      })
      if (!profile) throw app.httpErrors.forbidden('Not a provider')

      const updated = await prisma.providerProfile.update({
        where: { id: profile.id },
        data: { availabilityMode: req.body.availabilityMode },
      })
      return toDto(updated)
    },
  )

  /**
   * Updates the caller's current location. Provider's frontend pings this
   * every ~10 seconds while online so on-demand matching has fresh coords.
   */
  app.patch(
    '/providers/me/location',
    {
      schema: {
        body: SetLocationBody,
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (!profile) throw app.httpErrors.forbidden('Not a provider')

      await prisma.providerProfile.update({
        where: { id: profile.id },
        data: {
          currentLatitude: req.body.latitude,
          currentLongitude: req.body.longitude,
          lastLocationAt: new Date(),
        },
      })
      return { ok: true as const }
    },
  )

  /**
   * Bookings available for acceptance.
   *
   * Two filters compose:
   *   - SCHEDULED bookings: include if booking.city ∈ caller.cities (case-insensitive).
   *     Available to providers in SCHEDULED_ONLY or FULL mode.
   *   - ON_DEMAND bookings: include only if caller has a fresh location AND
   *     mode = FULL AND booking is within ON_DEMAND_RADIUS_KM (5 km).
   *     Distance check is post-query in JS so we don't need PostGIS.
   *
   * OFFLINE → empty.
   */
  app.get(
    '/providers/me/available-bookings',
    {
      schema: {
        response: { 200: z.object({ bookings: z.array(AssignedBookingDto) }) },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: session.user.id },
        select: {
          id: true,
          status: true,
          cities: true,
          availabilityMode: true,
          currentLatitude: true,
          currentLongitude: true,
        },
      })
      if (!profile) throw app.httpErrors.forbidden('Not a provider')
      if (profile.status !== 'ACTIVE') return { bookings: [] }
      if (profile.availabilityMode === 'OFFLINE') return { bookings: [] }

      const includesScheduled = profile.cities.length > 0
      const hasLocation =
        profile.currentLatitude != null && profile.currentLongitude != null
      const includesOnDemand =
        profile.availabilityMode === 'FULL' && hasLocation

      const filters: Prisma.BookingWhereInput[] = []
      if (includesScheduled) {
        filters.push({
          bookingMode: 'SCHEDULED',
          city: { in: profile.cities, mode: 'insensitive' },
        })
      }
      if (includesOnDemand) {
        filters.push({
          bookingMode: 'ON_DEMAND',
          latitude: { not: null },
          longitude: { not: null },
        })
      }
      if (filters.length === 0) return { bookings: [] }

      const rows = await prisma.booking.findMany({
        where: {
          status: { in: ['CONFIRMED', 'IN_ESCROW'] },
          providerId: null,
          OR: filters,
        },
        orderBy: { scheduledAt: 'asc' },
        include: {
          serviceTier: { select: { id: true, slug: true, name: true } },
          user: { select: { name: true } },
        },
      })

      const out: ReturnType<typeof toAssignedDto>[] = []
      for (const b of rows) {
        let distanceKm: number | null = null
        if (b.bookingMode === 'ON_DEMAND') {
          if (!includesOnDemand || b.latitude == null || b.longitude == null) continue
          distanceKm = haversineKm(
            { lat: profile.currentLatitude!, lng: profile.currentLongitude! },
            { lat: b.latitude, lng: b.longitude },
          )
          if (distanceKm > ON_DEMAND_RADIUS_KM) continue
        }
        out.push(toAssignedDto(b, distanceKm))
      }
      // On-demand bookings sort by distance (nearest first), scheduled stay by scheduledAt.
      out.sort((a, b) => {
        if (a.bookingMode === 'ON_DEMAND' && b.bookingMode === 'ON_DEMAND') {
          return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
        }
        if (a.bookingMode === 'ON_DEMAND') return -1
        if (b.bookingMode === 'ON_DEMAND') return 1
        return a.scheduledAt.localeCompare(b.scheduledAt)
      })
      return { bookings: out }
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
      return { bookings: rows.map(toAssignedDto) }
    },
  )
}

type ProfileRow = {
  id: string
  status: 'PENDING_KYC' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED'
  availabilityMode: 'OFFLINE' | 'SCHEDULED_ONLY' | 'FULL'
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
    availabilityMode: p.availabilityMode,
    bio: p.bio,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    cities: p.cities,
    createdAt: p.createdAt.toISOString(),
  }
}

type BookingRow = {
  id: string
  status:
    | 'PENDING_PAYMENT'
    | 'IN_ESCROW'
    | 'CONFIRMED'
    | 'PROVIDER_ASSIGNED'
    | 'EN_ROUTE'
    | 'IN_PROGRESS'
    | 'PENDING_CASH_CONFIRM'
    | 'COMPLETED'
    | 'CANCELLED_BY_USER'
    | 'CANCELLED_BY_PROVIDER'
    | 'REFUNDED'
  bookingMode: 'ON_DEMAND' | 'SCHEDULED'
  paymentMethod: 'ONLINE' | 'CASH'
  scheduledAt: Date
  durationMinutes: number
  addressLine1: string
  city: string
  latitude: number | null
  longitude: number | null
  totalCentavos: number
  serviceTier: { id: string; slug: string; name: string }
  user: { name: string }
}

function toAssignedDto(b: BookingRow, distanceKm: number | null = null) {
  return {
    id: b.id,
    status: b.status,
    bookingMode: b.bookingMode,
    paymentMethod: b.paymentMethod,
    scheduledAt: b.scheduledAt.toISOString(),
    durationMinutes: b.durationMinutes,
    addressLine1: b.addressLine1,
    city: b.city,
    latitude: b.latitude,
    longitude: b.longitude,
    totalCentavos: b.totalCentavos,
    serviceTier: b.serviceTier,
    customerName: b.user.name,
    distanceKm,
  }
}
