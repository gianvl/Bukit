/**
 * Great-circle distance between two lat/lng points in kilometers.
 * Standard Haversine formula with Earth radius 6371 km.
 *
 * Accurate to within ~0.5% for points <1000 km apart, plenty for matching.
 */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return R * c
}

import { env } from '../env.js'

/**
 * Maximum kilometers between provider and customer for an on-demand match.
 * Defaults to 35 km — comfortably covers all of Metro Manila (Caloocan ↔
 * Las Piñas diagonal is ≈ 30 km) without bleeding far into Cavite/Bulacan.
 *
 * Overridable at runtime via the `ON_DEMAND_RADIUS_KM` env var (Railway).
 */
export const ON_DEMAND_RADIUS_KM = env.ON_DEMAND_RADIUS_KM ?? 35
