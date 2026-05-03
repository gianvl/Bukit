import type { FastifyInstance, FastifyError } from 'fastify'
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod'

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, _req, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
      } satisfies ApiErrorBody)
    }

    if (isResponseSerializationError(error)) {
      app.log.error({ err: error }, 'response serialization failed')
      return reply.status(500).send({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      } satisfies ApiErrorBody)
    }

    const status = error.statusCode ?? 500
    if (status >= 500) app.log.error({ err: error }, 'unhandled error')

    return reply.status(status).send({
      code: error.code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
      message: status >= 500 ? 'Internal server error' : error.message,
    } satisfies ApiErrorBody)
  })
}
