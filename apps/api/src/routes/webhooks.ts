import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { parseWebhookEvent, verifyWebhookSignature } from '../lib/paymongo.js'

const eventToPaymentStatus = {
  'checkout_session.payment.paid': 'CAPTURED',
  'payment.paid': 'CAPTURED',
  'payment.failed': 'FAILED',
  'payment.refunded': 'REFUNDED',
} as const

const eventToBookingEvent = {
  'checkout_session.payment.paid': 'PAYMENT_AUTHORIZED',
  'payment.paid': 'PAYMENT_AUTHORIZED',
  'payment.failed': 'CANCELLED',
  'payment.refunded': 'REFUNDED',
} as const

export const webhookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/webhooks/paymongo',
    {
      // rawBody is needed for signature verification.
      config: { rawBody: true },
      schema: {
        response: {
          200: z.object({ received: z.literal(true) }),
        },
      },
    },
    async (req) => {
      const sigHeader = req.headers['paymongo-signature']
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader
      const raw = (req as unknown as { rawBody?: Buffer }).rawBody

      if (!raw || !verifyWebhookSignature(raw, sig)) {
        throw app.httpErrors.unauthorized('Invalid webhook signature')
      }

      const event = parseWebhookEvent(req.body)
      if (!event) {
        // Unhandled event type — ack so PayMongo stops retrying.
        return { received: true as const }
      }

      // Locate the Payment row by checkout id (preferred) or payment id.
      const payment = await prisma.payment.findFirst({
        where: event.checkoutId
          ? { paymongoCheckoutId: event.checkoutId }
          : event.paymentId
            ? { paymongoPaymentId: event.paymentId }
            : event.bookingId
              ? { bookingId: event.bookingId }
              : { id: '__never__' },
      })

      if (!payment) {
        app.log.warn({ event }, 'webhook for unknown payment')
        return { received: true as const }
      }

      const nextStatus = eventToPaymentStatus[event.type]
      const nowFields =
        nextStatus === 'CAPTURED'
          ? { capturedAt: new Date() }
          : nextStatus === 'REFUNDED'
            ? { refundedAt: new Date() }
            : {}

      // Promote the Booking from PENDING_PAYMENT → IN_ESCROW on first paid event
      // (funds held until customer-confirmed completion). Conditional updateMany
      // keeps it idempotent across duplicate webhook deliveries.
      const promotesBooking = nextStatus === 'CAPTURED'

      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: nextStatus,
            paymongoPaymentId: event.paymentId ?? payment.paymongoPaymentId,
            paymongoPayload: req.body as object,
            ...nowFields,
          },
        }),
        ...(promotesBooking
          ? [
              prisma.booking.updateMany({
                where: { id: payment.bookingId, status: 'PENDING_PAYMENT' },
                data: { status: 'IN_ESCROW' },
              }),
            ]
          : []),
        prisma.bookingEvent.create({
          data: {
            bookingId: payment.bookingId,
            type: eventToBookingEvent[event.type],
            payload: { event: event.type, checkoutId: event.checkoutId, paymentId: event.paymentId },
          },
        }),
      ])

      return { received: true as const }
    },
  )
}
