import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyWebhookSignature } from './helixpay.js'

// Matches env-setup.ts
const SECRET = 'test-helixpay-webhook-secret-1234567890'

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex')
}

describe('verifyWebhookSignature', () => {
  const body = '{"event":"payment.captured","data":{"checkoutId":"abc"}}'

  it('accepts a valid HMAC-SHA256 hex signature', () => {
    expect(verifyWebhookSignature(body, sign(body))).toBe(true)
  })

  it('rejects a tampered body with the same signature', () => {
    const tampered = body.replace('captured', 'failed')
    expect(verifyWebhookSignature(tampered, sign(body))).toBe(false)
  })

  it('rejects a missing signature', () => {
    expect(verifyWebhookSignature(body, undefined)).toBe(false)
  })

  it('rejects a signature of a different length without throwing', () => {
    // timingSafeEqual would throw on mismatched lengths; the wrapper must short-circuit.
    expect(verifyWebhookSignature(body, 'short')).toBe(false)
  })

  it('rejects a same-length but different signature', () => {
    const valid = sign(body)
    const flipped = (valid[0] === '0' ? '1' : '0') + valid.slice(1)
    expect(verifyWebhookSignature(body, flipped)).toBe(false)
  })

  it('accepts a Buffer body equivalent to a string body', () => {
    expect(verifyWebhookSignature(Buffer.from(body, 'utf8'), sign(body))).toBe(true)
  })
})
