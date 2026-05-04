import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Role = 'USER' | 'PROVIDER' | 'ADMIN'

export interface Me {
  id: string
  name: string
  role: Role
  phoneNumber: string | null
  phoneNumberVerified: boolean
  onboardedAt: string | null
}

export const meQueryOptions = queryOptions({
  queryKey: ['me'] as const,
  queryFn: async () => {
    try {
      return await api.get<Me>('/me')
    } catch (err) {
      // Anonymous → null instead of throwing so consumers can branch on it.
      if (
        err &&
        typeof err === 'object' &&
        'status' in err &&
        ((err as { status: number }).status === 401 ||
          (err as { status: number }).status === 403)
      ) {
        return null
      }
      throw err
    }
  },
  staleTime: 60_000,
})

export interface OnboardingInput {
  name: string
  role: 'USER' | 'PROVIDER'
  cities?: string[]
  bio?: string
}

export function submitOnboarding(input: OnboardingInput) {
  return api.post<Me>('/me/onboarding', input)
}

export interface CustomerStats {
  totalBookings: number
  completedBookings: number
  cancelledBookings: number
  totalSpentCentavos: number
  lastBookingAt: string | null
}

export interface ProviderStats {
  totalJobs: number
  completedJobs: number
  totalEarnedCentavos: number
  jobsThisWeek: number
  ratingAvg: number
  ratingCount: number
}

export interface MeStats {
  customer: CustomerStats
  provider: ProviderStats | null
}

export const meStatsQueryOptions = queryOptions({
  queryKey: ['me', 'stats'] as const,
  queryFn: () => api.get<MeStats>('/me/stats'),
  staleTime: 60_000,
})

export interface MyReview {
  id: string
  bookingId: string
  rating: number
  comment: string | null
  createdAt: string
  customerName: string
  serviceTierName: string
}

export interface MyReviewsResponse {
  ratingAvg: number
  ratingCount: number
  reviews: MyReview[]
}

export const myReviewsQueryOptions = queryOptions({
  queryKey: ['me', 'reviews'] as const,
  queryFn: () => api.get<MyReviewsResponse>('/me/reviews'),
  staleTime: 60_000,
})
