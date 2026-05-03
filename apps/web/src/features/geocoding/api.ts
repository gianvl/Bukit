import { api } from '@/lib/api'

export interface Place {
  id: string
  latitude: number
  longitude: number
  displayName: string
  line1: string
  barangay: string | null
  city: string
  postalCode: string | null
}

export function searchPlaces(q: string) {
  return api.get<{ places: Place[] }>('/geocoding/search', { searchParams: { q } })
}

export function reverseGeocode(lat: number, lng: number) {
  return api.get<Place>('/geocoding/reverse', { searchParams: { lat, lng } })
}
