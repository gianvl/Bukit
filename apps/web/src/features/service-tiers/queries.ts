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

export interface ServiceWithTiers {
  id: string
  slug: string
  name: string
  description: string
  iconKey: string
  sortOrder: number
  isActive: boolean
  tiers: ServiceTier[]
}

/**
 * Customer-facing catalog. Returns active services with their active
 * tiers nested. Replaced the old flat `/service-tiers` endpoint when the
 * admin-managed multi-service catalog landed.
 */
export const servicesQueryOptions = queryOptions({
  queryKey: ['services'] as const,
  queryFn: () => api.get<{ services: ServiceWithTiers[] }>('/services'),
  select: (data) => data.services,
  staleTime: 5 * 60_000,
})

/**
 * Flattened tier list, derived from the nested services payload. Useful
 * for legacy lookups (e.g. /book/$tierSlug resolving by slug).
 */
export const allTiersQueryOptions = queryOptions({
  queryKey: ['services', 'tiers-flat'] as const,
  queryFn: () => api.get<{ services: ServiceWithTiers[] }>('/services'),
  select: (data) => data.services.flatMap((s) => s.tiers),
  staleTime: 5 * 60_000,
})
