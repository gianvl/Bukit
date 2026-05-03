/**
 * Normalizes a Philippine mobile number to E.164: +639XXXXXXXXX.
 * Mirror of apps/api/src/lib/phone.ts so client-side validation matches the server.
 */
export function normalizePHMobile(input: string): string | null {
  if (typeof input !== 'string') return null
  const digits = input.replace(/[^\d]/g, '')
  if (digits.length === 0) return null

  let local: string
  if (digits.startsWith('63') && digits.length === 12) local = digits.slice(2)
  else if (digits.startsWith('0') && digits.length === 11) local = digits.slice(1)
  else if (digits.length === 10) local = digits
  else return null

  if (!local.startsWith('9')) return null
  if (local.length !== 10) return null
  return `+63${local}`
}

export function isValidPHMobile(input: string): boolean {
  return normalizePHMobile(input) !== null
}

/** Formats E.164 +639XXXXXXXXX as "+63 9XX XXX XXXX" for display. */
export function formatPHMobile(e164: string): string {
  if (!e164.startsWith('+639') || e164.length !== 13) return e164
  return `+63 ${e164.slice(3, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}`
}
