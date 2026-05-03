const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  searchParams?: Record<string, string | number | boolean | undefined>
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, searchParams, headers, ...rest } = options

  const url = new URL(path, API_URL)
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }

  // Only set Content-Type when we actually have a JSON body. Fastify rejects
  // empty bodies sent with application/json (e.g. POST /bookings/:id/accept).
  const hasBody = body !== undefined
  const baseHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
  }

  let res: Response
  try {
    res = await fetch(url, {
      ...rest,
      credentials: 'include',
      headers: { ...baseHeaders, ...headers },
      body: hasBody ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    // Network-level failure (server down, DNS, offline). Map to a typed
    // ApiError so the UI can show a friendlier "API offline" state.
    throw new ApiError(0, 'NETWORK_OFFLINE', 'Could not reach the Bukit API', {
      cause: err instanceof Error ? err.message : String(err),
    })
  }

  if (res.status === 204) return undefined as T

  const contentType = res.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json') ? await res.json() : await res.text()

  if (!res.ok) {
    const payload = (data ?? {}) as { code?: string; message?: string; details?: unknown }
    throw new ApiError(
      res.status,
      payload.code ?? 'UNKNOWN',
      payload.message ?? res.statusText,
      payload.details,
    )
  }

  return data as T
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
}
