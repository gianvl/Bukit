import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type ProviderStatus = 'PENDING_KYC' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED'
export type AvailabilityMode = 'OFFLINE' | 'SCHEDULED_ONLY' | 'FULL'

export interface ProviderProfile {
  id: string
  status: ProviderStatus
  availabilityMode: AvailabilityMode
  bio: string | null
  ratingAvg: number
  ratingCount: number
  cities: string[]
  createdAt: string
}

export interface AssignedBooking {
  id: string
  status: string
  bookingMode: 'ON_DEMAND' | 'SCHEDULED'
  paymentMethod: 'ONLINE' | 'CASH'
  scheduledAt: string
  durationMinutes: number
  addressLine1: string
  city: string
  totalCentavos: number
  serviceTier: { id: string; slug: string; name: string }
  customerName: string
}

export const providerProfileQueryOptions = queryOptions({
  queryKey: ['provider', 'me'] as const,
  queryFn: async () => {
    try {
      return await api.get<ProviderProfile>('/providers/me')
    } catch (err) {
      // 404 means the caller hasn't applied yet — surface as null.
      if (
        err &&
        typeof err === 'object' &&
        'status' in err &&
        (err as { status: number }).status === 404
      ) {
        return null
      }
      throw err
    }
  },
  staleTime: 30_000,
})

export const assignedBookingsQueryOptions = queryOptions({
  queryKey: ['provider', 'me', 'bookings'] as const,
  queryFn: () => api.get<{ bookings: AssignedBooking[] }>('/providers/me/bookings'),
  select: (data) => data.bookings,
  staleTime: 15_000,
})

export const availableBookingsQueryOptions = queryOptions({
  queryKey: ['provider', 'me', 'available'] as const,
  queryFn: () => api.get<{ bookings: AssignedBooking[] }>('/providers/me/available-bookings'),
  select: (data) => data.bookings,
  staleTime: 10_000,
  refetchInterval: 15_000,
})

export function acceptBooking(bookingId: string) {
  return api.post<{ id: string; status: 'PROVIDER_ASSIGNED'; providerId: string }>(
    `/bookings/${bookingId}/accept`,
  )
}

export interface ApplyProviderInput {
  bio?: string
  cities?: string[]
}

export function applyAsProvider(input: ApplyProviderInput) {
  return api.post<ProviderProfile>('/providers/apply', input)
}

export function setAvailabilityMode(mode: AvailabilityMode) {
  return api.patch<ProviderProfile>('/providers/me/availability', { availabilityMode: mode })
}

/** Provider transitions PROVIDER_ASSIGNED → IN_PROGRESS. */
export function startBooking(bookingId: string) {
  return api.post<{ id: string; status: 'IN_PROGRESS' }>(`/bookings/${bookingId}/start`)
}

/** Provider confirms cash receipt for a PENDING_CASH_CONFIRM booking. */
export function confirmCashReceived(bookingId: string) {
  return api.post<{ id: string; status: 'COMPLETED' }>(`/bookings/${bookingId}/confirm-cash`)
}
