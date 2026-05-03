import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env.js'

export interface CreateCheckoutInput {
  bookingId: string
  amountCentavos: number
  currency: 'PHP'
  customerEmail: string
  customerName: string
  description: string
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSession {
  checkoutId: string
  checkoutUrl: string
}

/**
 * Creates a HelixPay checkout session and returns a redirect URL for the user.
 *
 * NOTE: This is currently a sandbox stub. Replace the body with the real
 * HelixPay API call once their checkout endpoint and request shape are wired:
 *
 *   POST {HELIXPAY_BASE_URL}/v1/checkouts
 *   Authorization: Bearer {HELIXPAY_API_KEY}
 *
 * The returned `checkoutId` is persisted on the Payment row so we can
 * correlate webhooks back to the booking.
 */
export async function createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
  if (env.HELIXPAY_API_KEY === 'sandbox-helixpay-api-key') {
    // Local sandbox: mint a fake checkout id and point at a stub URL.
    const checkoutId = `sbx_${input.bookingId}_${Date.now()}`
    const checkoutUrl = `${env.HELIXPAY_BASE_URL}/sandbox/checkout/${checkoutId}`
    return { checkoutId, checkoutUrl }
  }

  // TODO: replace with real HelixPay request once integration is approved.
  throw new Error('HelixPay live integration not implemented yet')
}

/**
 * Verifies an incoming webhook signature using HMAC-SHA256 over the raw body.
 * Adjust the signature header name and digest format to match HelixPay's spec.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  if (!signature) return false

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)
  const expected = createHmac('sha256', env.HELIXPAY_WEBHOOK_SECRET).update(body).digest('hex')

  const sigBuf = Buffer.from(signature, 'utf8')
  const expBuf = Buffer.from(expected, 'utf8')
  if (sigBuf.length !== expBuf.length) return false
  return timingSafeEqual(sigBuf, expBuf)
}
