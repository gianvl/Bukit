import { queryOptions } from '@tanstack/react-query'
import { upload } from '@vercel/blob/client'
import { api } from '@/lib/api'

export type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED'

export interface KycMe {
  status: KycStatus
  govIdType: string | null
  govIdNumber: string | null
  govIdImageUrl: string | null
  selfieUrl: string | null
  rejectionReason: string | null
  submittedAt: string | null
  reviewedAt: string | null
}

export const kycMeQueryOptions = queryOptions({
  queryKey: ['kyc', 'me'] as const,
  queryFn: () => api.get<KycMe>('/kyc/me'),
  staleTime: 30_000,
})

export interface SubmitKycInput {
  govIdType: string
  govIdNumber: string
  govIdImageUrl: string
  selfieUrl: string
}

export function submitKyc(input: SubmitKycInput) {
  return api.post<KycMe>('/kyc/submit', input)
}

/**
 * Uploads a single KYC document to Vercel Blob via a one-time token issued
 * by our API. Returns the public URL we then submit with `submitKyc`.
 *
 * The pathname is hard-prefixed with `kyc/{userId}/{kind}/...` server-side
 * for sandboxing; we just choose the "kind" segment + filename here.
 */
export async function uploadKycFile(
  file: File,
  kind: 'gov-id' | 'selfie',
  userId: string,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const pathname = `kyc/${userId}/${kind}/${safeName}`
  const blob = await upload(pathname, file, {
    access: 'public',
    handleUploadUrl: '/api/kyc/upload-token',
    contentType: file.type,
  })
  return blob.url
}
