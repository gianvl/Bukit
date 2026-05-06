import { queryOptions } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'

export type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED'

export interface KycMe {
  status: KycStatus
  govIdType: string | null
  govIdNumber: string | null
  /** Whether the photo is on file. Bytes are served through `/api/kyc/photo/:id/:kind` (auth-gated). */
  hasGovIdImage: boolean
  hasSelfie: boolean
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
 * Uploads a single KYC document via our API as multipart/form-data. The
 * server relays it to Vercel Blob and returns the public URL. We then
 * pass that URL to `submitKyc`.
 */
export async function uploadKycFile(
  file: File,
  kind: 'gov-id' | 'selfie',
): Promise<string> {
  const formData = new FormData()
  formData.append('file', file, file.name)

  // We can't use the `api.post` helper because it stringifies the body as
  // JSON; multipart uploads need the raw FormData and must NOT set a
  // Content-Type (the browser fills in the boundary). Reach for fetch
  // directly so the upload goes via the same Vercel rewrite + cookies
  // as the rest of the API.
  const url = `/api/kyc/upload?kind=${encodeURIComponent(kind)}`
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  if (!res.ok) {
    let message = `Upload failed (${res.status})`
    try {
      const body = (await res.json()) as { message?: string; code?: string }
      if (body.message) message = body.message
    } catch {
      // ignore — fall through to the generic message
    }
    throw new ApiError(res.status, 'UPLOAD_FAILED', message)
  }

  const json = (await res.json()) as { url: string }
  return json.url
}
