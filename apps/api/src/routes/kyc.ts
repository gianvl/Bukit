import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { prisma } from '../lib/prisma.js'
import { requireRole, requireSession } from '../lib/auth-fastify.js'
import { env } from '../env.js'

/**
 * KYC = one government ID photo + one selfie per user. Admin reviews from
 * `/admin/kyc` and clicks Approve / Reject (with reason). Customer-side
 * gating (block booking until approved) is enforced in `bookings.ts`.
 *
 * Files don't transit Fastify — the browser uploads directly to Vercel
 * Blob using a one-time token issued here. That keeps Railway free of
 * multipart handling and avoids the platform's body-size cap.
 */

const KycStatusEnum = z.enum(['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'])

const KycDto = z.object({
  status: KycStatusEnum,
  govIdType: z.string().nullable(),
  govIdNumber: z.string().nullable(),
  govIdImageUrl: z.string().nullable(),
  selfieUrl: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
})

const SubmitKycBody = z.object({
  govIdType: z.string().min(2).max(40),
  govIdNumber: z.string().min(2).max(40),
  govIdImageUrl: z.url(),
  selfieUrl: z.url(),
})

const ReviewKycBody = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().max(500).optional(),
})

const AdminKycListItem = z.object({
  id: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    phoneNumber: z.string().nullable(),
    role: z.enum(['USER', 'PROVIDER', 'ADMIN']),
  }),
  status: KycStatusEnum,
  govIdType: z.string(),
  govIdNumber: z.string(),
  govIdImageUrl: z.string(),
  selfieUrl: z.string(),
  rejectionReason: z.string().nullable(),
  submittedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
})

