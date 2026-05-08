import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { put } from '@vercel/blob'
import { prisma } from '../lib/prisma.js'
import { requireRole, requireSession } from '../lib/auth-fastify.js'
import { env } from '../env.js'

/**
 * KYC = one government ID photo + one selfie per user. Admin reviews from
 * `/admin/kyc` and clicks Approve / Reject (with reason). Customer-side
 * gating (block booking until approved) is enforced in `bookings.ts`.
 *
 * Privacy model: photos live in a Vercel Blob *private* store, so the
 * upstream URL (`*.private.blob.vercel-storage.com/...`) requires the
 * BLOB_READ_WRITE_TOKEN to read. We never return that URL to clients.
 * Instead, GET /kyc/photo/:submissionId/:kind streams the bytes through
 * an auth-gated proxy: only the submission's owner or an admin can fetch.
 */

const KycStatusEnum = z.enum(['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'])

const KycDto = z.object({
  status: KycStatusEnum,
  govIdType: z.string().nullable(),
  govIdNumber: z.string().nullable(),
  /** True iff the photo is on file. Bytes are served via /kyc/photo/:id/:kind. */
  hasGovIdImage: z.boolean(),
  hasSelfie: z.boolean(),
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
  /** Auth-gated proxy paths admin UI uses as <img src>. Raw blob URLs are never sent to the client. */
  govIdProxyPath: z.string(),
  selfieProxyPath: z.string(),
  rejectionReason: z.string().nullable(),
  submittedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
})

type PhotoKind = 'gov-id' | 'selfie'

function proxyPath(submissionId: string, kind: PhotoKind): string {
  return `/kyc/photo/${submissionId}/${kind}`
}

