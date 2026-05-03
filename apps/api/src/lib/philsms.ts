import { env } from '../env.js'

interface PhilSmsResponse {
  status?: 'success' | 'error'
  message?: string
  data?: unknown
  errors?: unknown
}

/**
 * Sends an SMS through PhilSMS v3.
 * Docs: https://philsms.com/docs/api/v3
 *
 * PhilSMS returns HTTP 200 even on logical failures (rejected sender_id,
 * insufficient balance, malformed recipient). We parse the body and treat
 * `status: "error"` as a thrown failure so callers see real problems.
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
  const payload = {
    recipient: to,
    sender_id: env.PHILSMS_SENDER_ID,
    type: 'plain',
    message,
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PHILSMS_API_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    throw new Error(`PhilSMS request failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  const text = await res.text().catch(() => '')

  let body: PhilSmsResponse | null = null
  try {
    body = text ? (JSON.parse(text) as PhilSmsResponse) : null
  } catch {
    // PhilSMS responded with non-JSON; keep raw text for the error message.
  }

  if (!res.ok) {
    throw new Error(`PhilSMS HTTP ${res.status}: ${body?.message ?? text.slice(0, 200)}`)
  }

  // PhilSMS returns 200 OK with status: "error" on logical failures.
  if (body?.status && body.status !== 'success') {
    throw new Error(
      `PhilSMS rejected send: ${body.message ?? 'unknown error'} (sender_id=${env.PHILSMS_SENDER_ID}, to=${to})`,
    )
  }
}
