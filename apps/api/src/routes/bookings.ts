import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'

const BookingStatusEnum = z.enum([
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PROVIDER_ASSIGNED',
  'EN_ROUTE',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED_BY_USER',
  'CANCELLED_BY_PROVIDER',
  'REFUNDED',
])

const BookingEventTypeEnum = z.enum([
  'CREATED',
  'PAYMENT_AUTHORIZED',
  'PROVIDER_ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'NOTE',
])

const AddressInput = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  barangay: z.string().max(100).optional(),
  city: z.string().min(1).max(100),
  province: z.string().max(100).default('Metro Manila'),
  postalCode: z.string().max(10).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

const CreateBookingBody = z.object({
  serviceTierId: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  address: AddressInput,
  notes: z.string().max(1000).optional(),
})

const BookingSummaryDto = z.object({
  id: z.string(),
  status: BookingStatusEnum,
  scheduledAt: z.iso.datetime(),
  durationMinutes: z.int().positive(),
  addressLine1: z.string(),
  city: z.string(),
  totalCentavos: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  serviceTier: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
  }),
})

const BookingEventDto = z.object({
  id: z.string(),
  type: BookingEventTypeEnum,
  payload: z.unknown().nullable(),
  createdAt: z.iso.datetime(),
})

const BookingDetailDto = BookingSummaryDto.extend({
  addressLine2: z.string().nullable(),
  barangay: z.string().nullable(),
  province: z.string(),
  postalCode: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  notes: z.string().nullable(),
  basePriceCentavos: z.int().nonnegative(),
  events: z.array(BookingEventDto),
  payment: z
    .object({
      status: z.enum(['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED']),
      amountCentavos: z.int().nonnegative(),
    })
    .nullable(),
})

export const bookingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/bookings',
    {
      schema: {
        body: CreateBookingBody,
        response: {
          201: BookingSummaryDto,
        },
      },
    },
    async (req, reply) => {
      const session = requireSession(req)
      const { serviceTierId, scheduledAt, address, notes } = req.body

      const scheduledDate = new Date(scheduledAt)
      if (scheduledDate.getTime() <= Date.now()) {
        throw app.httpErrors.badRequest('scheduledAt must be in the future')
      }

      const tier = await prisma.serviceTier.findFirst({
        where: { id: serviceTierId, isActive: true },
      })
      if (!tier) throw app.httpErrors.notFound('Service tier not available')

      const booking = await prisma.booking.create({
        data: {
          userId: session.user.id,
          serviceTierId: tier.id,
          status: 'PENDING_PAYMENT',
          scheduledAt: scheduledDate,
          durationMinutes: tier.estimatedMinutes,
          addressLine1: address.line1,
          addressLine2: address.line2,
          barangay: address.barangay,
          city: address.city,
          province: address.province,
          postalCode: address.postalCode,
          latitude: address.latitude,
          longitude: address.longitude,
          notes,
          // Snapshot pricing so later tier price changes don't affect this booking.
          basePriceCentavos: tier.basePriceCentavos,
          totalCentavos: tier.basePriceCentavos,
          events: {
            create: {
              type: 'CREATED',
              actorId: session.user.id,
              payload: { tierSlug: tier.slug },
            },
          },
        },
        include: {
          serviceTier: { select: { id: true, slug: true, name: true } },
        },
      })

      reply.status(201)
      return {
        id: booking.id,
        status: booking.status,
        scheduledAt: booking.scheduledAt.toISOString(),
        durationMinutes: booking.durationMinutes,
        addressLine1: booking.addressLine1,
        city: booking.city,
        totalCentavos: booking.totalCentavos,
        createdAt: booking.createdAt.toISOString(),
        serviceTier: booking.serviceTier,
      }
    },
  )

  app.get(
    '/bookings',
    {
      schema: {
        response: {
          200: z.object({ bookings: z.array(BookingSummaryDto) }),
        },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const rows = await prisma.booking.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        include: { serviceTier: { select: { id: true, slug: true, name: true } } },
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
          createdAt: b.createdAt.toISOString(),
          serviceTier: b.serviceTier,
        })),
      }
    },
  )

  app.get(
    '/bookings/:id',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: BookingDetailDto },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const booking = await prisma.booking.findFirst({
        where: { id: req.params.id, userId: session.user.id },
        include: {
          serviceTier: { select: { id: true, slug: true, name: true } },
          events: { orderBy: { createdAt: 'asc' } },
          payment: { select: { status: true, amountCentavos: true } },
        },
      })
      if (!booking) throw app.httpErrors.notFound('Booking not found')

      return {
        id: booking.id,
        status: booking.status,
        scheduledAt: booking.scheduledAt.toISOString(),
        durationMinutes: booking.durationMinutes,
        addressLine1: booking.addressLine1,
        addressLine2: booking.addressLine2,
        barangay: booking.barangay,
        city: booking.city,
        province: booking.province,
        postalCode: booking.postalCode,
        latitude: booking.latitude,
        longitude: booking.longitude,
        notes: booking.notes,
        basePriceCentavos: booking.basePriceCentavos,
        totalCentavos: booking.totalCentavos,
        createdAt: booking.createdAt.toISOString(),
        serviceTier: booking.serviceTier,
        events: booking.events.map((e) => ({
          id: e.id,
          type: e.type,
          payload: e.payload as unknown,
          createdAt: e.createdAt.toISOString(),
        })),
        payment: booking.payment,
      }
    },
  )
}
