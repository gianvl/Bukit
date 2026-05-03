import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'
import { quoteCancellation } from '../lib/cancellation-policy.js'
import { refundPayment } from '../lib/paymongo.js'

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

async function assertProviderForBooking(
  app: import('fastify').FastifyInstance,
  userId: string,
  bookingId: string,
) {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!profile) throw app.httpErrors.forbidden('Not a provider')
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, providerId: profile.id },
    select: { id: true, status: true },
  })
  if (!booking) throw app.httpErrors.notFound('Booking not found or not assigned to you')
  return booking
}

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
    '/bookings/:id/cancellation-quote',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            cancellable: z.boolean(),
            feeCentavos: z.int().nonnegative(),
            refundCentavos: z.int().nonnegative(),
            reason: z.string(),
          }),
        },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const booking = await prisma.booking.findFirst({
        where: { id: req.params.id, userId: session.user.id },
        select: { status: true, scheduledAt: true, totalCentavos: true },
      })
      if (!booking) throw app.httpErrors.notFound('Booking not found')

      const quote = quoteCancellation({
        status: booking.status,
        scheduledAt: booking.scheduledAt,
        totalCentavos: booking.totalCentavos,
      })
      return {
        ...quote,
        refundCentavos: Math.max(0, booking.totalCentavos - quote.feeCentavos),
      }
    },
  )

  app.post(
    '/bookings/:id/cancel',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            id: z.string(),
            status: BookingStatusEnum,
            feeCentavos: z.int().nonnegative(),
            refundCentavos: z.int().nonnegative(),
            refundId: z.string().nullable(),
          }),
        },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const booking = await prisma.booking.findFirst({
        where: { id: req.params.id, userId: session.user.id },
        include: { payment: true },
      })
      if (!booking) throw app.httpErrors.notFound('Booking not found')

      const quote = quoteCancellation({
        status: booking.status,
        scheduledAt: booking.scheduledAt,
        totalCentavos: booking.totalCentavos,
      })
      if (!quote.cancellable) throw app.httpErrors.conflict(quote.reason)

      const refundCentavos = Math.max(0, booking.totalCentavos - quote.feeCentavos)
      let refundId: string | null = null

      // Refund only if a payment was actually captured.
      if (
        refundCentavos > 0 &&
        booking.payment &&
        booking.payment.status === 'CAPTURED' &&
        booking.payment.paymongoPaymentId
      ) {
        const result = await refundPayment(booking.payment.paymongoPaymentId, refundCentavos)
        refundId = result.refundId
      }

      const isFullRefund =
        refundCentavos > 0 && booking.payment && refundCentavos === booking.payment.amountCentavos

      await prisma.$transaction([
        prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'CANCELLED_BY_USER' },
        }),
        ...(booking.payment && isFullRefund
          ? [
              prisma.payment.update({
                where: { id: booking.payment.id },
                data: { status: 'REFUNDED', refundedAt: new Date() },
              }),
            ]
          : []),
        prisma.bookingEvent.create({
          data: {
            bookingId: booking.id,
            type: 'CANCELLED',
            actorId: session.user.id,
            payload: {
              reason: quote.reason,
              feeCentavos: quote.feeCentavos,
              refundCentavos,
              refundId,
            },
          },
        }),
        ...(refundId
          ? [
              prisma.bookingEvent.create({
                data: {
                  bookingId: booking.id,
                  type: 'REFUNDED',
                  actorId: session.user.id,
                  payload: { refundId, refundCentavos },
                },
              }),
            ]
          : []),
      ])

      return {
        id: booking.id,
        status: 'CANCELLED_BY_USER' as const,
        feeCentavos: quote.feeCentavos,
        refundCentavos,
        refundId,
      }
    },
  )

  /**
   * Provider claims a CONFIRMED, unassigned booking. Race-safe: updateMany
   * with status+providerId predicates ensures only one caller wins.
   */
  app.post(
    '/bookings/:id/accept',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            id: z.string(),
            status: BookingStatusEnum,
            providerId: z.string(),
          }),
        },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true, status: true },
      })
      if (!profile) throw app.httpErrors.forbidden('Not a provider')
      if (profile.status !== 'ACTIVE') {
        throw app.httpErrors.forbidden('Provider is not active')
      }

      const result = await prisma.booking.updateMany({
        where: { id: req.params.id, status: 'CONFIRMED', providerId: null },
        data: { status: 'PROVIDER_ASSIGNED', providerId: profile.id },
      })
      if (result.count === 0) {
        throw app.httpErrors.conflict('Booking is no longer available')
      }

      await prisma.bookingEvent.create({
        data: {
          bookingId: req.params.id,
          type: 'PROVIDER_ASSIGNED',
          actorId: session.user.id,
          payload: { providerId: profile.id },
        },
      })

      return {
        id: req.params.id,
        status: 'PROVIDER_ASSIGNED' as const,
        providerId: profile.id,
      }
    },
  )

  /**
   * Provider transitions: PROVIDER_ASSIGNED → IN_PROGRESS → COMPLETED.
   */
  app.post(
    '/bookings/:id/start',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ id: z.string(), status: BookingStatusEnum }) },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const booking = await assertProviderForBooking(app, session.user.id, req.params.id)
      if (booking.status !== 'PROVIDER_ASSIGNED') {
        throw app.httpErrors.conflict(`Cannot start a booking in status ${booking.status}`)
      }
      await prisma.$transaction([
        prisma.booking.update({ where: { id: booking.id }, data: { status: 'IN_PROGRESS' } }),
        prisma.bookingEvent.create({
          data: { bookingId: booking.id, type: 'STARTED', actorId: session.user.id },
        }),
      ])
      return { id: booking.id, status: 'IN_PROGRESS' as const }
    },
  )

  app.post(
    '/bookings/:id/complete',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ id: z.string(), status: BookingStatusEnum }) },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const booking = await assertProviderForBooking(app, session.user.id, req.params.id)
      if (booking.status !== 'IN_PROGRESS') {
        throw app.httpErrors.conflict(`Cannot complete a booking in status ${booking.status}`)
      }
      await prisma.$transaction([
        prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } }),
        prisma.bookingEvent.create({
          data: { bookingId: booking.id, type: 'COMPLETED', actorId: session.user.id },
        }),
      ])
      return { id: booking.id, status: 'COMPLETED' as const }
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
