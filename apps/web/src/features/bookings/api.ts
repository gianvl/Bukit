import { api } from '@/lib/api'

export interface BookingAddressInput {
  line1: string
  line2?: string
  barangay?: string
  city: string
  province?: string
  postalCode?: string
  latitude?: number
  longitude?: number
}

export interface CreateBookingInput {
  serviceTierId: string
  scheduledAt: string
  address: BookingAddressInput
  notes?: string
}

export interface BookingSummary {
  id: string
  status: string
  scheduledAt: string
  durationMinutes: number
  addressLine1: string
  city: string
  totalCentavos: number
  createdAt: string
  serviceTier: { id: string; slug: string; name: string }
}

export function createBooking(input: CreateBookingInput) {
  return api.post<BookingSummary>('/bookings', input)
}

export function startCheckout(bookingId: string) {
  return api.post<{ checkoutId: string; checkoutUrl: string }>('/payments/checkout', {
    bookingId,
  })
}
