import { useMemo } from 'react'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'

/**
 * A self-contained Leaflet map for booking views.
 *
 * Uses OpenStreetMap tiles (no API key, free for our scale) and a CSS-only
 * DivIcon for the marker so we sidestep Leaflet's bundler-broken default icon
 * asset paths.
 */

interface MapPin {
  latitude: number
  longitude: number
  label?: string
  /** Tone for the pin — 'primary' (default) for the customer, 'accent' for the provider. */
  tone?: 'primary' | 'accent'
}

interface BookingMapProps {
  pins: MapPin[]
  /** Map height in CSS units. Default: 16rem. */
  height?: string
  className?: string
}

const PIN_COLOR: Record<NonNullable<MapPin['tone']>, string> = {
  primary: 'oklch(0.596 0.145 163.225)', // matches --primary in light mode
  accent: 'oklch(0.769 0.188 70.08)',    // amber for provider
}

function buildIcon(color: string) {
  // Drop-shaped pin in pure SVG — no external assets needed.
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 44" width="32" height="44">
      <defs>
        <filter id="s" x="-20%" y="-10%" width="140%" height="120%">
          <feGaussianBlur stdDeviation="1" />
        </filter>
      </defs>
      <ellipse cx="16" cy="42" rx="6" ry="1.6" fill="rgba(15,23,42,0.25)" filter="url(#s)" />
      <path d="M16 0c-8.84 0-16 7.16-16 16 0 11 16 28 16 28s16-17 16-28C32 7.16 24.84 0 16 0z" fill="${color}" />
      <circle cx="16" cy="16" r="6" fill="white" />
    </svg>
  `.trim()
  return L.divIcon({
    html: svg,
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    className: 'bukit-map-pin',
  })
}

export function BookingMap({ pins, height = '16rem', className }: BookingMapProps) {
  const validPins = pins.filter(
    (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
  )

  const center = useMemo<[number, number]>(() => {
    if (validPins.length === 0) return [14.5547, 121.0244] // BGC fallback
    if (validPins.length === 1) return [validPins[0]!.latitude, validPins[0]!.longitude]
    const avgLat = validPins.reduce((s, p) => s + p.latitude, 0) / validPins.length
    const avgLng = validPins.reduce((s, p) => s + p.longitude, 0) / validPins.length
    return [avgLat, avgLng]
  }, [validPins])

  if (validPins.length === 0) return null

  return (
    <div
      className={cn('rounded-xl overflow-hidden border', className)}
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={validPins.length > 1 ? 14 : 16}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {validPins.map((p, i) => (
          <Marker
            key={i}
            position={[p.latitude, p.longitude]}
            icon={buildIcon(PIN_COLOR[p.tone ?? 'primary'])}
            title={p.label}
          />
        ))}
      </MapContainer>
    </div>
  )
}
