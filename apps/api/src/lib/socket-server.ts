import type { FastifyInstance } from 'fastify'
import { Server as SocketIOServer, type Socket } from 'socket.io'
import { auth, type Session } from './auth.js'
import { prisma } from './prisma.js'
import { haversineKm } from './distance.js'
import { env } from '../env.js'

/* ─── Typed events ──────────────────────────────────────────────────── */

interface AckOk {
  ok: true
}
interface AckErr {
  ok: false
  error: string
}
type Ack = AckOk | AckErr

interface ProviderLocationPayload {
  bookingId: string
  latitude: number
  longitude: number
  lastLocationAt: string
  distanceKm: number | null
}

export interface ClientToServerEvents {
  ping: (cb: (resp: { pong: number }) => void) => void
  /** Provider streams their position; server persists + broadcasts to assigned booking rooms. */
  'provider:location': (
    data: { latitude: number; longitude: number },
    ack?: (resp: Ack) => void,
  ) => void
  /** Subscribe to a booking room (server validates owner or assigned provider). */
  'booking:join': (data: { bookingId: string }, ack?: (resp: Ack) => void) => void
  /** Stop receiving updates for a booking room. */
  'booking:leave': (data: { bookingId: string }) => void
}

export interface ServerToClientEvents {
  'provider:location': (data: ProviderLocationPayload) => void
  /** New unassigned booking is available in this provider's area. */
  'booking:created': (data: { bookingId: string }) => void
  /** A booking was claimed by another provider — remove from your list. */
  'booking:taken': (data: { bookingId: string }) => void
  /** Booking status changed; clients in `booking:{id}` should refetch detail. */
  'booking:status': (data: {
    bookingId: string
    /** New status — lets clients toast without an extra fetch. */
    status: string
    /** User who triggered the change. Lets clients suppress self-toasts. */
    actorUserId: string | null
  }) => void
}

/**
 * Notify everyone subscribed to a booking that its status changed.
 * Emits to:
 *   - `booking:{id}` (customer's open detail page joins this on mount)
 *   - `provider:{userId}` of the assigned provider, if any (their dashboard
 *      auto-joins on connect — gives them live updates without joining every
 *      booking's room individually)
 *
 * Looks up the current status so clients can toast without an extra fetch.
 * `actorUserId` lets clients suppress self-triggered toasts.
 *
 * Fire-and-forget: callers don't need to await; we swallow lookup errors.
 */
export async function emitBookingStatus(
  bookingId: string,
  actorUserId: string | null = null,
): Promise<void> {
  if (!ioRef) return

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, provider: { select: { userId: true } } },
    })
    if (!booking) return

    const payload = { bookingId, status: booking.status, actorUserId }
    ioRef.to(`booking:${bookingId}`).emit('booking:status', payload)
    if (booking.provider?.userId) {
      ioRef.to(providerRoom(booking.provider.userId)).emit('booking:status', payload)
    }
  } catch {
    // Best-effort; not the end of the world if a single broadcast misses.
  }
}

/** Normalize a city name to a stable Socket.IO room key. */
export function areaRoom(city: string): string {
  return `area:${city.trim().toLowerCase()}`
}

/** Per-provider room. Provider auto-joins on connect; used to push events
 *  about all of their assigned bookings without joining each booking's room. */
export function providerRoom(userId: string): string {
  return `provider:${userId}`
}

export interface SocketData {
  session: Session
}

export type AppServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

/* ─── Server lifecycle ──────────────────────────────────────────────── */

let ioRef: AppServer | null = null

export function getIo(): AppServer {
  if (!ioRef) throw new Error('Socket.IO not initialized — call setupSocketServer first')
  return ioRef
}

