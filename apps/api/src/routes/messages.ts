import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'
import { chatClosesAt, isChatOpen } from '../lib/chat-window.js'
import { emitChatMessage } from '../lib/socket-server.js'

const MessageDto = z.object({
  id: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
})

const ListResponse = z.object({
  messages: z.array(MessageDto),
  /** Whether the chat accepts new messages right now. */
  isOpen: z.boolean(),
  /** When the chat will auto-close (only set during the COMPLETED wind-down). */
  closesAt: z.iso.datetime().nullable(),
})

const PostBody = z.object({
  body: z.string().min(1).max(2_000).trim(),
})

/**
 * Loads the booking + its chat-window-relevant timestamps and verifies that
 * the caller is either the customer (booking owner) or the assigned provider's
 * user. Throws an HTTP error otherwise.
 */
async function authorizeChatAccess(
  app: import('fastify').FastifyInstance,
  bookingId: string,
  userId: string,
) {
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
    },
  })
  if (!booking) throw app.httpErrors.notFound('Booking not found')
  return booking
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
      const booking = await authorizeChatAccess(app, req.params.id, session.user.id)

      const messages = await prisma.message.findMany({
        where: { bookingId: booking.id },
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { name: true } } },
      })

      return {
        messages: messages.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender.name,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
        isOpen: isChatOpen(booking),
        closesAt: chatClosesAt(booking)?.toISOString() ?? null,
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
      const booking = await authorizeChatAccess(app, req.params.id, session.user.id)

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
      }
      emitChatMessage(booking.id, dto)
      reply.status(201)
      return dto
    },
  )
}
