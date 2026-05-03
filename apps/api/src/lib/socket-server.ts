import type { FastifyInstance } from 'fastify'
import { Server as SocketIOServer, type Socket } from 'socket.io'
import { auth, type Session } from './auth.js'
import { env } from '../env.js'

/**
 * Augments Socket.IO data with our typed session.
 * Attached during the auth middleware below; consumers can read it directly.
 */
export interface SocketData {
  session: Session
}

/** Strongly-typed socket alias used by event handlers. */
export type AppSocket = Socket<DefaultEvents, DefaultEvents, DefaultEvents, SocketData>

interface DefaultEvents {
  ping: (cb: (resp: { pong: number }) => void) => void
}

let ioRef: SocketIOServer | null = null

/**
 * Returns the Socket.IO server instance (after setupSocketServer has run).
 * Throws if called before init — surfaces wiring bugs early.
 */
export function getIo(): SocketIOServer {
  if (!ioRef) throw new Error('Socket.IO not initialized — call setupSocketServer first')
  return ioRef
}

/**
 * Mounts Socket.IO on Fastify's underlying HTTP server.
 *
 * Auth: every connection's handshake headers are run through Better-Auth's
 * getSession, just like a normal HTTP request. Anonymous connections are
 * rejected so we never have an unauthenticated socket on the wire.
 */
export function setupSocketServer(app: FastifyInstance): SocketIOServer {
  const io = new SocketIOServer(app.server, {
    cors: {
      origin: env.WEB_ORIGIN,
      credentials: true,
    },
    // Production tip: set transports: ['websocket'] once a load balancer with
    // sticky sessions is in place. Default polling-then-websocket works in dev.
  })

  io.use(async (socket, next) => {
    const headers = new Headers()
    for (const [key, value] of Object.entries(socket.handshake.headers)) {
      if (typeof value === 'string') headers.set(key, value)
      else if (Array.isArray(value)) headers.set(key, value.join(','))
    }
    const session = await auth.api.getSession({ headers })
    if (!session) return next(new Error('Unauthorized'))
    ;(socket.data as SocketData).session = session
    next()
  })

  io.on('connection', (socket: AppSocket) => {
    const userId = socket.data.session.user.id
    app.log.debug({ userId, socketId: socket.id }, 'socket connected')

    // Sanity ping for client liveness checks.
    socket.on('ping', (cb) => {
      if (typeof cb === 'function') cb({ pong: Date.now() })
    })

    socket.on('disconnect', (reason) => {
      app.log.debug({ userId, reason }, 'socket disconnected')
    })
  })

  ioRef = io
  return io
}
