import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { verifyWebhookSignature } from '../lib/helixpay.js'

/**
 * Generic webhook payload shape we adopt internally. The real HelixPay
 * payload may differ — adapt the parser when integrating.
 */
const WebhookPayload = z.object({
  event: z.enum(['payment.authorized', 'payment.captured', 'payment.failed', 'payment.refunded']),
  data: z.object({
    checkoutId: z.string(),
    paymentId: z.string().optional(),
    amountCentavos: z.int().nonnegative().optional(),
  }),
})

const eventToStatus = {
  'payment.authorized': 'AUTHORIZED',
  'payment.captured': 'CAPTURED',
  'payment.failed': 'FAILED',
  'payment.refunded': 'REFUNDED',
} as const

const eventToBookingEvent = {
  'payment.authorized': 'PAYMENT_AUTHORIZED',
  'payment.captured': 'PAYMENT_AUTHORIZED', // captured implies authorized
  'payment.failed': 'CANCELLED',
  'payment.refunded': 'REFUNDED',
} as const

export const webhookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/webhooks/helixpay',
    {
      // rawBody is needed for signature verification; this route opts in.
      config: { rawBody: true },
      schema: {
        response: {
          200: z.object({ received: z.literal(true) }),
        },
      },
    },
    async (req) => {
      const signature = req.headers['x-helixpay-signature']
      const sig = Array.isArray(signature) ? signature[0] : signature
      const raw = (req as unknown as { rawBody?: Buffer }).rawBody

      if (!raw || !verifyWebhookSignature(raw, sig)) {
        throw app.httpErrors.unauthorized('Invalid webhook signature')
      }

      const parsed = WebhookPayload.safeParse(req.body)
      if (!parsed.success) {
        throw app.httpErrors.badRequest('Invalid webhook payload')
      }
      const { event, data } = parsed.data

      const payment = await prisma.payment.findUnique({
        where: { helixPayCheckoutId: data.checkoutId },
      })
      if (!payment) {
        // Acknowledge unknown checkouts so HelixPay doesn't keep retrying.
        app.log.warn({ checkoutId: data.checkoutId }, 'webhook for unknown checkout')
        return { received: true as const }
      }

      const nextStatus = eventToStatus[event]
      const nowFields =
        nextStatus === 'AUTHORIZED'
          ? { authorizedAt: new Date() }
          : nextStatus === 'CAPTURED'
            ? { capturedAt: new Date() }
            : nextStatus === 'REFUNDED'
              ? { refundedAt: new Date() }
              : {}

      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: nextStatus,
            helixPayPaymentId: data.paymentId ?? payment.helixPayPaymentId,
            helixPayPayload: parsed.data as object,
            ...nowFields,
          },
        }),
        prisma.bookingEvent.create({
          data: {
            bookingId: payment.bookingId,
            type: eventToBookingEvent[event],
            payload: { event, checkoutId: data.checkoutId },
          },
        }),
      ])

      return { received: true as const }
    },
  )
}
