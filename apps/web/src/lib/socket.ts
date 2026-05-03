import { io, type Socket } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

let socketRef: Socket | null = null

/**
 * Lazily creates (and reuses) a single Socket.IO connection.
 *
 * `withCredentials: true` so the Better-Auth session cookie is sent during
 * the handshake — the server's auth middleware reads it the same way HTTP
 * routes do.
 */
export function getSocket(): Socket {
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
