import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { KycStatus } from '@/features/kyc/api'

/* ─── Services / tiers ─────────────────────────────────────────────── */

export interface AdminTier {
  id: string
  slug: string
  name: string
  description: string
  basePriceCentavos: number
  estimatedMinutes: number
  sortOrder: number
  isActive: boolean
}

export interface AdminService {
  id: string
  slug: string
  name: string
  description: string
  iconKey: string
  sortOrder: number
  isActive: boolean
  tiers: AdminTier[]
}

export const adminServicesQueryOptions = queryOptions({
  queryKey: ['admin', 'services'] as const,
  queryFn: () => api.get<{ services: AdminService[] }>('/admin/services'),
  select: (data) => data.services,
  staleTime: 15_000,
})

export interface UpsertServiceInput {
  slug: string
  name: string
  description: string
  iconKey?: string
  sortOrder?: number
  isActive?: boolean
}

export function createService(input: UpsertServiceInput) {
  return api.post<AdminService>('/admin/services', input)
}

export function updateService(id: string, input: Partial<UpsertServiceInput>) {
  return api.patch<AdminService>(`/admin/services/${id}`, input)
}

export function deactivateService(id: string) {
  return api.delete<{ ok: true }>(`/admin/services/${id}`)
}

export interface UpsertTierInput {
  slug: string
  name: string
  description: string
  basePriceCentavos: number
  estimatedMinutes: number
  sortOrder?: number
  isActive?: boolean
}

export function createTier(serviceId: string, input: UpsertTierInput) {
  return api.post<AdminTier>(`/admin/services/${serviceId}/tiers`, input)
}

export function updateTier(tierId: string, input: Partial<UpsertTierInput>) {
  return api.patch<AdminTier>(`/admin/tiers/${tierId}`, input)
}

export function deactivateTier(tierId: string) {
  return api.delete<{ ok: true }>(`/admin/tiers/${tierId}`)
}

/* ─── KYC review queue ─────────────────────────────────────────────── */

export interface AdminKycSubmission {
  id: string
  user: {
    id: string
    name: string
    phoneNumber: string | null
    role: 'USER' | 'PROVIDER' | 'ADMIN'
  }
  status: KycStatus
  govIdType: string
  govIdNumber: string
  /** Auth-gated proxy paths. Use as `<img src>` against the same origin (Vercel rewrites to API). */
  govIdProxyPath: string
  selfieProxyPath: string
  rejectionReason: string | null
  submittedAt: string
  reviewedAt: string | null
}

export const adminKycQueryOptions = (status?: KycStatus) =>
  queryOptions({
    queryKey: ['admin', 'kyc', status ?? 'all'] as const,
    queryFn: () =>
      api.get<{ submissions: AdminKycSubmission[] }>('/admin/kyc', {
        searchParams: status ? { status } : undefined,
      }),
    select: (data) => data.submissions,
    staleTime: 10_000,
  })

export interface ReviewKycInput {
  status: 'APPROVED' | 'REJECTED'
  rejectionReason?: string
}

export function reviewKyc(submissionId: string, input: ReviewKycInput) {
  return api.post(`/admin/kyc/${submissionId}/review`, input)
}
