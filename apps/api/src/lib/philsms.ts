import { env } from '../env.js'

/**
 * Sends an SMS through PhilSMS v3.
 * Docs: https://philsms.com/docs/api/v3
 *
 * Throws on transport failure or non-success response so the caller can
 * surface the error (Better-Auth's sendOTP propagates it as a sign-in failure).
 */
export async function sendSms({
  to,
  message,
}: {
  /** E.164 phone number, e.g. +639171234567 */
  to: string
  message: string
}): Promise<void> {
  const url = `${env.PHILSMS_BASE_URL.replace(/\/$/, '')}/sms/send`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PHILSMS_API_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: to,
      sender_id: env.PHILSMS_SENDER_ID,
      type: 'plain',
      message,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`PhilSMS send failed: ${res.status} ${body.slice(0, 200)}`)
  }
}
