import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireSession } from '../lib/auth-fastify.js'
import { MIN_PAYOUT_CENTAVOS } from '../lib/payouts.js'

/**
 * Provider-facing earnings + payout-method routes.
 *
 * Disbursement is manual today: an admin reviews PENDING payouts whose
 * `eligibleAt` has passed and marks them PAID with a reference. When we
 * wire PayMongo Disbursements later, the same `Payout` rows feed it.
 */

const PayoutMethodTypeEnum = z.enum(['GCASH', 'BANK'])

const PayoutMethodDto = z.object({
  id: z.string(),
  type: PayoutMethodTypeEnum,
  holderName: z.string(),
  /** Always returned masked for safety, e.g. "•••• 4321". */
  accountIdentifierMasked: z.string(),
  bankCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const UpsertPayoutMethodBody = z.object({
  type: PayoutMethodTypeEnum,
  holderName: z.string().min(2).max(100),
  accountIdentifier: z.string().min(4).max(50),
  bankCode: z.string().max(20).optional(),
})

const PayoutStatusEnum = z.enum(['PENDING', 'PAID', 'VOID'])

const PayoutDto = z.object({
  id: z.string(),
  bookingId: z.string(),
  status: PayoutStatusEnum,
  grossCentavos: z.int(),
  feeCentavos: z.int(),
  netCentavos: z.int(),
  eligibleAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  referenceCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Booking summary for "what was this for?" context. */
  booking: z.object({
    serviceTierName: z.string(),
    scheduledAt: z.iso.datetime(),
    paymentMethod: z.enum(['ONLINE', 'CASH']),
  }),
})

const EarningsDto = z.object({
  /** Net of all provider-owed money currently in PENDING payouts (signed). */
  pendingCentavos: z.int(),
  /** Subset of pending that has passed cooldown — disbursable today. */
  availableCentavos: z.int(),
  /** Lifetime PAID net (positive). */
  paidLifetimeCentavos: z.int(),
  /** Sum of negative-net PENDING payouts — fees we owe ourselves from cash. */
  cashOwedCentavos: z.int(),
  /** Minimum batch size before "Request payout" is allowed. */
  minPayoutCentavos: z.int(),
  /** Caller's payout destination, or null if none. */
  payoutMethod: PayoutMethodDto.nullable(),
  /** Most recent payouts (any status), capped server-side. */
  history: z.array(PayoutDto),
})

function maskIdentifier(identifier: string): string {
  const cleaned = identifier.replace(/\s+/g, '')
  if (cleaned.length <= 4) return '••••'
  return `•••• ${cleaned.slice(-4)}`
}

function methodToDto(m: {
  id: string
  type: 'GCASH' | 'BANK'
  holderName: string
  accountIdentifier: string
  bankCode: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: m.id,
    type: m.type,
    holderName: m.holderName,
    accountIdentifierMasked: maskIdentifier(m.accountIdentifier),
    bankCode: m.bankCode,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}

export const payoutRoutes: FastifyPluginAsyncZod = async (app) => {
  /** Earnings overview: balances + payout method + recent history. */
  app.get(
    '/me/earnings',
    {
      schema: { response: { 200: EarningsDto } },
    },
    async (req) => {
      const session = requireSession(req)
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true, payoutMethod: true },
      })
      if (!profile) throw app.httpErrors.forbidden('Not a provider')

      const now = new Date()
      const [pendingAgg, availableAgg, paidAgg, cashOwedAgg, history] =
        await Promise.all([
          prisma.payout.aggregate({
            where: { providerId: profile.id, status: 'PENDING' },
            _sum: { netCentavos: true },
          }),
          prisma.payout.aggregate({
            where: {
              providerId: profile.id,
              status: 'PENDING',
              eligibleAt: { lte: now },
            },
            _sum: { netCentavos: true },
          }),
          prisma.payout.aggregate({
            where: { providerId: profile.id, status: 'PAID' },
            _sum: { netCentavos: true },
          }),
          // Negative-net PENDING entries = unsettled cash-fee debits.
          prisma.payout.aggregate({
            where: {
              providerId: profile.id,
              status: 'PENDING',
              netCentavos: { lt: 0 },
            },
            _sum: { netCentavos: true },
          }),
          prisma.payout.findMany({
            where: { providerId: profile.id },
            orderBy: { createdAt: 'desc' },
            take: 30,
            include: {
              booking: {
                select: {
                  scheduledAt: true,
                  paymentMethod: true,
                  serviceTier: { select: { name: true } },
                },
              },
            },
          }),
        ])

      return {
        pendingCentavos: pendingAgg._sum.netCentavos ?? 0,
        availableCentavos: availableAgg._sum.netCentavos ?? 0,
        paidLifetimeCentavos: paidAgg._sum.netCentavos ?? 0,
        // cashOwedAgg is negative (sum of negatives); flip to a positive "owed" number.
        cashOwedCentavos: Math.abs(cashOwedAgg._sum.netCentavos ?? 0),
        minPayoutCentavos: MIN_PAYOUT_CENTAVOS,
        payoutMethod: profile.payoutMethod ? methodToDto(profile.payoutMethod) : null,
        history: history.map((p) => ({
          id: p.id,
          bookingId: p.bookingId,
          status: p.status,
          grossCentavos: p.grossCentavos,
          feeCentavos: p.feeCentavos,
          netCentavos: p.netCentavos,
          eligibleAt: p.eligibleAt.toISOString(),
          paidAt: p.paidAt?.toISOString() ?? null,
          referenceCode: p.referenceCode,
          createdAt: p.createdAt.toISOString(),
          booking: {
            serviceTierName: p.booking.serviceTier.name,
            scheduledAt: p.booking.scheduledAt.toISOString(),
            paymentMethod: p.booking.paymentMethod,
          },
        })),
      }
    },
  )

  /**
   * Replace (or set) the caller's payout method. v1 supports a single
   * destination per provider; we upsert in place.
   */
  app.put(
    '/me/payout-method',
    {
      schema: {
        body: UpsertPayoutMethodBody,
        response: { 200: PayoutMethodDto },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (!profile) throw app.httpErrors.forbidden('Not a provider')

      const data = {
        type: req.body.type,
        holderName: req.body.holderName.trim(),
        accountIdentifier: req.body.accountIdentifier.trim(),
        bankCode: req.body.type === 'BANK' ? req.body.bankCode ?? null : null,
      }
      const method = await prisma.providerPayoutMethod.upsert({
        where: { providerProfileId: profile.id },
        create: { providerProfileId: profile.id, ...data },
        update: data,
      })
      return methodToDto(method)
    },
  )

  /**
   * Provider-initiated payout request. Surfaces an admin-visible signal
   * (TODO: replace with PayMongo Disbursements). We refuse if no method is
   * linked OR if the available balance is below the minimum. We do not
   * mutate any rows yet — admin reviews the existing PENDING+eligible queue.
   */
  app.post(
    '/me/payouts/request',
    {
      schema: {
        response: {
          200: z.object({
            ok: z.literal(true),
            availableCentavos: z.int(),
          }),
        },
      },
    },
    async (req) => {
      const session = requireSession(req)
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true, payoutMethod: { select: { id: true } } },
      })
      if (!profile) throw app.httpErrors.forbidden('Not a provider')
      if (!profile.payoutMethod) {
        throw app.httpErrors.unprocessableEntity('Add a payout method first')
      }

      const now = new Date()
      const agg = await prisma.payout.aggregate({
        where: {
          providerId: profile.id,
          status: 'PENDING',
          eligibleAt: { lte: now },
        },
        _sum: { netCentavos: true },
      })
      const available = agg._sum.netCentavos ?? 0
      if (available < MIN_PAYOUT_CENTAVOS) {
        throw app.httpErrors.badRequest(
          `Minimum payout is ₱${(MIN_PAYOUT_CENTAVOS / 100).toFixed(0)}`,
        )
      }
      // Manual disbursement queue: the request itself is the signal. Admin
      // tooling later turns these into PAID rows with a reference code.
      req.log.info(
        { providerId: profile.id, availableCentavos: available },
        'payout requested',
      )
      return { ok: true as const, availableCentavos: available }
    },
  )
}
