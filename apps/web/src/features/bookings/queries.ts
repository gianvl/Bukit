import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { BookingSummary } from './api'

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'IN_ESCROW'
  | 'CONFIRMED'
  | 'PROVIDER_ASSIGNED'
  | 'EN_ROUTE'
  | 'IN_PROGRESS'
  | 'PENDING_CASH_CONFIRM'
  | 'COMPLETED'
  | 'CANCELLED_BY_USER'
  | 'CANCELLED_BY_PROVIDER'
  | 'REFUNDED'

export type BookingEventType =
  | 'CREATED'
  | 'PAYMENT_AUTHORIZED'
  | 'PROVIDER_ASSIGNED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'STARTED'
  | 'CUSTOMER_CONFIRMED'
  | 'PROVIDER_CASH_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'NOTE'

export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED'

export interface BookingEvent {
  id: string
  type: BookingEventType
  payload: unknown
  createdAt: string
}

export interface BookingDetail extends BookingSummary {
  addressLine2: string | null
  barangay: string | null
  province: string
  postalCode: string | null
  latitude: number | null
  longitude: number | null
  notes: string | null
  basePriceCentavos: number
  events: BookingEvent[]
  payment: { status: PaymentStatus; amountCentavos: number } | null
  /** Which side is viewing — drives role-aware UI on the detail page. */
  viewerRole: 'CUSTOMER' | 'PROVIDER'
  /** Provider contact + lifetime rating — populated only when viewerRole=CUSTOMER and assigned. */
  provider: {
    name: string
    phoneNumber: string | null
    ratingAvg: number
    ratingCount: number
  } | null
  /** Customer contact — populated only when viewerRole=PROVIDER and accepted. */
  customer: { name: string; phoneNumber: string | null } | null
  /** Customer's review of this booking, if submitted. */
  myReview: { rating: number; comment: string | null; createdAt: string } | null
}

export interface BookingReview {
  rating: number
  comment: string | null
  createdAt: string
}

export function submitBookingReview(
  bookingId: string,
  input: { rating: number; comment?: string },
) {
  return api.post<BookingReview>(`/bookings/${bookingId}/review`, input)
}

export const bookingsListQueryOptions = queryOptions({
  queryKey: ['bookings'] as const,
  queryFn: () => api.get<{ bookings: BookingSummary[] }>('/bookings'),
  select: (data) => data.bookings,
  staleTime: 30_000,
})

export const bookingDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['bookings', id] as const,
    queryFn: () => api.get<BookingDetail>(`/bookings/${id}`),
    staleTime: 10_000,
  })

export interface ProviderLocation {
  latitude: number | null
  longitude: number | null
  lastLocationAt: string | null
  distanceKm: number | null
}

export const providerLocationQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['bookings', id, 'provider-location'] as const,
    queryFn: () => api.get<ProviderLocation>(`/bookings/${id}/provider-location`),
    // Polling removed in 20b — Socket.IO pushes updates into the cache.
    // The query still primes initial state on page load.
    staleTime: 30_000,
  })
