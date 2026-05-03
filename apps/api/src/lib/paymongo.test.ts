import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseWebhookEvent, verifyWebhookSignature } from './paymongo.js'

// Matches vitest.config.ts test.env.PAYMONGO_WEBHOOK_SECRET
const SECRET = 'whsk_test_dummy_secret_for_unit_tests'

function header(timestamp: number, body: string, secret: string = SECRET) {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `t=${timestamp},te=${sig}`
}

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ data: { attributes: { type: 'payment.paid' } } })
  const ts = 1_700_000_000

  it('accepts a valid signature against the test (te) field', () => {
    expect(verifyWebhookSignature(body, header(ts, body))).toBe(true)
  })

  it('rejects when the body is tampered', () => {
    const tampered = body.replace('paid', 'failed')
    expect(verifyWebhookSignature(tampered, header(ts, body))).toBe(false)
  })

  it('rejects when only the t= portion is altered (sig was bound to original ts)', () => {
    const tampered = header(ts, body).replace(`t=${ts}`, `t=${ts + 1}`)
    expect(verifyWebhookSignature(body, tampered)).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(verifyWebhookSignature(body, undefined)).toBe(false)
  })

  it('rejects a header missing required parts', () => {
    expect(verifyWebhookSignature(body, 'te=onlysig')).toBe(false)
    expect(verifyWebhookSignature(body, `t=${ts}`)).toBe(false)
  })

  it('rejects a same-length but flipped signature', () => {
    const valid = header(ts, body)
    const flipped = valid.replace(/te=([0-9a-f])/i, (_m, c: string) =>
      `te=${c === '0' ? '1' : '0'}`,
    )
    expect(verifyWebhookSignature(body, flipped)).toBe(false)
  })

  it('handles a Buffer body identically to a string', () => {
    expect(verifyWebhookSignature(Buffer.from(body), header(ts, body))).toBe(true)
  })

  it('falls back to li (live) when te is absent', () => {
    const sig = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')
    expect(verifyWebhookSignature(body, `t=${ts},li=${sig}`)).toBe(true)
  })
})

describe('parseWebhookEvent', () => {
  it('extracts checkout_session.payment.paid with payment id', () => {
    const evt = parseWebhookEvent({
      data: {
        attributes: {
          type: 'checkout_session.payment.paid',
          data: {
            id: 'cs_abc',
            attributes: {
              reference_number: 'booking_xyz',
              payments: [{ id: 'pay_123', attributes: { amount: 50_000, status: 'paid' } }],
            },
          },
        },
      },
    })
    expect(evt).toEqual({
      type: 'checkout_session.payment.paid',
      checkoutId: 'cs_abc',
      paymentId: 'pay_123',
      bookingId: 'booking_xyz',
      amountCentavos: 50_000,
    })
  })

  it('extracts payment.paid', () => {
    const evt = parseWebhookEvent({
      data: {
        attributes: {
          type: 'payment.paid',
          data: { id: 'pay_999', attributes: { amount: 70_000, metadata: { bookingId: 'b1' } } },
        },
      },
    })
    expect(evt).toEqual({
      type: 'payment.paid',
      paymentId: 'pay_999',
      bookingId: 'b1',
      amountCentavos: 70_000,
    })
  })

  it('returns null for unknown event types', () => {
    expect(parseWebhookEvent({ data: { attributes: { type: 'source.chargeable' } } })).toBeNull()
  })

  it('returns null for malformed payloads', () => {
    expect(parseWebhookEvent({})).toBeNull()
    expect(parseWebhookEvent(null)).toBeNull()
  })
})
