import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'
import { quoteCancellation } from '../lib/cancellation-policy.js'
import { refundPayment } from '../lib/paymongo.js'

const BookingStatusEnum = z.enum([
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
])

const BookingEventTypeEnum = z.enum([
  'CREATED',
  'PAYMENT_AUTHORIZED',
  'PROVIDER_ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'STARTED',
  'CUSTOMER_CONFIRMED',
  'PROVIDER_CASH_RECEIVED',
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

const PaymentMethodEnum = z.enum(['ONLINE', 'CASH'])
const BookingModeEnum = z.enum(['ON_DEMAND', 'SCHEDULED'])

const CreateBookingBody = z.object({
  serviceTierId: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  bookingMode: BookingModeEnum.default('SCHEDULED'),
  paymentMethod: PaymentMethodEnum.default('ONLINE'),
  address: AddressInput,
  notes: z.string().max(1000).optional(),
})

const BookingSummaryDto = z.object({
  id: z.string(),
  status: BookingStatusEnum,
  bookingMode: BookingModeEnum,
  paymentMethod: PaymentMethodEnum,
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
      const { serviceTierId, scheduledAt, bookingMode, paymentMethod, address, notes } = req.body

      const scheduledDate = new Date(scheduledAt)
      if (scheduledDate.getTime() <= Date.now()) {
        throw app.httpErrors.badRequest('scheduledAt must be in the future')
      }

      const tier = await prisma.serviceTier.findFirst({
        where: { id: serviceTierId, isActive: true },
      })
      if (!tier) throw app.httpErrors.notFound('Service tier not available')

      // CASH bookings skip the payment step entirely → straight to CONFIRMED.
      // ONLINE bookings start as PENDING_PAYMENT and the webhook flips them to IN_ESCROW.
      const initialStatus = paymentMethod === 'CASH' ? 'CONFIRMED' : 'PENDING_PAYMENT'

      const booking = await prisma.booking.create({
        data: {
          userId: session.user.id,
          serviceTierId: tier.id,
          status: initialStatus,
          bookingMode,
          paymentMethod,
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
              payload: { tierSlug: tier.slug, bookingMode, paymentMethod },
            },
          },
        },
        include: {
          serviceTier: { select: { id: true, slug: true, name: true } },
        },
      })

      reply.status(201)
      return toSummaryDto(booking)
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
      return { bookings: rows.map(toSummaryDto) }
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

  /**
   * Customer marks the service as done.
   *   ONLINE booking → COMPLETED + Payout(PENDING) created (we owe the provider)
   *   CASH   booking → PENDING_CASH_CONFIRM (provider must confirm cash receipt)
   */
  app.post(
    '/bookings/:id/customer-complete',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ id: z.string(), status: BookingStatusEnum }) },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const booking = await prisma.booking.findFirst({
        where: { id: req.params.id, userId: session.user.id },
      })
      if (!booking) throw app.httpErrors.notFound('Booking not found')
      if (booking.status !== 'IN_PROGRESS') {
        throw app.httpErrors.conflict(`Cannot complete a booking in status ${booking.status}`)
      }

      const now = new Date()

      if (booking.paymentMethod === 'CASH') {
        await prisma.$transaction([
          prisma.booking.update({
            where: { id: booking.id },
            data: { status: 'PENDING_CASH_CONFIRM', customerCompletedAt: now },
          }),
          prisma.bookingEvent.create({
            data: {
              bookingId: booking.id,
              type: 'CUSTOMER_CONFIRMED',
              actorId: session.user.id,
            },
          }),
        ])
        return { id: booking.id, status: 'PENDING_CASH_CONFIRM' as const }
      }

      // ONLINE: complete and create the payout we owe the provider.
      const ops: import('@prisma/client').Prisma.PrismaPromise<unknown>[] = [
        prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'COMPLETED', customerCompletedAt: now },
        }),
        prisma.bookingEvent.create({
          data: {
            bookingId: booking.id,
            type: 'CUSTOMER_CONFIRMED',
            actorId: session.user.id,
          },
        }),
        prisma.bookingEvent.create({
          data: { bookingId: booking.id, type: 'COMPLETED', actorId: session.user.id },
        }),
      ]
      if (booking.providerId) {
        ops.push(
          prisma.payout.upsert({
            where: { bookingId: booking.id },
            create: {
              bookingId: booking.id,
              providerId: booking.providerId,
              amountCentavos: booking.totalCentavos,
              status: 'PENDING',
            },
            update: {},
          }),
        )
      }
      await prisma.$transaction(ops)
      return { id: booking.id, status: 'COMPLETED' as const }
    },
  )

  /**
   * Provider confirms they received the cash payment.
   * Only valid for CASH bookings already in PENDING_CASH_CONFIRM (customer marked done).
   * Creates a Payout marked PAID immediately — the cash already changed hands,
   * the row is just for the provider's earnings ledger.
   */
  app.post(
    '/bookings/:id/confirm-cash',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ id: z.string(), status: BookingStatusEnum }) },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const booking = await assertProviderForBooking(app, session.user.id, req.params.id)
      const full = await prisma.booking.findUnique({ where: { id: booking.id } })
      if (!full) throw app.httpErrors.notFound('Booking not found')
      if (full.paymentMethod !== 'CASH') {
        throw app.httpErrors.conflict('Cash confirmation only applies to cash bookings')
      }
      if (full.status !== 'PENDING_CASH_CONFIRM') {
        throw app.httpErrors.conflict(`Cannot confirm cash in status ${full.status}`)
      }

      const now = new Date()
      const ops: import('@prisma/client').Prisma.PrismaPromise<unknown>[] = [
        prisma.booking.update({
          where: { id: full.id },
          data: { status: 'COMPLETED', providerCashConfirmedAt: now },
        }),
        prisma.bookingEvent.create({
          data: {
            bookingId: full.id,
            type: 'PROVIDER_CASH_RECEIVED',
            actorId: session.user.id,
          },
        }),
        prisma.bookingEvent.create({
          data: { bookingId: full.id, type: 'COMPLETED', actorId: session.user.id },
        }),
      ]
      if (full.providerId) {
        ops.push(
          prisma.payout.upsert({
            where: { bookingId: full.id },
            create: {
              bookingId: full.id,
              providerId: full.providerId,
              amountCentavos: full.totalCentavos,
              status: 'PAID',
              paidAt: now,
              notes: 'Paid in cash directly to provider',
            },
            update: {},
          }),
        )
      }
      await prisma.$transaction(ops)
      return { id: full.id, status: 'COMPLETED' as const }
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
        ...toSummaryDto(booking),
        addressLine2: booking.addressLine2,
        barangay: booking.barangay,
        province: booking.province,
        postalCode: booking.postalCode,
        latitude: booking.latitude,
        longitude: booking.longitude,
        notes: booking.notes,
        basePriceCentavos: booking.basePriceCentavos,
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

type BookingSummaryRow = {
  id: string
  status: import('@prisma/client').BookingStatus
  bookingMode: import('@prisma/client').BookingMode
  paymentMethod: import('@prisma/client').PaymentMethod
  scheduledAt: Date
  durationMinutes: number
  addressLine1: string
  city: string
  totalCentavos: number
  createdAt: Date
  serviceTier: { id: string; slug: string; name: string }
}

function toSummaryDto(b: BookingSummaryRow) {
  return {
    id: b.id,
    status: b.status,
    bookingMode: b.bookingMode,
    paymentMethod: b.paymentMethod,
    scheduledAt: b.scheduledAt.toISOString(),
    durationMinutes: b.durationMinutes,
    addressLine1: b.addressLine1,
    city: b.city,
    totalCentavos: b.totalCentavos,
    createdAt: b.createdAt.toISOString(),
    serviceTier: b.serviceTier,
  }
}
