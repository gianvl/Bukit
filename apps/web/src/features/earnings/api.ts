import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type PayoutMethodType = 'GCASH' | 'BANK'
export type PayoutStatus = 'PENDING' | 'PAID' | 'VOID'

export interface PayoutMethod {
  id: string
  type: PayoutMethodType
  holderName: string
  /** Server-masked, e.g. "•••• 4321". Never includes the full number. */
  accountIdentifierMasked: string
  bankCode: string | null
  createdAt: string
  updatedAt: string
}

export interface PayoutHistoryEntry {
  id: string
  bookingId: string
  status: PayoutStatus
  grossCentavos: number
  feeCentavos: number
  netCentavos: number
  eligibleAt: string
  paidAt: string | null
  referenceCode: string | null
  createdAt: string
  booking: {
    serviceTierName: string
    scheduledAt: string
    paymentMethod: 'ONLINE' | 'CASH'
  }
}

export interface Earnings {
  pendingCentavos: number
  availableCentavos: number
  paidLifetimeCentavos: number
  cashOwedCentavos: number
  minPayoutCentavos: number
  payoutMethod: PayoutMethod | null
  history: PayoutHistoryEntry[]
}

export const earningsQueryOptions = queryOptions({
  queryKey: ['earnings'] as const,
  queryFn: () => api.get<Earnings>('/me/earnings'),
  staleTime: 15_000,
})

export interface UpsertPayoutMethodInput {
  type: PayoutMethodType
  holderName: string
  accountIdentifier: string
  bankCode?: string
}

export function upsertPayoutMethod(input: UpsertPayoutMethodInput) {
  return api.put<PayoutMethod>('/me/payout-method', input)
}

export interface RequestPayoutResult {
  ok: true
  availableCentavos: number
}

export function requestPayout() {
  return api.post<RequestPayoutResult>('/me/payouts/request')
}
