import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env.js'

const PAYMENT_METHODS = ['card', 'gcash', 'paymaya', 'qrph', 'grab_pay'] as const

export interface CreateCheckoutInput {
  bookingId: string
  amountCentavos: number
  description: string
  customerEmail: string
  customerName: string
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSession {
  checkoutId: string
  checkoutUrl: string
}

interface PayMongoCheckoutResponse {
  data: {
    id: string
    attributes: {
      checkout_url: string
    }
  }
}

interface PayMongoErrorResponse {
  errors: Array<{ code?: string; detail?: string; status?: number }>
}

function authHeader(): string {
  // PayMongo uses HTTP Basic with the secret key as username and an empty password.
  return `Basic ${Buffer.from(`${env.PAYMONGO_SECRET_KEY}:`).toString('base64')}`
}

async function paymongoFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.PAYMONGO_BASE_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 300)
    try {
      const parsed = JSON.parse(text) as PayMongoErrorResponse
      detail = parsed.errors?.map((e) => e.detail).filter(Boolean).join('; ') || detail
    } catch {
      // not JSON — keep raw
    }
    throw new Error(`PayMongo ${path} failed: ${res.status} ${detail}`)
  }
  return JSON.parse(text) as T
}

/**
 * Creates a PayMongo Checkout Session and returns the redirect URL.
 * Docs: https://developers.paymongo.com/reference/checkout-session-resource
 */
export async function createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
  const payload = {
    data: {
      attributes: {
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        line_items: [
          {
            currency: 'PHP',
            amount: input.amountCentavos,
            name: input.description,
            quantity: 1,
          },
        ],
        payment_method_types: PAYMENT_METHODS,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        description: input.description,
        reference_number: input.bookingId,
        billing: {
          name: input.customerName,
          email: input.customerEmail,
        },
        metadata: {
          bookingId: input.bookingId,
        },
      },
    },
  }

  const res = await paymongoFetch<PayMongoCheckoutResponse>('/checkout_sessions', payload)
  return {
    checkoutId: res.data.id,
    checkoutUrl: res.data.attributes.checkout_url,
  }
}

interface PayMongoRefundResponse {
  data: { id: string }
}

/**
 * Issues a refund against a captured payment.
 * Docs: https://developers.paymongo.com/reference/create-refund
 */
export async function refundPayment(
  paymentId: string,
  amountCentavos: number,
): Promise<{ refundId: string }> {
  const payload = {
    data: {
      attributes: {
        amount: amountCentavos,
        payment_id: paymentId,
        reason: 'requested_by_customer',
      },
    },
  }
  const res = await paymongoFetch<PayMongoRefundResponse>('/refunds', payload)
  return { refundId: res.data.id }
}

/**
 * Verifies the `Paymongo-Signature` header.
 * Format: `t=<timestamp>,te=<test_signature>,li=<live_signature>`
 *   - HMAC-SHA256(secret, `${timestamp}.${rawBody}`) → hex
 *   - `te` is checked when secret starts with `whsk_test_*` or for any test webhook
 *   - `li` is for live mode
 *
 * If `PAYMONGO_WEBHOOK_SECRET` is unset (dev convenience), verification is skipped
 * and `true` is returned. Set the secret in production.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  header: string | undefined,
): boolean {
  const secret = env.PAYMONGO_WEBHOOK_SECRET
  if (!secret) return true // dev mode: no secret configured

  if (!header) return false
  const parts = parseSignatureHeader(header)
  if (!parts.t || (!parts.te && !parts.li)) return false

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody
  const expected = createHmac('sha256', secret).update(`${parts.t}.${body}`).digest('hex')
  const candidate = parts.te ?? parts.li ?? ''

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(candidate, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function parseSignatureHeader(header: string): { t?: string; te?: string; li?: string } {
  const out: { t?: string; te?: string; li?: string } = {}
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2)
    if (!k || v === undefined) continue
    const key = k.trim()
    const value = v.trim()
    if (key === 't' || key === 'te' || key === 'li') {
      out[key] = value
    }
  }
  return out
}

/* ─── Webhook payload typing ─────────────────────────────────────────── */

export type PayMongoEventType =
  | 'checkout_session.payment.paid'
  | 'payment.paid'
  | 'payment.failed'
  | 'payment.refunded'

export interface PayMongoEvent {
  type: PayMongoEventType
  /** PayMongo payment id (pay_*) */
  paymentId?: string
  /** PayMongo checkout session id (cs_*) — for checkout_session events */
  checkoutId?: string
  /** Booking id we attached as reference_number/metadata.bookingId */
  bookingId?: string
  amountCentavos?: number
}

interface RawWebhookPayload {
  data?: {
    attributes?: {
      type?: string
      data?: {
        id?: string
        type?: string
        attributes?: {
          amount?: number
          reference_number?: string
          metadata?: { bookingId?: string }
          payments?: Array<{ id?: string; attributes?: { amount?: number; status?: string } }>
        }
      }
    }
  }
}

/**
 * Normalizes the PayMongo webhook payload into a flat event we can act on.
 * Returns null when the event type is one we don't handle.
 */
export function parseWebhookEvent(raw: unknown): PayMongoEvent | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as RawWebhookPayload
  const type = r.data?.attributes?.type
  if (!type) return null
  if (
    type !== 'checkout_session.payment.paid' &&
    type !== 'payment.paid' &&
    type !== 'payment.failed' &&
    type !== 'payment.refunded'
  ) {
    return null
  }

  const inner = r.data?.attributes?.data
  const innerAttrs = inner?.attributes

  if (type === 'checkout_session.payment.paid') {
    const firstPayment = innerAttrs?.payments?.[0]
    return {
      type,
      checkoutId: inner?.id,
      paymentId: firstPayment?.id,
      bookingId: innerAttrs?.reference_number ?? innerAttrs?.metadata?.bookingId,
      amountCentavos: firstPayment?.attributes?.amount,
    }
  }

  return {
    type,
    paymentId: inner?.id,
    bookingId: innerAttrs?.metadata?.bookingId,
    amountCentavos: innerAttrs?.amount,
  }
}
