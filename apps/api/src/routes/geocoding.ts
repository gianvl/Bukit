import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireSession } from '../lib/auth-fastify.js'

/**
 * Lightweight proxy to Nominatim (OpenStreetMap geocoder).
 *
 * Nominatim's usage policy requires a custom User-Agent and limits direct
 * browser usage. We proxy through Fastify so we can identify ourselves and
 * shield API keys (none today, but easy to swap for Mapbox later).
 *
 * Results restricted to the Philippines (countrycodes=ph) since Bukit
 * operates in Metro Manila.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const USER_AGENT = 'BukitApp/0.1 (https://bukit.ph)'

interface NominatimAddress {
  house_number?: string
  road?: string
  neighbourhood?: string
  suburb?: string
  quarter?: string
  village?: string
  town?: string
  municipality?: string
  city?: string
  city_district?: string
  county?: string
  state?: string
  postcode?: string
  country?: string
}

interface NominatimResult {
  place_id?: number
  lat: string
  lon: string
  display_name: string
  address?: NominatimAddress
}

const PlaceDto = z.object({
  /** Stable id from the upstream; useful as a React key. */
  id: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  /** Full one-line address suitable for display. */
  displayName: z.string(),
  /** Best-effort split into our address fields (filled from `address` block). */
  line1: z.string(),
  barangay: z.string().nullable(),
  city: z.string(),
  postalCode: z.string().nullable(),
})

function pickCity(a: NominatimAddress | undefined): string {
  return a?.city ?? a?.town ?? a?.village ?? a?.county ?? a?.state ?? ''
}

function pickLine1(a: NominatimAddress | undefined, displayName: string): string {
  if (!a) return displayName
  const street = [a.house_number, a.road].filter(Boolean).join(' ').trim()
  if (street) return street
  return displayName.split(',')[0]?.trim() ?? displayName
}

function toDto(r: NominatimResult): z.infer<typeof PlaceDto> {
  return {
    id: r.place_id != null ? String(r.place_id) : `${r.lat},${r.lon}`,
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    displayName: r.display_name,
    line1: pickLine1(r.address, r.display_name),
    barangay: r.address?.suburb ?? r.address?.neighbourhood ?? null,
    city: pickCity(r.address),
    postalCode: r.address?.postcode ?? null,
  }
}

async function nominatim<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${NOMINATIM}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Nominatim ${path} failed: ${res.status} ${body.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

export const geocodingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/geocoding/search',
    {
      schema: {
        querystring: z.object({
          q: z.string().min(2).max(200),
        }),
        response: { 200: z.object({ places: z.array(PlaceDto) }) },
      },
    },
    async (req) => {
      // Auth-required so we don't expose a free geocoding proxy to the world.
      requireSession(req)
      const results = await nominatim<NominatimResult[]>('/search', {
        q: req.query.q,
        format: 'json',
        countrycodes: 'ph',
        limit: '5',
        addressdetails: '1',
      })
      return { places: results.map(toDto) }
    },
  )

  app.get(
    '/geocoding/reverse',
    {
      schema: {
        querystring: z.object({
          lat: z.coerce.number().min(-90).max(90),
          lng: z.coerce.number().min(-180).max(180),
        }),
        response: { 200: PlaceDto },
      },
    },
    async (req) => {
      requireSession(req)
      const result = await nominatim<NominatimResult>('/reverse', {
        lat: String(req.query.lat),
        lon: String(req.query.lng),
        format: 'json',
        addressdetails: '1',
      })
      return toDto(result)
    },
  )
}
