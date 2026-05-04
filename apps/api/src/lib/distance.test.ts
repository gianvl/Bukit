import { describe, expect, it } from 'vitest'
import { haversineKm, ON_DEMAND_RADIUS_KM } from './distance.js'

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    const p = { lat: 14.5547, lng: 121.0244 } // BGC
    expect(haversineKm(p, p)).toBe(0)
  })

  it('is symmetric', () => {
    const a = { lat: 14.5547, lng: 121.0244 } // BGC
    const b = { lat: 14.5547, lng: 121.0507 } // Pasig
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6)
  })

  it('approximates BGC ↔ Makati at ~3 km', () => {
    const bgc = { lat: 14.5547, lng: 121.0244 }
    const makati = { lat: 14.5547, lng: 121.0244 - 0.027 } // ~3km west at this latitude
    const km = haversineKm(bgc, makati)
    expect(km).toBeGreaterThan(2.5)
    expect(km).toBeLessThan(3.5)
  })

  it('approximates Manila ↔ Cebu at ~570 km (within ±10 km)', () => {
    const manila = { lat: 14.5995, lng: 120.9842 }
    const cebu = { lat: 10.3157, lng: 123.8854 }
    const km = haversineKm(manila, cebu)
    expect(km).toBeGreaterThan(560)
    expect(km).toBeLessThan(580)
  })

  it('handles antipodes (Manila ↔ opposite point) close to half the circumference', () => {
    const manila = { lat: 14.5995, lng: 120.9842 }
    const antipode = { lat: -14.5995, lng: 120.9842 - 180 }
    const km = haversineKm(manila, antipode)
    // Earth's circumference / 2 ≈ 20,015 km
    expect(km).toBeGreaterThan(19_500)
    expect(km).toBeLessThan(20_100)
  })

  it('on-demand radius covers the Metro Manila diagonal', () => {
    // Caloocan (north tip) ↔ Las Piñas (south tip) is ≈ 30 km. The radius
    // must clear that comfortably but not bleed deep into Cavite/Bulacan.
    expect(ON_DEMAND_RADIUS_KM).toBeGreaterThanOrEqual(30)
    expect(ON_DEMAND_RADIUS_KM).toBeLessThanOrEqual(50)
  })
})
