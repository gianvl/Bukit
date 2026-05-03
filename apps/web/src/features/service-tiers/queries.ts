import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface ServiceTier {
  id: string
  slug: string
  name: string
  description: string
  basePriceCentavos: number
  estimatedMinutes: number
  sortOrder: number
}

export const serviceTiersQueryOptions = queryOptions({
  queryKey: ['service-tiers'] as const,
  queryFn: () => api.get<{ tiers: ServiceTier[] }>('/service-tiers'),
  select: (data) => data.tiers,
  staleTime: 5 * 60_000,
})
