import { io, type Socket } from 'socket.io-client'

// Socket.IO requires an absolute origin — Vercel rewrites don't proxy
// WebSockets reliably, so even when VITE_API_URL is a same-origin prefix
// like "/api" (used to make auth cookies first-party), the socket still
// connects directly to the API host. Set VITE_SOCKET_URL in production to
// the Railway URL; in dev it falls back to VITE_API_URL.
const RAW_API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  (RAW_API_URL.startsWith('/') ? window.location.origin : RAW_API_URL)
const API_URL = SOCKET_URL

/* ─── Mirror of apps/api/src/lib/socket-server.ts event types ────────── */

interface AckOk {
  ok: true
}
interface AckErr {
  ok: false
  error: string
}
type Ack = AckOk | AckErr

export interface ProviderLocationPayload {
  bookingId: string
  latitude: number
  longitude: number
  lastLocationAt: string
  distanceKm: number | null
}

interface ClientToServerEvents {
  ping: (cb: (resp: { pong: number }) => void) => void
  'provider:location': (
    data: { latitude: number; longitude: number },
    ack?: (resp: Ack) => void,
  ) => void
  'booking:join': (data: { bookingId: string }, ack?: (resp: Ack) => void) => void
  'booking:leave': (data: { bookingId: string }) => void
  'chat:delivered': (data: { messageId: string }) => void
}

interface ServerToClientEvents {
  'provider:location': (data: ProviderLocationPayload) => void
  'booking:created': (data: { bookingId: string }) => void
  'booking:taken': (data: { bookingId: string }) => void
  'booking:status': (data: {
    bookingId: string
    status: string
    actorUserId: string | null
  }) => void
  'chat:message': (data: {
    bookingId: string
    message: {
      id: string
      senderId: string
      senderName: string
      body: string
      createdAt: string
      deliveredAt: string | null
    }
  }) => void
  'chat:delivered': (data: {
    bookingId: string
    messageId: string
    deliveredAt: string
  }) => void
  'chat:read': (data: {
    bookingId: string
    readerUserId: string
    readAt: string
  }) => void
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/* ─── Singleton ──────────────────────────────────────────────────────── */

let socketRef: AppSocket | null = null

/**
 * Lazily creates (and reuses) a single Socket.IO connection.
 * `withCredentials: true` so the Better-Auth session cookie travels in the handshake.
 */
export function getSocket(): AppSocket {
  if (!socketRef) {
    socketRef = io(API_URL, {
      withCredentials: true,
      autoConnect: true,
    })
  }
  return socketRef
}

/** Disconnect on sign-out so the next user opens a fresh authenticated socket. */
export function disconnectSocket() {
  if (socketRef) {
    socketRef.disconnect()
    socketRef = null
  }
}
