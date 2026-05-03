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
  staleTime: 30_000,
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
