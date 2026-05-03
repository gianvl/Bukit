import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'
import { chatClosesAt, isChatOpen } from '../lib/chat-window.js'
import { emitChatMessage, emitChatRead } from '../lib/socket-server.js'

const MessageDto = z.object({
  id: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  deliveredAt: z.iso.datetime().nullable(),
})

const ListResponse = z.object({
  messages: z.array(MessageDto),
  isOpen: z.boolean(),
  closesAt: z.iso.datetime().nullable(),
  /** When the calling viewer last read the thread. */
  myReadAt: z.iso.datetime().nullable(),
  /** When the other party last read the thread (drives the "Read" indicator). */
  otherReadAt: z.iso.datetime().nullable(),
})

const PostBody = z.object({
  body: z.string().min(1).max(2_000).trim(),
})

interface AuthorizedBooking {
  id: string
  status: import('@prisma/client').BookingStatus
  customerCompletedAt: Date | null
  providerCashConfirmedAt: Date | null
  userId: string
  customerChatReadAt: Date | null
  providerChatReadAt: Date | null
  provider: { userId: string } | null
}

async function authorizeChatAccess(
  app: import('fastify').FastifyInstance,
  bookingId: string,
  userId: string,
): Promise<{ booking: AuthorizedBooking; viewerRole: 'CUSTOMER' | 'PROVIDER' }> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      OR: [{ userId }, { provider: { userId } }],
    },
    select: {
      id: true,
      status: true,
      customerCompletedAt: true,
      providerCashConfirmedAt: true,
      userId: true,
      customerChatReadAt: true,
      providerChatReadAt: true,
      provider: { select: { userId: true } },
    },
  })
  if (!booking) throw app.httpErrors.notFound('Booking not found')
  const viewerRole: 'CUSTOMER' | 'PROVIDER' =
    booking.userId === userId ? 'CUSTOMER' : 'PROVIDER'
  return { booking, viewerRole }
}

export const messageRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/bookings/:id/messages',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: ListResponse },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const { booking, viewerRole } = await authorizeChatAccess(app, req.params.id, session.user.id)

      const messages = await prisma.message.findMany({
        where: { bookingId: booking.id },
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { name: true } } },
      })

      const myReadAt =
        viewerRole === 'CUSTOMER' ? booking.customerChatReadAt : booking.providerChatReadAt
      const otherReadAt =
        viewerRole === 'CUSTOMER' ? booking.providerChatReadAt : booking.customerChatReadAt

      return {
        messages: messages.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender.name,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          deliveredAt: m.deliveredAt?.toISOString() ?? null,
        })),
        isOpen: isChatOpen(booking),
        closesAt: chatClosesAt(booking)?.toISOString() ?? null,
        myReadAt: myReadAt?.toISOString() ?? null,
        otherReadAt: otherReadAt?.toISOString() ?? null,
      }
    },
  )

  app.post(
    '/bookings/:id/messages',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: PostBody,
        response: { 201: MessageDto },
      },
    },
    async (req, reply) => {
      const session = requireSession(req)
      const { booking } = await authorizeChatAccess(app, req.params.id, session.user.id)

      if (!isChatOpen(booking)) {
        throw app.httpErrors.conflict('Chat for this booking is closed')
      }

      const created = await prisma.message.create({
        data: {
          bookingId: booking.id,
          senderId: session.user.id,
          body: req.body.body,
        },
        include: { sender: { select: { name: true } } },
      })

      const dto = {
        id: created.id,
        senderId: created.senderId,
        senderName: created.sender.name,
        body: created.body,
        createdAt: created.createdAt.toISOString(),
        deliveredAt: created.deliveredAt?.toISOString() ?? null,
      }
      emitChatMessage(booking.id, dto)
      reply.status(201)
      return dto
    },
  )

  /**
   * Mark the thread read up to "now" for the calling participant.
   * Idempotent — safe to call on every chat-page mount or focus.
   */
  app.post(
    '/bookings/:id/messages/read',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: z.object({ readAt: z.iso.datetime() }) },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const { booking, viewerRole } = await authorizeChatAccess(app, req.params.id, session.user.id)

      const now = new Date()
      await prisma.booking.update({
        where: { id: booking.id },
        data:
          viewerRole === 'CUSTOMER'
            ? { customerChatReadAt: now }
            : { providerChatReadAt: now },
      })

      emitChatRead(booking.id, session.user.id, now)
      return { readAt: now.toISOString() }
    },
  )
}
