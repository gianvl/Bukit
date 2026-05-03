import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '../env.js'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'
import { createCheckoutSession } from '../lib/paymongo.js'

export const paymentRoutes: FastifyPluginAsyncZod = async (app) => {
  /**
   * Creates a Payment row and a PayMongo Checkout Session for an existing
   * booking. Returns the URL to redirect the user to.
   */
  app.post(
    '/payments/checkout',
    {
      schema: {
        body: z.object({
          bookingId: z.string().min(1),
        }),
        response: {
          200: z.object({
            checkoutId: z.string(),
            checkoutUrl: z.url(),
          }),
        },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const { bookingId } = req.body

      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, userId: session.user.id },
        include: { user: true, payment: true, serviceTier: true },
      })
      if (!booking) throw app.httpErrors.notFound('Booking not found')
      if (booking.payment && booking.payment.status !== 'PENDING') {
        throw app.httpErrors.conflict('Payment already initiated for this booking')
      }

      const checkout = await createCheckoutSession({
        bookingId: booking.id,
        amountCentavos: booking.totalCentavos,
        customerEmail: booking.user.email,
        customerName: booking.user.name,
        description: `Bukit · ${booking.serviceTier.name}`,
        successUrl: `${env.WEB_ORIGIN}/bookings/${booking.id}?status=success`,
        cancelUrl: `${env.WEB_ORIGIN}/bookings/${booking.id}?status=cancelled`,
      })

      await prisma.payment.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          amountCentavos: booking.totalCentavos,
          status: 'PENDING',
          paymongoCheckoutId: checkout.checkoutId,
        },
        update: {
          paymongoCheckoutId: checkout.checkoutId,
          status: 'PENDING',
        },
      })

      await prisma.bookingEvent.create({
        data: {
          bookingId: booking.id,
          type: 'CREATED',
          actorId: session.user.id,
          payload: { checkoutId: checkout.checkoutId },
        },
      })

      return checkout
    },
  )
}
