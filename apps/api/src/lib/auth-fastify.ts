import type { FastifyInstance, FastifyRequest } from 'fastify'
import { auth, type Session } from './auth.js'

declare module 'fastify' {
  interface FastifyRequest {
    session: Session | null
  }
}

function toWebRequest(req: FastifyRequest): Request {
  const protocol = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol
  const host = req.headers.host ?? 'localhost'
  const url = `${protocol}://${host}${req.url}`

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else {
      headers.set(key, String(value))
    }
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const body = hasBody && req.body !== undefined ? JSON.stringify(req.body) : undefined

  return new Request(url, {
    method: req.method,
    headers,
    body,
  })
}

/**
 * Mounts Better-Auth at /api/auth/* and decorates every request with
 * `req.session` (null if unauthenticated).
 */
export async function registerAuth(app: FastifyInstance) {
  app.decorateRequest('session', null)

  app.addHook('preHandler', async (req) => {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value)
    }
    req.session = await auth.api.getSession({ headers })
  })

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(req, reply) {
      const response = await auth.handler(toWebRequest(req))
      reply.status(response.status)
      response.headers.forEach((value, key) => {
        reply.header(key, value)
      })
      const text = await response.text()
      return reply.send(text || null)
    },
  })
}

export function requireSession(req: FastifyRequest): Session {
  if (!req.session) {
    const err = new Error('Unauthorized') as Error & { statusCode?: number; code?: string }
    err.statusCode = 401
    err.code = 'UNAUTHORIZED'
    throw err
  }
  return req.session
}

export function requireRole(req: FastifyRequest, ...roles: Array<'USER' | 'PROVIDER' | 'ADMIN'>): Session {
  const session = requireSession(req)
  const userRole = (session.user as { role?: string }).role ?? 'USER'
  if (!roles.includes(userRole as 'USER' | 'PROVIDER' | 'ADMIN')) {
    const err = new Error('Forbidden') as Error & { statusCode?: number; code?: string }
    err.statusCode = 403
    err.code = 'FORBIDDEN'
    throw err
  }
  return session
}
