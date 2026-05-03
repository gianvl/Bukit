import { useEffect, useRef, useState } from 'react'
import { getSocket } from '@/lib/socket'

export type ShareLocationStatus =
  | 'idle' // not currently sharing
  | 'requesting' // permission prompt or first fix pending
  | 'sharing' // at least one update sent successfully
  | 'denied' // user blocked geolocation
  | 'unsupported' // browser has no geolocation API

const THROTTLE_MS = 10_000

/**
 * While `active` is true, watches the browser's geolocation and pushes updates
 * to the server over the Socket.IO connection (no HTTP polling).
 *
 * Throttled to ≥10s between emits. The server persists each update to Postgres
 * and broadcasts to any subscribed booking room — customers see the pin move
 * in real time without their own polling.
 */
export function useShareLocation(active: boolean) {
  const [status, setStatus] = useState<ShareLocationStatus>('idle')
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null)
  const lastSentRef = useRef(0)

  useEffect(() => {
    if (!active) {
      setStatus('idle')
      return
    }
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }

    setStatus('requesting')
    const socket = getSocket()

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - lastSentRef.current < THROTTLE_MS) return
        lastSentRef.current = now
        socket.emit(
          'provider:location',
          { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
          (resp) => {
            if (resp?.ok) {
              setStatus('sharing')
              setLastUpdateAt(new Date())
            }
            // On error we stay in 'requesting' until the next fix succeeds.
          },
        )
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied')
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [active])

  return { status, lastUpdateAt }
}