export function setupSocketServer(app: FastifyInstance): AppServer {
  const io: AppServer = new SocketIOServer(app.server, {
    cors: {
      origin: env.WEB_ORIGIN,
      credentials: true,
    },
  })

  io.use(async (socket, next) => {
    const headers = new Headers()
    for (const [key, value] of Object.entries(socket.handshake.headers)) {
      if (typeof value === 'string') headers.set(key, value)
      else if (Array.isArray(value)) headers.set(key, value.join(','))
    }
    const session = await auth.api.getSession({ headers })
    if (!session) return next(new Error('Unauthorized'))
    socket.data.session = session
    next()
  })

  io.on('connection', (socket) => {
    const userId = socket.data.session.user.id
    app.log.debug({ userId, socketId: socket.id }, 'socket connected')

    // Auto-join area rooms for providers so booking:created broadcasts reach them.
    void joinProviderAreaRooms(socket).catch((err) => {
      app.log.warn({ err, userId }, 'failed to join provider area rooms')
    })

    socket.on('ping', (cb) => {
      if (typeof cb === 'function') cb({ pong: Date.now() })
    })

    socket.on('provider:location', (data, ack) => {
      handleProviderLocation(io, socket, data).then(
        () => ack?.({ ok: true }),
        (err: unknown) =>
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : 'unknown error',
          }),
      )
    })

    socket.on('booking:join', (data, ack) => {
      handleBookingJoin(socket, data).then(
        () => ack?.({ ok: true }),
        (err: unknown) =>
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : 'unknown error',
          }),
      )
    })

    socket.on('booking:leave', (data) => {
      void socket.leave(`booking:${data.bookingId}`)
    })

    socket.on('disconnect', (reason) => {
      app.log.debug({ userId, reason }, 'socket disconnected')
    })
  })

  ioRef = io
  return io
}

/* ─── Handlers ──────────────────────────────────────────────────────── */

async function handleProviderLocation(
  io: AppServer,
  socket: AppSocket,
  data: { latitude: number; longitude: number },
) {
  const userId = socket.data.session.user.id

  if (
    typeof data.latitude !== 'number' ||
    typeof data.longitude !== 'number' ||
    Math.abs(data.latitude) > 90 ||
    Math.abs(data.longitude) > 180
  ) {
    throw new Error('Invalid coordinates')
  }

  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!profile) throw new Error('Not a provider')

  const now = new Date()
  await prisma.providerProfile.update({
    where: { id: profile.id },
    data: {
      currentLatitude: data.latitude,
      currentLongitude: data.longitude,
      lastLocationAt: now,
    },
  })

  // Broadcast to every booking room this provider is currently working on.
  const activeBookings = await prisma.booking.findMany({
    where: {
      providerId: profile.id,
      status: { in: ['PROVIDER_ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'] },
    },
    select: { id: true, latitude: true, longitude: true },
  })

  const lastLocationAt = now.toISOString()
  for (const b of activeBookings) {
    const distanceKm =
      b.latitude != null && b.longitude != null
        ? haversineKm(
            { lat: data.latitude, lng: data.longitude },
            { lat: b.latitude, lng: b.longitude },
          )
        : null
    io.to(`booking:${b.id}`).emit('provider:location', {
      bookingId: b.id,
      latitude: data.latitude,
      longitude: data.longitude,
      lastLocationAt,
      distanceKm,
    })
  }
}

async function joinProviderAreaRooms(socket: AppSocket) {
  const userId = socket.data.session.user.id
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
    select: { cities: true },
  })
  if (!profile) return
  // Personal room first (cheap, single join), then area rooms for matching.
  await socket.join(providerRoom(userId))
  for (const city of profile.cities) {
    await socket.join(areaRoom(city))
  }
}

async function handleBookingJoin(
  socket: AppSocket,
  data: { bookingId: string },
) {
  if (typeof data.bookingId !== 'string' || !data.bookingId) {
    throw new Error('Invalid bookingId')
  }
  const userId = socket.data.session.user.id
  const booking = await prisma.booking.findUnique({
    where: { id: data.bookingId },
    select: { id: true, userId: true, providerId: true },
  })
  if (!booking) throw new Error('Booking not found')

  let allowed = booking.userId === userId
  if (!allowed && booking.providerId) {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    })
    allowed = profile?.id === booking.providerId
  }
  if (!allowed) throw new Error('Forbidden')

  await socket.join(`booking:${booking.id}`)
}
