import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2, MapPin, Navigation, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { reverseGeocode, searchPlaces, type Place } from '@/features/geocoding/api'
import { cn } from '@/lib/utils'

/**
 * Grab-style address picker. Three input modes share one pin:
 *   1. Search (debounced autocomplete against Nominatim via our proxy)
 *   2. Browser geolocation ("Use my location")
 *   3. Drag the marker or click anywhere on the map
 *
 * After any input the picked coordinates are reverse-geocoded so the form
 * shows a real address — we never trust the user's free-text typing alone.
 */

export interface PickedLocation {
  latitude: number
  longitude: number
  displayName: string
  line1: string
  barangay: string | null
  city: string
  postalCode: string | null
}

interface LocationPickerProps {
  value: PickedLocation | null
  onChange: (loc: PickedLocation) => void
  className?: string
}

const BGC_CENTER: [number, number] = [14.5547, 121.0244]
const PIN_COLOR = 'oklch(0.596 0.145 163.225)' // matches --primary

const PIN_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 44" width="32" height="44">
    <ellipse cx="16" cy="42" rx="6" ry="1.6" fill="rgba(15,23,42,0.25)" />
    <path d="M16 0c-8.84 0-16 7.16-16 16 0 11 16 28 16 28s16-17 16-28C32 7.16 24.84 0 16 0z" fill="${PIN_COLOR}" />
    <circle cx="16" cy="16" r="6" fill="white" />
  </svg>
`.trim()

const PIN_ICON = L.divIcon({
  html: PIN_SVG,
  iconSize: [32, 44],
  iconAnchor: [16, 44],
  className: 'bukit-map-pin',
})

function placeToPicked(p: Place): PickedLocation {
  return {
    latitude: p.latitude,
    longitude: p.longitude,
    displayName: p.displayName,
    line1: p.line1,
    barangay: p.barangay,
    city: p.city,
    postalCode: p.postalCode,
  }
}

export function LocationPicker({ value, onChange, className }: LocationPickerProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'denied'>('idle')
  const [reverseLoading, setReverseLoading] = useState(false)
  const reverseAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(id)
  }, [query])

  const search = useQuery({
    queryKey: ['geocoding', 'search', debounced],
    queryFn: () => searchPlaces(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  })

  // Reverse-geocode whenever the pin moves via map interaction (not search).
  async function applyCoords(lat: number, lng: number) {
    reverseAbort.current?.abort()
    const ctrl = new AbortController()
    reverseAbort.current = ctrl
    setReverseLoading(true)
    try {
      const place = await reverseGeocode(lat, lng)
      if (ctrl.signal.aborted) return
      onChange(placeToPicked(place))
    } catch {
      // Fall back to raw coords so the user is never stuck without a value.
      if (ctrl.signal.aborted) return
      onChange({
        latitude: lat,
        longitude: lng,
        displayName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        line1: 'Pinned location',
        barangay: null,
        city: '',
        postalCode: null,
      })
    } finally {
      if (!ctrl.signal.aborted) setReverseLoading(false)
    }
  }

  function handleUseMyLocation() {
    if (!('geolocation' in navigator)) {
      setGeoState('denied')
      return
    }
    setGeoState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoState('idle')
        void applyCoords(pos.coords.latitude, pos.coords.longitude)
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  function handlePickResult(place: Place) {
    setShowResults(false)
    setQuery(place.displayName)
    onChange(placeToPicked(place))
  }

  const center = useMemo<[number, number]>(
    () => (value ? [value.latitude, value.longitude] : BGC_CENTER),
    // Only use the initial value to seed the map center once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search bar with autocomplete */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search for a building, street, or landmark"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShowResults(true)
            }}
            onFocus={() => setShowResults(true)}
            className="pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setShowResults(false)
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {showResults && debounced.length >= 2 && (
          <div className="absolute z-[1102] mt-1 w-full rounded-lg border bg-background shadow-lg overflow-hidden">
            {search.isPending ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Searching…
              </div>
            ) : search.isError ? (
              <div className="px-3 py-3 text-sm text-destructive">
                Couldn’t reach the search service.
              </div>
            ) : !search.data || search.data.places.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground">
                No matches in the Philippines for “{debounced}”.
              </div>
            ) : (
              <ul className="max-h-72 overflow-auto py-1">
                {search.data.places.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handlePickResult(p)}
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <MapPin className="size-4 text-primary mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{p.line1}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {p.displayName}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative rounded-xl overflow-hidden border" style={{ height: '18rem' }}>
        <MapContainer
          center={center}
          zoom={value ? 17 : 13}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapInteraction value={value} onPickCoords={applyCoords} />
        </MapContainer>

        {/* Floating "Use my location" */}
        <div className="absolute right-3 bottom-3 z-[1000]">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleUseMyLocation}
            disabled={geoState === 'loading'}
            className="shadow-md"
          >
            {geoState === 'loading' ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Locating…
              </>
            ) : (
              <>
                <Navigation className="size-3.5" />
                Use my location
              </>
            )}
          </Button>
        </div>

        {reverseLoading && (
          <div className="absolute left-3 top-3 z-[1000] inline-flex items-center gap-2 rounded-full bg-background/90 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="size-3 animate-spin" />
            Looking up address…
          </div>
        )}
      </div>

      {geoState === 'denied' && (
        <p className="text-xs text-destructive">
          Location permission was denied. You can still drag the pin or search above.
        </p>
      )}

      {/* Selected address summary */}
      {value ? (
        <div className="rounded-xl border bg-primary/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{value.line1}</div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {value.displayName}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {value.barangay && <span>Brgy {value.barangay}</span>}
                {value.city && <span>{value.city}</span>}
                {value.postalCode && <span>{value.postalCode}</span>}
                <span className="tabular-nums">
                  {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Search above, tap “Use my location”, or drop a pin by tapping the map.
        </p>
      )}
    </div>
  )
}

/**
 * Inner child that has access to the Leaflet map instance.
 * Handles click-to-drop, marker dragging, and panning when the picked value
 * is set externally (e.g. from a search result).
 */
function MapInteraction({
  value,
  onPickCoords,
}: {
  value: PickedLocation | null
  onPickCoords: (lat: number, lng: number) => void
}) {
  const map = useMap()

  useMapEvents({
    click(e) {
      onPickCoords(e.latlng.lat, e.latlng.lng)
    },
  })

  // When the picked value changes (e.g. via search), pan/zoom into it.
  useEffect(() => {
    if (!value) return
    map.flyTo([value.latitude, value.longitude], Math.max(map.getZoom(), 17), {
      duration: 0.6,
    })
  }, [value?.latitude, value?.longitude, map])

  if (!value) return null

  return (
    <Marker
      position={[value.latitude, value.longitude]}
      icon={PIN_ICON}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const m = e.target as L.Marker
          const { lat, lng } = m.getLatLng()
          onPickCoords(lat, lng)
        },
      }}
    />
  )
}