export const kycRoutes: FastifyPluginAsyncZod = async (app) => {
  /**
   * Server-side photo upload. Browser POSTs the file as multipart/form-data
   * with a `kind` query param (gov-id | selfie); we relay it to Vercel
   * Blob server-side and return the public URL.
   *
   * Why server-side instead of @vercel/blob/client.upload(): the client
   * flow needs the SDK to derive a public origin from the inbound
   * request, and behind Railway's proxy + Vercel's rewrite that origin
   * is unreliable. Server-side uploads sidestep all of that — at the
   * cost of one extra hop through the API, which is fine for a 2-3 MB
   * KYC photo.
   */
  app.post(
    '/kyc/upload',
    {
      schema: {
        querystring: z.object({ kind: z.enum(['gov-id', 'selfie']) }),
        response: { 200: z.object({ url: z.string() }) },
      },
    },
    async (req) => {
      const session = requireSession(req)
      if (!env.BLOB_READ_WRITE_TOKEN) {
        throw app.httpErrors.serviceUnavailable('Uploads not configured')
      }

      try {
        const file = await req.file()
        if (!file) throw app.httpErrors.badRequest('No file uploaded')
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          throw app.httpErrors.badRequest('Only JPEG, PNG, or WebP images')
        }

        const buffer = await file.toBuffer()
        // Multipart's stream-level limit catches huge files first; this is a
        // belt-and-braces check after we've buffered the bytes.
        if (buffer.byteLength > 8 * 1024 * 1024) {
          throw app.httpErrors.payloadTooLarge('File exceeds 8 MB limit')
        }

        // Path: kyc/{userId}/{kind}/{filename}. addRandomSuffix prevents two
        // uploads with the same source filename from clobbering each other.
        const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const pathname = `kyc/${session.user.id}/${req.query.kind}/${safeName}`

        req.log.info(
          {
            userId: session.user.id,
            kind: req.query.kind,
            filename: safeName,
            mimetype: file.mimetype,
            sizeBytes: buffer.byteLength,
          },
          'kyc.upload: starting Vercel Blob put',
        )

        // `access: 'private'` on a Vercel Blob private store. The returned
        // URL is on `*.private.blob.vercel-storage.com` and requires the
        // BLOB_READ_WRITE_TOKEN to read. The SDK type defs in 2.3.x only
        // list 'public', so cast to suppress — the runtime accepts it.
        const blob = await put(pathname, buffer, {
          access: 'private' as 'public',
          token: env.BLOB_READ_WRITE_TOKEN,
          contentType: file.mimetype,
          addRandomSuffix: true,
        })
        req.log.info({ url: blob.url }, 'kyc.upload: blob put ok')
        return { url: blob.url }
      } catch (err) {
        // Surface the real reason in logs — the default 500 swallows it
        // and the browser just sees "Internal server error" with no clue.
        req.log.error(
          {
            err,
            errMessage: err instanceof Error ? err.message : String(err),
            errStack: err instanceof Error ? err.stack : undefined,
          },
          'kyc.upload failed',
        )
        if (
          err &&
          typeof err === 'object' &&
          'statusCode' in (err as Record<string, unknown>)
        ) {
          throw err
        }
        const message = err instanceof Error ? err.message : 'Upload failed'
        throw app.httpErrors.internalServerError(message)
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
          hasGovIdImage: false,
          hasSelfie: false,
          rejectionReason: null,
          submittedAt: null,
          reviewedAt: null,
        }
      }
      return {
        status: sub.status,
        govIdType: sub.govIdType,
        govIdNumber: sub.govIdNumber,
        hasGovIdImage: !!sub.govIdImageUrl,
        hasSelfie: !!sub.selfieUrl,
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
        hasGovIdImage: !!sub.sub.govIdImageUrl,
        hasSelfie: !!sub.sub.selfieUrl,
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
          govIdProxyPath: proxyPath(s.id, 'gov-id'),
          selfieProxyPath: proxyPath(s.id, 'selfie'),
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
        hasGovIdImage: !!updated.govIdImageUrl,
        hasSelfie: !!updated.selfieUrl,
        rejectionReason: updated.rejectionReason,
        submittedAt: updated.submittedAt.toISOString(),
        reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      }
    },
  )

  /**
   * Auth-gated proxy: streams a KYC photo's bytes to the submission's
   * owner or to an admin. The Vercel Blob URL is private (requires the
   * BLOB_READ_WRITE_TOKEN to read), so we never return it directly to
   * the client — admin and owner UIs use this proxy as `<img src>`.
   *
   * Headers: `Cache-Control: private, no-store` so browsers don't keep
   * the bytes on disk (per Vercel's private-storage guidance).
   */
  app.get(
    '/kyc/photo/:id/:kind',
    {
      schema: {
        params: z.object({
          id: z.string().min(1),
          kind: z.enum(['gov-id', 'selfie']),
        }),
      },
    },
    async (req, reply) => {
      const session = requireSession(req)
      if (!env.BLOB_READ_WRITE_TOKEN) {
        throw app.httpErrors.serviceUnavailable('Uploads not configured')
      }

      const sub = await prisma.kycSubmission.findUnique({
        where: { id: req.params.id },
        select: { userId: true, govIdImageUrl: true, selfieUrl: true },
      })
      if (!sub) throw app.httpErrors.notFound('Submission not found')

      const callerRole = (session.user as { role?: string }).role ?? 'USER'
      const isOwner = sub.userId === session.user.id
      const isAdmin = callerRole === 'ADMIN'
      if (!isOwner && !isAdmin) throw app.httpErrors.forbidden('Forbidden')

      const blobUrl = req.params.kind === 'gov-id' ? sub.govIdImageUrl : sub.selfieUrl
      if (!blobUrl) throw app.httpErrors.notFound('No photo on file')

      // Private blob URLs reject anonymous fetches — bearer auth with our
      // token unlocks the bytes server-side. The browser never sees the
      // upstream URL or the token.
      const upstream = await fetch(blobUrl, {
        headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` },
      })
      if (!upstream.ok || !upstream.body) {
        req.log.warn(
          { status: upstream.status, blobUrl },
          'kyc.photo proxy: upstream fetch failed',
        )
        throw app.httpErrors.badGateway('Could not fetch photo')
      }

      reply.header(
        'content-type',
        upstream.headers.get('content-type') ?? 'application/octet-stream',
      )
      const len = upstream.headers.get('content-length')
      if (len) reply.header('content-length', len)
      reply.header('cache-control', 'private, no-store')
      // Stream the bytes through Fastify. Buffering keeps the code simple
      // and KYC photos are small (<= 8 MB) so the memory pressure is fine.
      const ab = await upstream.arrayBuffer()
      return reply.send(Buffer.from(ab))
    },
  )
}
