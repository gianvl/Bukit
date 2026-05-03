import { io, type Socket } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

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
}

interface ServerToClientEvents {
  'provider:location': (data: ProviderLocationPayload) => void
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