export const kycRoutes: FastifyPluginAsyncZod = async (app) => {
  /**
   * Browser asks for a Vercel Blob upload token. We constrain the path
   * (`kyc/{userId}/...`) and content type so a malicious client can't
   * upload arbitrary files outside their KYC folder.
   *
   * The body shape is dictated by Vercel's `handleUpload` helper — it's
   * a discriminated union of "blob.generate-client-token" and
   * "blob.upload-completed" events.
   */
  app.post(
    '/kyc/upload-token',
    {
      // Body is opaque to us — Vercel's helper validates it.
      schema: { body: z.unknown() },
    },
    async (req, reply) => {
      const session = requireSession(req)
      if (!env.BLOB_READ_WRITE_TOKEN) {
        throw app.httpErrors.serviceUnavailable('Uploads not configured')
      }
      const userId = session.user.id

      // @vercel/blob/client expects a web `Request`, but Fastify gives us
      // a Node `IncomingMessage`. Convert so handleUpload computes the
      // signed-token URL against the real public origin (otherwise the
      // browser ends up PUT-ing to an invalid URL like
      // `https://vercel.com/api/blob/?pathname=…` and gets a 400).
      const protocol =
        (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol
      const host = req.headers.host ?? 'localhost'
      const webHeaders = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') webHeaders.set(key, value)
      }
      const webRequest = new Request(`${protocol}://${host}${req.url}`, {
        method: req.method,
        headers: webHeaders,
        body: JSON.stringify(req.body ?? {}),
      })

      try {
        const result = await handleUpload({
          body: req.body as HandleUploadBody,
          request: webRequest,
          token: env.BLOB_READ_WRITE_TOKEN,
          onBeforeGenerateToken: async (pathname, _clientPayload) => {
            // Sandbox each user's uploads so the URL someone receives can
            // only be used to write into their own folder.
            if (!pathname.startsWith(`kyc/${userId}/`)) {
              throw new Error(`pathname must start with kyc/${userId}/`)
            }
            return {
              allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
              maximumSizeInBytes: 8 * 1024 * 1024, // 8 MB
              addRandomSuffix: true,
              tokenPayload: JSON.stringify({ userId }),
            }
          },
          onUploadCompleted: async () => {
            // No-op for now — actual KYC submission happens via /kyc/submit.
            // We could log here for telemetry if needed.
          },
        })
        return reply.send(result)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload token failed'
        throw app.httpErrors.badRequest(message)
      }
    },
  )

  /** Returns the caller's own KYC state (for the /kyc page). */
  app.get(
    '/kyc/me',
    { schema: { response: { 200: KycDto } } },
    async (req) => {
      const session = requireSession(req)
      const sub = await prisma.kycSubmission.findUnique({
        where: { userId: session.user.id },
      })
      if (!sub) {
        return {
          status: 'NOT_SUBMITTED' as const,
          govIdType: null,
          govIdNumber: null,
          govIdImageUrl: null,
          selfieUrl: null,
          rejectionReason: null,
          submittedAt: null,
          reviewedAt: null,
        }
      }
      return {
        status: sub.status,
        govIdType: sub.govIdType,
        govIdNumber: sub.govIdNumber,
        govIdImageUrl: sub.govIdImageUrl,
        selfieUrl: sub.selfieUrl,
        rejectionReason: sub.rejectionReason,
        submittedAt: sub.submittedAt.toISOString(),
        reviewedAt: sub.reviewedAt?.toISOString() ?? null,
      }
    },
  )

  /**
   * Submit (or resubmit after a rejection). Always lands the user in
   * PENDING regardless of prior state — admin must review every change.
   */
  app.post(
    '/kyc/submit',
    {
      schema: {
        body: SubmitKycBody,
        response: { 201: KycDto, 200: KycDto },
      },
    },
    async (req, reply) => {
      const session = requireSession(req)
      const userId = session.user.id

      const data = {
        status: 'PENDING' as const,
        govIdType: req.body.govIdType.trim(),
        govIdNumber: req.body.govIdNumber.trim(),
        govIdImageUrl: req.body.govIdImageUrl,
        selfieUrl: req.body.selfieUrl,
        rejectionReason: null,
        reviewedAt: null,
        reviewedById: null,
      }

      const sub = await prisma.$transaction(async (tx) => {
        const existing = await tx.kycSubmission.findUnique({ where: { userId } })
        const upserted = await tx.kycSubmission.upsert({
          where: { userId },
          create: { ...data, userId, submittedAt: new Date() },
          update: { ...data, submittedAt: new Date() },
        })
        // Mirror onto User.kycStatus so booking gates can check a single
        // column without joining.
        await tx.user.update({
          where: { id: userId },
          data: { kycStatus: 'PENDING' },
        })
        return { sub: upserted, isNew: !existing }
      })

      reply.status(sub.isNew ? 201 : 200)
      return {
        status: sub.sub.status,
        govIdType: sub.sub.govIdType,
        govIdNumber: sub.sub.govIdNumber,
        govIdImageUrl: sub.sub.govIdImageUrl,
        selfieUrl: sub.sub.selfieUrl,
        rejectionReason: sub.sub.rejectionReason,
        submittedAt: sub.sub.submittedAt.toISOString(),
        reviewedAt: sub.sub.reviewedAt?.toISOString() ?? null,
      }
    },
  )

  /* ─── Admin review queue ─────────────────────────────────────────── */

  app.get(
    '/admin/kyc',
    {
      schema: {
        querystring: z.object({
          status: KycStatusEnum.optional(),
        }),
        response: { 200: z.object({ submissions: z.array(AdminKycListItem) }) },
      },
    },
    async (req) => {
      requireRole(req, 'ADMIN')
      const subs = await prisma.kycSubmission.findMany({
        where: req.query.status ? { status: req.query.status } : undefined,
        orderBy: { submittedAt: 'asc' },
        take: 100,
        include: {
          user: { select: { id: true, name: true, phoneNumber: true, role: true } },
        },
      })
      return {
        submissions: subs.map((s) => ({
          id: s.id,
          user: {
            id: s.user.id,
            name: s.user.name,
            phoneNumber: s.user.phoneNumber,
            role: s.user.role,
          },
          status: s.status,
          govIdType: s.govIdType,
          govIdNumber: s.govIdNumber,
          govIdImageUrl: s.govIdImageUrl,
          selfieUrl: s.selfieUrl,
          rejectionReason: s.rejectionReason,
          submittedAt: s.submittedAt.toISOString(),
          reviewedAt: s.reviewedAt?.toISOString() ?? null,
        })),
      }
    },
  )

  app.post(
    '/admin/kyc/:id/review',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: ReviewKycBody,
        response: { 200: KycDto },
      },
    },
    async (req) => {
      const session = requireRole(req, 'ADMIN')
      if (req.body.status === 'REJECTED' && !req.body.rejectionReason) {
        throw app.httpErrors.badRequest('rejectionReason is required when rejecting')
      }

      const sub = await prisma.kycSubmission.findUnique({
        where: { id: req.params.id },
      })
      if (!sub) throw app.httpErrors.notFound('Submission not found')

      const now = new Date()
      const updated = await prisma.$transaction(async (tx) => {
        const s = await tx.kycSubmission.update({
          where: { id: sub.id },
          data: {
            status: req.body.status,
            rejectionReason:
              req.body.status === 'REJECTED' ? (req.body.rejectionReason ?? null) : null,
            reviewedById: session.user.id,
            reviewedAt: now,
          },
        })
        await tx.user.update({
          where: { id: sub.userId },
          data: { kycStatus: req.body.status },
        })
        return s
      })

      return {
        status: updated.status,
        govIdType: updated.govIdType,
        govIdNumber: updated.govIdNumber,
        govIdImageUrl: updated.govIdImageUrl,
        selfieUrl: updated.selfieUrl,
        rejectionReason: updated.rejectionReason,
        submittedAt: updated.submittedAt.toISOString(),
        reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      }
    },
  )
}
