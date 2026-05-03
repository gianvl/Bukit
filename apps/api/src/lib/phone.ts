/**
 * Normalizes a Philippine mobile number to E.164: +639XXXXXXXXX.
 *
 * Accepts:
 *   "09171234567"     → "+639171234567"
 *   "9171234567"      → "+639171234567"
 *   "639171234567"    → "+639171234567"
 *   "+639171234567"   → "+639171234567"
 *   "+63 917 123 4567" → "+639171234567"
 *
 * Returns null for anything else (landlines, non-PH numbers, malformed).
 */
export function normalizePHMobile(input: string): string | null {
  if (typeof input !== 'string') return null
  const digits = input.replace(/[^\d]/g, '')
  if (digits.length === 0) return null

  let local: string
  if (digits.startsWith('63') && digits.length === 12) {
    local = digits.slice(2)
  } else if (digits.startsWith('0') && digits.length === 11) {
    local = digits.slice(1)
  } else if (digits.length === 10) {
    local = digits
  } else {
    return null
  }

  // PH mobile numbers always start with 9 in the local form.
  if (!local.startsWith('9')) return null
  if (local.length !== 10) return null

  return `+63${local}`
}

export function isValidPHMobile(input: string): boolean {
  return normalizePHMobile(input) !== null
}
