import { useEffect, useRef, useState } from 'react'
import { setProviderLocation } from './api'

export type ShareLocationStatus =
  | 'idle' // not currently sharing
  | 'requesting' // permission prompt or first fix pending
  | 'sharing' // at least one update sent successfully
  | 'denied' // user blocked geolocation
  | 'unsupported' // browser has no geolocation API

const THROTTLE_MS = 10_000

/**
 * While `active` is true, watches the browser's geolocation and POSTs updates
 * to /providers/me/location at most once every 10 seconds.
 *
 * We use watchPosition (not setInterval + getCurrentPosition) so the browser
 * surfaces device-driven updates (compass, walking, vehicle) without burning
 * battery on idle polls. The throttle keeps server load bounded.
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
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now()
        if (now - lastSentRef.current < THROTTLE_MS) return
        lastSentRef.current = now
        try {
          await setProviderLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          })
          setStatus('sharing')
          setLastUpdateAt(new Date())
        } catch {
          // Swallow — we'll retry on the next position event.
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied')
        }
        // Other errors (timeout, position unavailable) keep us in 'requesting'
        // so the indicator stays neutral until the next successful fix.
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [active])

  return { status, lastUpdateAt }
}
